/**
 * @name    FM 學習卡轉 Markdown
 * @version 1.0.0
 * @desc    Frontend Masters Learning Mode：把目前的 Quiz / Flashcard 轉成 Markdown 並複製
 *
 * 建置：npm run build -- fm-learning-md
 */
(function () {
  /* @include toast */
  /* @include clipboard */

  var d = document;
  var BLOCK = /^(P|DIV|LI|UL|OL|BR|H[1-6]|BLOCKQUOTE)$/;

  function fence(pre) {
    var codeEl = pre.querySelector('code');
    var code = (codeEl || pre).textContent.replace(/\n+$/, '');
    return '```javascript\n' + code + '\n```';
  }

  /** 行內 code：內容含反引號時改用雙反引號包住。 */
  function inline(text) {
    return text.indexOf('`') < 0 ? '`' + text + '`' : '`` ' + text + ' ``';
  }

  /** 結尾補一個換行（已有換行或內容為空時不補）。 */
  function newline(st) {
    if (st.out && !/\n$/.test(st.out)) st.out += '\n';
  }

  /**
   * 元素 → Markdown（結果累積在 st.out）：
   * <pre> 轉 fenced code block（語言固定 javascript），前後剛好一個換行；
   * 行內 <code> 轉反引號；區塊元素之間以單一換行分隔；其他標籤只取文字。
   * st.codes 為陣列時，code block 改收集到陣列中，不放在原位。
   */
  function walk(el, st) {
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) {
        var t = n.nodeValue;
        if (/^\s*$/.test(t) && t.indexOf('\n') >= 0) newline(st); // 排版用的換行
        else st.out += t;
      } else if (n.nodeType === 1) {
        if (n.tagName === 'PRE') {
          if (st.codes) {
            st.codes.push(fence(n));
            st.out += ' ';
          } else {
            st.out = st.out.replace(/\s+$/, '');
            if (st.out) st.out += /```$/.test(st.out) ? '\n\n' : '\n'; // 連續 code block 之間空一行
            st.out += fence(n) + '\n';
          }
        } else if (n.tagName === 'CODE') {
          st.out += inline(n.textContent);
        } else {
          walk(n, st);
          if (BLOCK.test(n.tagName)) newline(st);
        }
      }
    }
  }

  function toMd(el, codes) {
    var st = { out: '', codes: codes };
    walk(el, st);
    return st.out.replace(/^\s+|\s+$/g, '');
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
    var answers = [];
    for (var i = 0; i < opts.length; i++) {
      var tEl = opts[i].querySelector('.LM-Quiz-option-text');
      var a = tEl && toMd(tEl);
      if (a) answers.push(a);
    }
    if (!answers.length) {
      toast('尚未送出答案', 'error');
      return;
    }
    var codes = [];
    // <summary> 只能放單行文字：code block 移到 </summary> 之後
    var q = qEl ? toMd(qEl, codes).replace(/\s+/g, ' ') : '';
    if (!q && codes.length) q = '（程式碼題）';
    if (!q) {
      toast('找不到題目內容', 'error');
      return;
    }
    var multiline = /\n/.test(answers.join(''));
    // 多個正解用清單；答案本身有多行（例如含 code block）時改以空行分隔，避免破壞清單
    var ans =
      answers.length < 2 ? answers[0] : multiline ? answers.join('\n\n') : '- ' + answers.join('\n- ');
    // 含 code block 時 </summary> 後要空一行，Markdown 才會被渲染
    var body = codes.length ? '\n' + codes.join('\n\n') + '\n\n' + ans : multiline ? '\n' + ans : ans;
    done('<details>\n<summary>' + q + '</summary>\n' + body + '\n</details>');
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
