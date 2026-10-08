/* @include theme */

var TOAST_ICONS = {
  success: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M8 12.5l2.5 2.5L16 9.5' }]],
  error: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M9 9l6 6M15 9l-6 6' }]],
  info: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M12 16v-5M12 8h.01' }]],
  spin: [['circle', { cx: 12, cy: 12, r: 9, 'stroke-opacity': '.25' }], ['path', { d: 'M21 12a9 9 0 0 0-9-9' }]]
};

/**
 * 共用 toast：在視窗頂部置中顯示提示訊息。規格見 shared/README.md。
 *
 * @param {string} msg       顯示文字（以 textContent 寫入，不解析 HTML）
 * @param {string} [type]    'success'（預設）| 'error' | 'info'
 * @param {number} [duration] 停留毫秒數，預設 2500；0 = 不自動消失（info 時 icon 換成轉圈）
 *
 * 同一時間只會有一個 toast：已存在時直接更新文字、類型與 icon（不重建、不重播淡入），
 * 計時器綁在元素本身，舊計時器會被清除，不會誤刪新的 toast。
 * 類型記在 data-__bmt_type（底色不再代表類型），其他元件要判斷類型時讀這個屬性。
 */
function toast(msg, type, duration) {
  var d = document;
  var T = bmtTheme();
  var el = d.getElementById('__bmt_toast__');
  // 相容舊版書籤：清掉舊 id 的 toast，避免與新版疊在一起
  var legacy = d.getElementById('__lm_md_toast__');
  if (legacy && legacy.parentNode) legacy.parentNode.removeChild(legacy);

  if (type !== 'error' && type !== 'info') type = 'success';
  if (duration == null) duration = 2500;

  if (el && (!el.__bmtText || el.__bmtText.parentNode !== el)) {
    // 舊版書籤建立或改寫過的同 id toast（沒有 icon 結構，或文字被整個覆寫）：移除後以新樣式重建
    if (el.parentNode) el.parentNode.removeChild(el);
    el = null;
  }
  if (el) {
    clearTimeout(el.__bmtStay);
    clearTimeout(el.__bmtFade);
  } else {
    el = d.createElement('div');
    el.id = '__bmt_toast__';
    bmtCss(el,
      'display:flex;align-items:center;gap:10px;' +
      'position:fixed;top:20px;left:50%;transform:translateX(-50%);' +
      'z-index:' + T.zToast + ';color:' + T.fg + ';background:' + T.bg + ';' +
      'padding:10px 14px 10px 12px;border-radius:' + T.radiusMd + ';border-left:4px solid ' + T.info + ';' +
      'box-shadow:' + T.shadow + ';font:' + T.font + ';' +
      'max-width:320px;pointer-events:none;opacity:0;transition:opacity ' + T.fadeIn + 'ms');
    var ic = d.createElement('span');
    bmtCss(ic, 'display:flex;flex:none');
    ic.appendChild(d.createElement('span'));
    var text = d.createElement('span');
    bmtCss(text, 'display:block;min-width:0;font:inherit;color:inherit;overflow-wrap:break-word');
    el.appendChild(ic);
    el.appendChild(text);
    el.__bmtIcon = ic;
    el.__bmtText = text;
    (d.body || d.documentElement).appendChild(el);
    el.offsetWidth; // 強制 reflow，讓下面的 opacity 變化觸發淡入
  }

  var color = T[type];
  var spinning = type === 'info' && duration === 0;
  var key = type + (spinning ? '-spin' : '');
  if (el.__bmtKey !== key) {
    // 類型或轉圈狀態改變才換 icon，原地更新讀秒文字時不重建（轉圈動畫不會跳回起點）
    el.__bmtKey = key;
    var icon = bmtIcon(spinning ? TOAST_ICONS.spin : TOAST_ICONS[type], 18, color);
    if (spinning) bmtAnimate(icon, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], T.spin);
    el.__bmtIcon.replaceChild(icon, el.__bmtIcon.firstChild);
  }
  el.__bmtText.textContent = msg;
  el.setAttribute('data-__bmt_type', type);
  bmtSet(el, 'border-left-color', color);
  bmtSet(el, 'transition', 'opacity ' + T.fadeIn + 'ms');
  bmtSet(el, 'opacity', '1');

  if (duration > 0) {
    el.__bmtStay = setTimeout(function () {
      bmtSet(el, 'transition', 'opacity ' + T.fadeOut + 'ms');
      bmtSet(el, 'opacity', '0');
      el.__bmtFade = setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, T.fadeOut);
    }, duration);
  }
}
