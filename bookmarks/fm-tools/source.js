/**
 * @name    Master.dev 工具
 * @version 1.0.0
 * @desc    Frontend Masters：浮動面板整合「目前這題轉 MD」「學習卡批次複製」「逐字稿複製」，附快捷鍵 ⌥⇧1~3
 *
 * 建置：npm run build -- fm-tools
 */
(function () {
  /* @include toast */
  /* @include clipboard */
  /* @include copy-prompt */
  /* @include lm-md */
  /* @include panel */

  var d = document;
  var root = d.documentElement;
  var ID = '__bmt_fm_tools__';
  var VERSION = '1.0.0';

  // 重複點書籤：同版本的面板已存在就展開，不建立第二個。
  // 不同版本（使用者換了新版書籤）：舊面板閒置時換成新版；執行中則請使用者稍後再試
  var old = d.getElementById(ID);
  if (old && old.__bmtPanel) {
    if (old.getAttribute('data-__bmt_ver') === VERSION) return old.__bmtPanel.expand();
    if (old.__bmtPanel.busy()) return toast('舊版面板執行中，請稍後再點一次', 'error');
    old.__bmtPanel.close();
  }
  if (old && old.parentNode) old.parentNode.removeChild(old);

  function q(sel) {
    return d.querySelector(sel);
  }

  // =====================================================================
  // 1. 目前這題轉 MD（移植自 fm-learning-md v1.1.0）
  // =====================================================================

  function esc(t) {
    return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /**
   * 元素 → HTML（用於題目含 code block 的 Quiz）：文字跳脫並折疊空白，
   * 行內 <code> 保留，<pre> 輸出 <pre><code>。
   * 整段 <details> 在 Markdown 中是 HTML 區塊，遇到空行就會結束，
   * 所以程式碼中的空行改成只含 &#32;（空白）的一行。
   */
  function toHtml(el) {
    var out = '';
    var afterPre = false;
    for (var n = el.firstChild; n; n = n.nextSibling) {
      var part = '';
      if (n.nodeType === 3) {
        part = esc(n.nodeValue).replace(/\s+/g, ' ');
      } else if (n.nodeType === 1) {
        if (n.tagName === 'PRE') {
          var lines = esc(codeOf(n)).split('\n');
          for (var i = 0; i < lines.length; i++) if (!/\S/.test(lines[i])) lines[i] = '&#32;';
          part = '<pre><code>' + lines.join('\n') + '</code></pre>';
        } else if (n.tagName === 'CODE') {
          part = '<code>' + esc(n.textContent).replace(/\s+/g, ' ') + '</code>';
        } else {
          part = toHtml(n);
          if (BLOCK.test(n.tagName)) part = part ? ' ' + part + ' ' : ' '; // 區塊元素之間以空格分隔，避免文字黏在一起
        }
      }
      if (!part) continue;
      if (afterPre || /^ *<pre>/.test(part)) {
        // <pre> 前後各剛好一個換行：去掉相鄰空白，且絕不產生空行
        out = out.replace(/ +$/, '');
        part = part.replace(/^ +/, '');
        if (!part) continue; // </pre> 後的純空白：略過，仍視為緊接在 </pre> 之後
        if (out && !/\n$/.test(out)) out += '\n';
      } else if (/ $/.test(out) && /^ /.test(part)) {
        part = part.slice(1);
      }
      out += part;
      afterPre = /<\/pre> *$/.test(part);
    }
    return out.replace(/^ +| +$/g, '');
  }

  /** 把目前的 Quiz／Flashcard 轉成 Markdown；失敗時回傳 { error }。 */
  function currentMd() {
    var quiz = q('.LM-Quiz');
    var card = q('.LM-Flashcard');

    if (quiz) {
      var qEl = quiz.querySelector('.LM-Quiz-question');
      // 正解：舊版以 class 標記，新版以 data-state 標記（correct = 使用者選對，missed = 使用者沒選到的正解）
      var opts = quiz.querySelectorAll(
        '.LM-Quiz-option.is-correct, .LM-Quiz-option.is-missed,' +
          '.LM-Quiz-option[data-state="correct"], .LM-Quiz-option[data-state="missed"]'
      );
      if (!qEl) return { error: '找不到題目內容' };
      // 題目含 code block：整段改用 HTML，讓題目與程式碼一起顯示在 <summary>（收合時可見）
      var html = !!qEl.querySelector('pre');
      var answers = [];
      for (var i = 0; i < opts.length; i++) {
        var tEl = opts[i].querySelector('.LM-Quiz-option-text');
        var a = tEl && (html ? toHtml(tEl) : toMd(tEl));
        if (a) answers.push(a);
      }
      if (!answers.length) return { error: '尚未送出答案' };

      if (html) {
        var ansHtml = answers.length > 1 ? '<ul><li>' + answers.join('</li><li>') + '</li></ul>' : answers[0];
        // v-pre：VitePress（Vue）不解析內容中的 {{ }}；Obsidian 會忽略此屬性
        return { md: '<details v-pre>\n<summary>' + toHtml(qEl) + '</summary>\n' + ansHtml + '\n</details>' };
      }

      var question = toMd(qEl).replace(/\s+/g, ' ');
      if (!question) return { error: '找不到題目內容' };
      var multiline = /\n/.test(answers.join(''));
      // 多個正解用清單；答案本身有多行（例如含 code block）時改以空行分隔，避免破壞清單
      var ans =
        answers.length < 2 ? answers[0] : multiline ? answers.join('\n\n') : '- ' + answers.join('\n- ');
      // 答案含 code block 時 </summary> 後要空一行，Markdown 才會被渲染
      return { md: '<details>\n<summary>' + question + '</summary>\n' + (multiline ? '\n' : '') + ans + '\n</details>' };
    }
    if (card) {
      var front = card.querySelector('.LM-Flashcard-front .LM-Flashcard-text');
      var back = card.querySelector('.LM-Flashcard-back .LM-Flashcard-text');
      var f = front && toMd(front);
      var b = back && toMd(back);
      if (!f || !b) return { error: '找不到 flashcard 內容' };
      return { md: '### ' + f + '\n\n' + b };
    }
    return { error: '找不到 Quiz 或 Flashcard' };
  }

  function copyCurrent(ctx) {
    var r = currentMd();
    if (r.error) {
      toast(r.error, 'error');
      return ctx.done();
    }
    copyText(r.md, function (ok) {
      toast(ok ? '已複製' : '複製失敗', ok ? 'success' : 'error');
      ctx.done();
    });
  }

  // =====================================================================
  // 2. 學習卡批次複製（移植自 fm-flashcard-batch v1.0.0）
  // =====================================================================

  var MAX = 100; // 安全上限：回到第一張、擷取各最多 100 次
  var WAIT_MS = 3000; // 點擊後等待卡片更新的上限
  var POLL_MS = 100;
  var BATCH_FLAG = 'data-__bmt_fm_batch'; // 執行中標記（時間戳，每一步更新）；與舊版書籤共用，避免同時執行

  /** 可點擊的按鈕；不存在或 disabled 時回傳 null。 */
  function button(sel) {
    var b = q(sel);
    return b && !b.disabled ? b : null;
  }

  /** 目前卡片的快照：正反面的節點與文字。 */
  function snap() {
    var f = q('.LM-Flashcard-front .LM-Flashcard-text');
    var b = q('.LM-Flashcard-back .LM-Flashcard-text');
    return { f: f, b: b, ft: f ? f.textContent : '', bt: b ? b.textContent : '' };
  }

  function sideChanged(a, b, side) {
    return a[side] !== b[side] || a[side + 't'] !== b[side + 't'];
  }

  function same(a, b) {
    return !sideChanged(a, b, 'f') && !sideChanged(a, b, 'b');
  }

  function batchCopy(ctx) {
    if (!q('.LM-Flashcard')) {
      toast('找不到 flashcard 內容', 'error');
      return ctx.done();
    }
    if (Date.now() - (+root.getAttribute(BATCH_FLAG) || 0) < WAIT_MS + 1000) {
      toast('批次複製執行中', 'info'); // 舊版書籤正在跑
      return ctx.done();
    }
    removeCopyPrompt();

    var steps = 0;
    var cards = [];
    var skipped = 0;

    function beat() {
      root.setAttribute(BATCH_FLAG, Date.now());
    }

    /**
     * 點擊按鈕，等待換成另一張卡：正面與背面（節點或文字）都已改變，且連續兩次檢查結果相同，
     * 避免擷取到「新正面 + 舊背面」。逾時時只要有任一面改變就視為已換卡
     * （例如相鄰兩張的背面剛好相同且節點被重用）。
     * cb(true) = 已換卡；cb(false) = 逾時仍未變化。
     */
    function advance(btn, cb) {
      var before = snap();
      var last = null;
      var t0 = Date.now(); // 以實際經過時間計算逾時（背景分頁的計時器可能被延遲）
      btn.click();
      (function poll() {
        beat();
        var cur = snap();
        var both = sideChanged(cur, before, 'f') && sideChanged(cur, before, 'b');
        if (both && last && same(cur, last)) return cb(true);
        if (Date.now() - t0 >= WAIT_MS) return cb(!same(cur, before));
        last = cur;
        setTimeout(poll, POLL_MS);
      })();
    }

    // 回到第一張：一直點 Previous，直到它不存在或 disabled
    function rewind() {
      beat();
      var prev = button('.LM-Content-Actions-prev-btn');
      if (!prev) return collect();
      if (++steps > MAX) return fail();
      toast('回到第一張…', 'info', 0);
      ctx.progress('回到第一張');
      advance(prev, function (ok) {
        if (!ok) return fail();
        if (q('.LM-Flashcard')) return rewind();
        // Previous 離開了 flashcard（進到前一個學習步驟）：點一次 Next 回到第一張卡
        var next = button('.LM-Content-Actions-next-btn');
        if (!next) return fail();
        advance(next, function (ok2) {
          if (ok2 && q('.LM-Flashcard')) collect();
          else fail();
        });
      });
    }

    function fail() {
      root.removeAttribute(BATCH_FLAG);
      toast('無法回到第一張', 'error');
      ctx.done();
    }

    // 逐張擷取，直到 Next 不存在或 disabled
    function collect() {
      beat();
      // Next 離開了 flashcard（進到下一個學習步驟）：視為結束
      if (!q('.LM-Flashcard')) return finish('');
      var n = cards.length + skipped + 1;
      toast('複製中… 第 ' + n + ' 張', 'info', 0);
      ctx.progress('第 ' + n + ' 張');
      var s = snap();
      var front = s.f && toMd(s.f);
      var back = s.b && toMd(s.b);
      if (front && back) cards.push('### ' + front + '\n\n' + back);
      else skipped++;

      if (cards.length + skipped >= MAX) return finish('（達上限中止）');
      var next = button('.LM-Content-Actions-next-btn');
      if (!next) return finish('');
      advance(next, function (ok) {
        if (ok) collect();
        else finish('（逾時中止）');
      });
    }

    // 合併並複製；複製失敗時顯示「點此複製」按鈕
    function finish(note) {
      root.removeAttribute(BATCH_FLAG);
      if (!cards.length) toast('找不到 flashcard 內容', 'error');
      else
        copyOrPrompt(
          cards.join('\n\n'),
          '已複製 ' + cards.length + ' 題' + (skipped ? '，略過 ' + skipped + ' 張' : '') + note,
          '已擷取 ' + cards.length + ' 題，點此複製'
        );
      ctx.done();
    }

    rewind();
  }

  // =====================================================================
  // 3. 逐字稿複製（移植自 fm-transcript-copy v1.1.0，新增：複製成功後關閉自己打開的面板）
  // =====================================================================

  var OPEN_FLAG = 'data-__bmt_fm_opening'; // 與舊版書籤共用
  var TS_BTN = '.FMPlayer2-RibbonButton[data-fmp-tooltip^="Transcripts"]';
  var TS_ACTIVE = '.FMPlayer2-Transcripts.active';

  /** 抓取並整理逐字稿；找不到回傳空字串。 */
  function grab() {
    // class 為主、data 屬性為備援；兩者重疊時 querySelectorAll 不會重複，且維持文件順序
    var lines = d.querySelectorAll('.transcripts a.line, [data-transcript-content] a.line');
    // 行內的換行、連續空白折疊成一個空格；行與行之間以空格連接
    var parts = [];
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].textContent.replace(/\s+/g, ' ').replace(/^ | $/g, '');
      if (t) parts.push(t);
    }
    return parts.join(' ');
  }

  function copyTranscript(ctx) {
    var opened = false; // 面板是否由這次執行打開

    /** partial：逾時時內容可能還沒載完，保留面板讓使用者可以再複製一次。 */
    function copy(text, partial) {
      copyText(text, function (ok) {
        toast(ok ? '已複製' : '複製失敗', ok ? 'success' : 'error');
        // 只在複製成功、且面板是自己打開的時候關閉；失敗或逾時時保留，重試可直接複製。
        // 按鈕是開關式：確認面板仍是開啟狀態（.active）才點，避免反過來把它打開
        if (ok && opened && !partial && q(TS_ACTIVE)) {
          var b = q(TS_BTN);
          if (b) b.click();
        }
        ctx.done();
      });
    }

    var text = grab();
    if (text) return copy(text);

    // 面板已開啟（只是還沒載入）或上一次執行仍在等待中時不點按鈕：按鈕是開關式，再點會關掉面板
    var busy = Date.now() - (+root.getAttribute(OPEN_FLAG) || 0) < WAIT_MS;
    if (!busy && !q(TS_ACTIVE)) {
      var btn = q(TS_BTN);
      if (!btn) {
        toast('找不到逐字稿內容，請先開啟 Transcripts', 'error');
        return ctx.done();
      }
      btn.click();
      opened = true;
    }
    root.setAttribute(OPEN_FLAG, Date.now());
    toast('正在開啟 Transcripts…', 'info', 0);
    ctx.progress('載入中');

    // 輪詢到內容「連續兩次相同」才複製，避免面板分批渲染時只抓到前幾行
    var waited = 0;
    var last = '';
    (function poll() {
      var t = grab();
      var timeout = (waited += POLL_MS) > WAIT_MS;
      if (t && (t === last || timeout)) {
        root.removeAttribute(OPEN_FLAG);
        return copy(t, t !== last);
      }
      if (timeout) {
        root.removeAttribute(OPEN_FLAG);
        toast('已開啟 Transcripts 但抓不到逐字稿，請稍後再試', 'error');
        return ctx.done();
      }
      last = t;
      setTimeout(poll, POLL_MS);
    })();
  }

  // =====================================================================
  // 面板
  // =====================================================================

  createPanel({
    id: ID,
    title: 'Master.dev 工具',
    mini: 'Master.dev',
    version: VERSION,
    footer: 'v' + VERSION + ' · 拖曳標題列移動',
    commands: [
      {
        id: 'md',
        key: '1',
        label: '目前這題轉 MD',
        icon: [['path', { d: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z' }],
          ['path', { d: 'M14 3v5h5' }], ['path', { d: 'M9 13h6M9 17h4' }]],
        run: copyCurrent
      },
      {
        id: 'batch',
        key: '2',
        label: '學習卡批次複製',
        icon: [['path', { d: 'M12 3L3 8l9 5 9-5z' }], ['path', { d: 'M3 12.5l9 5 9-5' }], ['path', { d: 'M3 17l9 5 9-5' }]],
        run: batchCopy
      },
      {
        id: 'transcript',
        key: '3',
        label: '逐字稿複製',
        icon: [['rect', { x: 3, y: 5, width: 18, height: 14, rx: 2 }], ['path', { d: 'M7 10h4M13 10h4M7 14h7M16 14h1' }]],
        run: copyTranscript
      }
    ]
  });
})();
