/**
 * 共用主題：design tokens 與樣式隔離工具。規格見 shared/README.md 的 theme 章節。
 *
 * bmtTheme() → tokens
 *   第一次呼叫時以 matchMedia 判斷亮／暗並快取（同一次書籤執行只判斷一次）；
 *   API 不存在或不支援 prefers-color-scheme 時用暗色。
 * bmtCss(el, text)          以 all:initial 開頭設定整串樣式，每條都加 !important
 * bmtSet(el, prop, value)   事後修改單一樣式（同樣加 !important）
 * bmtIcon(shapes, size, color, fill) → 線條 SVG icon
 * bmtAnimate(node, frames, ms)        無限循環的 Web Animations（不支援時不動畫，回傳 null）
 *
 * 不使用 <style>：嚴格 CSP 會擋 inline <style>，但不擋 CSSOM（el.style）。
 * 加 !important 的原因：inline 樣式會輸給頁面樣式表裡的 !important（例如 button{background:red!important}）。
 * 注意：加了 !important 的屬性，之後必須用 bmtSet 修改；直接寫 el.style.x = v 會把 !important 拿掉。
 */
var bmtThemeCache;

function bmtTheme() {
  if (bmtThemeCache) return bmtThemeCache;
  var dark = true;
  try {
    // 問「是不是亮色」：不支援這個 media feature 的瀏覽器會回 false，維持暗色
    dark = !(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
  } catch (e) {}
  var T = dark
    ? {
        bg: '#1c1f24',
        bg2: '#262a31',
        fg: '#e6e8eb',
        muted: '#8b929c',
        kbd: '#b4bac3',
        hover: 'rgba(255,255,255,.07)',
        active: 'rgba(255,255,255,.12)',
        border: 'rgba(255,255,255,.08)',
        borderStrong: 'rgba(255,255,255,.18)',
        scrim: 'rgba(28,31,36,.85)',
        accent: '#7cb7ff',
        success: '#4ade80',
        error: '#f87171',
        info: '#7cb7ff',
        shadow: '0 0 0 1px rgba(255,255,255,.06),0 8px 24px rgba(0,0,0,.28)'
      }
    : {
        bg: '#ffffff',
        bg2: '#f3f4f6',
        fg: '#1c1f24',
        muted: '#6b7280',
        kbd: '#4b5563',
        hover: 'rgba(0,0,0,.05)',
        active: 'rgba(0,0,0,.09)',
        border: 'rgba(0,0,0,.08)',
        borderStrong: 'rgba(0,0,0,.16)',
        scrim: 'rgba(255,255,255,.88)',
        accent: '#2563eb',
        success: '#16a34a',
        error: '#dc2626',
        info: '#2563eb',
        shadow: '0 0 0 1px rgba(0,0,0,.06),0 8px 24px rgba(15,23,42,.14)'
      };
  T.dark = dark;
  T.fill = '#2563eb'; // 選取中、可點的實心按鈕（兩個主題相同，配白字）
  T.onFill = '#ffffff';
  T.font = '14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
  T.mono = 'ui-monospace,SFMono-Regular,Menlo,monospace';
  T.radiusSm = '6px'; // 按鈕
  T.radiusMd = '10px'; // 容器（面板、工具列、toast）
  T.radiusPill = '999px'; // 膠囊
  T.disabledOpacity = '.4';
  T.focusRing = '2px solid ' + T.accent; // 搭配 outline-offset:-2px
  T.zWhiteboard = 2147483000; // whiteboard < 面板類 < toast
  T.zPanel = 2147483646;
  T.zToast = 2147483647;
  T.fadeIn = 200; // ms
  T.fadeOut = 300;
  T.spin = 900; // 轉圈一圈
  T.progress = 1200; // 進度條跑一趟
  bmtThemeCache = T;
  return T;
}

function bmtCss(el, text) {
  // 同一屬性出現多次時只保留最後一個（例如預設的 cursor:inherit 後面又指定 cursor:move），
  // 不依賴各瀏覽器／jsdom 對重複 !important 宣告的處理
  var parts = ('all:initial;box-sizing:border-box;' + text).split(';');
  var out = [];
  var at = {};
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].replace(/^\s+|\s+$/g, '');
    if (!p) continue;
    var name = p.slice(0, p.indexOf(':')).replace(/\s+$/, '');
    if (at[name] != null) out[at[name]] = '';
    at[name] = out.length;
    out.push(p + '!important');
  }
  el.style.cssText = out.join(';').replace(/;+/g, ';').replace(/^;/, '');
}

function bmtSet(el, prop, value) {
  el.style.setProperty(prop, value, 'important');
}

/**
 * 無限循環動畫。CSS cascade 中 important 宣告的優先權高於動畫，
 * bmtCss 的 all:initial!important 會讓 transform 也變成 important，動畫完全不會動；
 * 所以先把被動畫的屬性改成一般優先權。
 */
function bmtAnimate(node, frames, ms) {
  if (!node.animate) return null;
  for (var k in frames[0]) {
    node.style.setProperty(k.replace(/[A-Z]/g, function (c) { return '-' + c.toLowerCase(); }), String(frames[0][k]), '');
  }
  return node.animate(frames, { duration: ms, iterations: Infinity });
}

/**
 * 線條 SVG icon（viewBox 24×24）。shapes：[[tag, attrs], ...]；fill 傳 true 時改為實心。
 * 顏色直接傳入：all:initial 會把 color 重設成黑色，所以不用 currentColor。
 * 尺寸與 fill／stroke 寫在 inline 樣式，蓋過頁面的 svg{...} 規則（presentation attribute 優先權最低）。
 */
function bmtIcon(shapes, size, color, fill) {
  var d = document;
  var NS = 'http://www.w3.org/2000/svg';
  var s = d.createElementNS(NS, 'svg');
  s.setAttribute('width', size);
  s.setAttribute('height', size);
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('fill', fill ? color : 'none');
  s.setAttribute('stroke', fill ? 'none' : color);
  bmtCss(s, 'cursor:inherit;display:block;flex:none;overflow:visible;width:' + size + 'px;height:' + size +
    'px;fill:' + (fill ? color : 'none') + ';stroke:' + (fill ? 'none' : color) + ';stroke-width:2px;' +
    'stroke-linecap:round;stroke-linejoin:round');
  for (var i = 0; i < shapes.length; i++) {
    var c = d.createElementNS(NS, shapes[i][0]);
    for (var k in shapes[i][1]) c.setAttribute(k, shapes[i][1][k]);
    // 不能用 all:，會連 d 等幾何屬性一起重設
    c.style.cssText = 'fill:inherit!important;stroke:inherit!important;cursor:inherit!important';
    s.appendChild(c);
  }
  return s;
}
