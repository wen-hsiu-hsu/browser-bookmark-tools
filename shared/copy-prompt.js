/* @include toast */
/* @include clipboard */

var COPY_ICON = [['rect', { x: 8, y: 8, width: 12, height: 12, rx: 2 }],
  ['path', { d: 'M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2' }]];

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

    var T = bmtTheme();
    var b = d.createElement('button');
    b.id = '__bmt_copy_btn__';
    b.type = 'button';
    // 可點的按鈕用實心 fill，與不可點的 toast（主題底色）做出區別
    bmtCss(b,
      'display:flex;align-items:center;gap:10px;cursor:pointer;' +
      'position:fixed;top:20px;left:50%;transform:translateX(-50%);' +
      'z-index:' + T.zToast + ';color:' + T.onFill + ';background:' + T.fill + ';' +
      'padding:10px 16px 10px 12px;border-radius:' + T.radiusMd + ';' +
      'box-shadow:' + T.shadow + ';font:' + T.font + ';max-width:320px;text-align:left');
    b.appendChild(bmtIcon(COPY_ICON, 18, T.onFill));
    var txt = d.createElement('span');
    bmtCss(txt, 'display:block;min-width:0;font:inherit;color:inherit;cursor:inherit');
    txt.textContent = label;
    b.appendChild(txt);
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
