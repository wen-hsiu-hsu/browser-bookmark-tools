/**
 * 共用複製：先用 navigator.clipboard.writeText()，不存在或失敗時
 * fallback 到隱藏 textarea + document.execCommand('copy')。
 *
 * @param {string} text
 * @param {function(boolean)} cb  完成後呼叫，參數為是否成功（只會呼叫一次）
 */
function copyText(text, cb) {
  function fallback() {
    var d = document;
    var active = d.activeElement;
    var ta = d.createElement('textarea');
    var ok = false;
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    (d.body || d.documentElement).appendChild(ta);
    ta.select();
    try {
      ok = d.execCommand('copy');
    } catch (e) {}
    ta.parentNode.removeChild(ta);
    if (active && active.focus) active.focus(); // 還原原本的焦點
    cb(!!ok);
  }

  var c = navigator.clipboard;
  if (c && c.writeText) {
    try {
      c.writeText(text).then(function () {
        cb(true);
      }, fallback);
      return;
    } catch (e) {}
  }
  fallback();
}
