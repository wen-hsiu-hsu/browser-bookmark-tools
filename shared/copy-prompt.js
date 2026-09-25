/* @include toast */
/* @include clipboard */

/**
 * 先直接複製；失敗時改顯示「點此複製」按鈕，使用者點擊時再複製一次。
 *
 * 用途：瀏覽器只允許在使用者點擊後的短時間內寫入剪貼簿（Firefox 約 5 秒，Safari 更嚴格），
 * 批次作業跑太久就會失敗；按鈕提供一次新的點擊，讓複製一定能成功。
 *
 * @param {string} text   要複製的內容
 * @param {string} okMsg  成功時的 toast 訊息
 * @param {string} label  按鈕文字（例如「已擷取 N 題，點此複製」）
 */
function copyOrPrompt(text, okMsg, label) {
  removeCopyPrompt(); // 先清掉上一次留下、沒被點的按鈕，避免點到舊資料
  copyText(text, function (ok) {
    if (ok) return toast(okMsg);
    var d = document;
    var t = d.getElementById('__bmt_toast__');
    if (t && t.parentNode) t.parentNode.removeChild(t);

    var b = d.createElement('button');
    b.id = '__bmt_copy_btn__';
    b.type = 'button';
    b.textContent = label;
    b.style.cssText =
      'all:initial;display:block;box-sizing:border-box;cursor:pointer;' +
      'position:fixed;top:20px;left:50%;transform:translateX(-50%);' +
      'z-index:2147483647;color:#fff;background:#2563eb;padding:10px 16px;border-radius:6px;' +
      'box-shadow:0 4px 12px rgba(0,0,0,.2);' +
      'font:14px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;' +
      'max-width:320px;text-align:center';
    b.onclick = function () {
      copyText(text, function (ok2) {
        // 成功才移除按鈕；失敗時保留，讓使用者可以再試，資料不會遺失
        if (ok2 && b.parentNode) b.parentNode.removeChild(b);
        toast(ok2 ? okMsg : '複製失敗', ok2 ? 'success' : 'error');
      });
    };
    (d.body || d.documentElement).appendChild(b);
  });
}

/** 移除「點此複製」按鈕（若存在）。 */
function removeCopyPrompt() {
  var old = document.getElementById('__bmt_copy_btn__');
  if (old && old.parentNode) old.parentNode.removeChild(old);
}
