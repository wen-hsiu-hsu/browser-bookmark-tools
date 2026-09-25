/**
 * 共用 toast：在視窗頂部置中顯示提示訊息。規格見 shared/README.md。
 *
 * @param {string} msg       顯示文字（以 textContent 寫入，不解析 HTML）
 * @param {string} [type]    'success'（預設，綠）| 'error'（紅）| 'info'（藍）
 * @param {number} [duration] 停留毫秒數，預設 2500；0 = 不自動消失
 *
 * 同一時間只會有一個 toast：已存在時直接更新文字與顏色（不重建、不重播淡入），
 * 計時器綁在元素本身，舊計時器會被清除，不會誤刪新的 toast。
 */
function toast(msg, type, duration) {
  var d = document;
  var el = d.getElementById('__bmt_toast__');
  // 相容舊版書籤：清掉舊 id 的 toast，避免與新版疊在一起
  var legacy = d.getElementById('__lm_md_toast__');
  if (legacy && legacy.parentNode) legacy.parentNode.removeChild(legacy);

  if (el) {
    clearTimeout(el.__bmtStay);
    clearTimeout(el.__bmtFade);
  } else {
    el = d.createElement('div');
    el.id = '__bmt_toast__';
    el.style.cssText =
      'position:fixed;top:20px;left:50%;transform:translateX(-50%);' +
      'z-index:2147483647;color:#fff;padding:10px 16px;border-radius:6px;' +
      'box-shadow:0 4px 12px rgba(0,0,0,.2);' +
      'font:14px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;' +
      'max-width:320px;text-align:center;pointer-events:none;' +
      'opacity:0;transition:opacity .2s';
    (d.body || d.documentElement).appendChild(el);
    el.offsetWidth; // 強制 reflow，讓下面的 opacity 變化觸發淡入
  }

  el.textContent = msg;
  el.style.background =
    type === 'error' ? '#dc2626' : type === 'info' ? '#2563eb' : '#16a34a';
  el.style.transition = 'opacity .2s';
  el.style.opacity = '1';

  if (duration == null) duration = 2500;
  if (duration > 0) {
    el.__bmtStay = setTimeout(function () {
      el.style.transition = 'opacity .3s';
      el.style.opacity = '0';
      el.__bmtFade = setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 300);
    }, duration);
  }
}
