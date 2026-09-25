/**
 * Frontend Masters Learning Mode 共用：元素 → Markdown。
 * 規則：<pre> 轉 fenced code block（語言固定 javascript），前後剛好一個換行；
 * 行內 <code> 轉反引號；區塊元素之間以單一換行分隔；其他標籤只取文字。
 *
 * 提供：toMd(el)、codeOf(pre)、fence(pre)、BLOCK
 * 使用者：fm-learning-md、fm-flashcard-batch
 */
var BLOCK = /^(P|DIV|LI|UL|OL|BR|H[1-6]|BLOCKQUOTE)$/;

function codeOf(pre) {
  var codeEl = pre.querySelector('code');
  return (codeEl || pre).textContent.replace(/\n+$/, '');
}

function fence(pre) {
  return '```javascript\n' + codeOf(pre) + '\n```';
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
 */
function walk(el, st) {
  for (var n = el.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 3) {
      var t = n.nodeValue;
      if (/^\s*$/.test(t) && t.indexOf('\n') >= 0) newline(st); // 排版用的換行
      else st.out += t;
    } else if (n.nodeType === 1) {
      if (n.tagName === 'PRE') {
        st.out = st.out.replace(/\s+$/, '');
        if (st.out) st.out += /```$/.test(st.out) ? '\n\n' : '\n'; // 連續 code block 之間空一行
        st.out += fence(n) + '\n';
      } else if (n.tagName === 'CODE') {
        st.out += inline(n.textContent);
      } else {
        walk(n, st);
        if (BLOCK.test(n.tagName)) newline(st);
      }
    }
  }
}

function toMd(el) {
  var st = { out: '' };
  walk(el, st);
  return st.out.replace(/^\s+|\s+$/g, '');
}

