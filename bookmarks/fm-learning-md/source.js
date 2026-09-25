/**
 * @name    FM 學習卡轉 Markdown
 * @version 1.1.0
 * @desc    Frontend Masters Learning Mode：把目前的 Quiz / Flashcard 轉成 Markdown 並複製
 *
 * 建置：npm run build -- fm-learning-md
 */
(function () {
  /* @include toast */
  /* @include clipboard */
  /* @include lm-md */

  var d = document;
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

  function done(md) {
    copyText(md, function (ok) {
      toast(ok ? '已複製' : '複製失敗', ok ? 'success' : 'error');
    });
  }

  var quiz = d.querySelector('.LM-Quiz');
  var card = d.querySelector('.LM-Flashcard');

  if (quiz) {
    var qEl = quiz.querySelector('.LM-Quiz-question');
    // 正解：舊版以 class 標記，新版以 data-state 標記（correct = 使用者選對，missed = 使用者沒選到的正解）
    var opts = quiz.querySelectorAll(
      '.LM-Quiz-option.is-correct, .LM-Quiz-option.is-missed,' +
        '.LM-Quiz-option[data-state="correct"], .LM-Quiz-option[data-state="missed"]'
    );
    if (!qEl) {
      toast('找不到題目內容', 'error');
      return;
    }
    // 題目含 code block：整段改用 HTML，讓題目與程式碼一起顯示在 <summary>（收合時可見）
    var html = !!qEl.querySelector('pre');
    var answers = [];
    for (var i = 0; i < opts.length; i++) {
      var tEl = opts[i].querySelector('.LM-Quiz-option-text');
      var a = tEl && (html ? toHtml(tEl) : toMd(tEl));
      if (a) answers.push(a);
    }
    if (!answers.length) {
      toast('尚未送出答案', 'error');
      return;
    }

    if (html) {
      var ansHtml = answers.length > 1 ? '<ul><li>' + answers.join('</li><li>') + '</li></ul>' : answers[0];
      // v-pre：VitePress（Vue）不解析內容中的 {{ }}；Obsidian 會忽略此屬性
      done('<details v-pre>\n<summary>' + toHtml(qEl) + '</summary>\n' + ansHtml + '\n</details>');
      return;
    }

    var q = toMd(qEl).replace(/\s+/g, ' ');
    if (!q) {
      toast('找不到題目內容', 'error');
      return;
    }
    var multiline = /\n/.test(answers.join(''));
    // 多個正解用清單；答案本身有多行（例如含 code block）時改以空行分隔，避免破壞清單
    var ans =
      answers.length < 2 ? answers[0] : multiline ? answers.join('\n\n') : '- ' + answers.join('\n- ');
    // 答案含 code block 時 </summary> 後要空一行，Markdown 才會被渲染
    done('<details>\n<summary>' + q + '</summary>\n' + (multiline ? '\n' : '') + ans + '\n</details>');
  } else if (card) {
    var front = card.querySelector('.LM-Flashcard-front .LM-Flashcard-text');
    var back = card.querySelector('.LM-Flashcard-back .LM-Flashcard-text');
    var f = front && toMd(front);
    var b = back && toMd(back);
    if (!f || !b) {
      toast('找不到 flashcard 內容', 'error');
      return;
    }
    done('### ' + f + '\n\n' + b);
  } else {
    toast('找不到 Quiz 或 Flashcard', 'error');
  }
})();
