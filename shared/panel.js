/* @include toast */

/**
 * 共用浮動面板：可拖曳、可最小化、每個指令一顆按鈕＋快捷鍵（⌥⇧數字），執行中顯示視覺提示。
 * 規格見 shared/README.md。
 *
 * createPanel(opts) → api
 *   opts.id        面板 id（需以 __bmt_ 開頭）
 *   opts.title     展開時的標題
 *   opts.mini      最小化時顯示的短名稱
 *   opts.footer    底部說明文字（例如版本）
 *   opts.commands  [{ id, label, key: '1'~'9', icon: [[tag, attrs], ...], run: function (ctx) }]
 *                  ctx.progress(text) 更新進度文字；ctx.done() 結束（只算一次）
 *   api.expand()   展開面板（重複點書籤時呼叫）
 *   api.close()    移除面板並停用快捷鍵（執行中無效）
 *
 * 不使用 <style>：嚴格 CSP 會擋 inline <style>，但不擋 CSSOM（el.style）與 Web Animations。
 */
function createPanel(opts) {
  var d = document;
  var w = window;
  var SVG = 'http://www.w3.org/2000/svg';
  var ACCENT = '#7cb7ff';
  var BG = '#1c1f24';
  var FG = '#e6e8eb';
  var MUTED = '#8b929c';
  var FONT = '14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
  var SHADOW = '0 8px 24px rgba(0,0,0,.28)';
  var GRIP = [['circle', { cx: 9, cy: 6, r: 1.6 }], ['circle', { cx: 15, cy: 6, r: 1.6 }],
    ['circle', { cx: 9, cy: 12, r: 1.6 }], ['circle', { cx: 15, cy: 12, r: 1.6 }],
    ['circle', { cx: 9, cy: 18, r: 1.6 }], ['circle', { cx: 15, cy: 18, r: 1.6 }]];
  var SPIN = [['circle', { cx: 12, cy: 12, r: 9, 'stroke-opacity': '.25' }], ['path', { d: 'M21 12a9 9 0 0 0-9-9' }]];
  var MINUS = [['path', { d: 'M6 12h12' }]];
  var CROSS = [['path', { d: 'M6 6l12 12M18 6L6 18' }]];
  var EXPAND = [['path', { d: 'M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6' }]];

  var busy = null; // 執行中的指令
  var anims = [];

  /** 建立元素；css 開頭一律 all:initial，隔離頁面樣式。 */
  function el(tag, css, text) {
    var e = d.createElement(tag);
    e.style.cssText = 'all:initial;box-sizing:border-box;font:' + FONT + ';color:inherit;' + (css || '');
    if (text) e.textContent = text;
    return e;
  }

  /** 線條 SVG icon；fill 傳 true 時改為實心（拖曳點）。 */
  function icon(shapes, size, color, fill) {
    var s = d.createElementNS(SVG, 'svg');
    s.setAttribute('width', size);
    s.setAttribute('height', size);
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('fill', fill ? color : 'none');
    s.setAttribute('stroke', fill ? 'none' : color);
    s.setAttribute('stroke-width', '2');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    s.style.cssText = 'display:block;flex:none';
    for (var i = 0; i < shapes.length; i++) {
      var c = d.createElementNS(SVG, shapes[i][0]);
      for (var k in shapes[i][1]) c.setAttribute(k, shapes[i][1][k]);
      s.appendChild(c);
    }
    return s;
  }

  /** Web Animations：不支援時（舊瀏覽器、jsdom）就不動畫，狀態仍正確。 */
  function animate(node, frames, ms) {
    if (!node.animate) return;
    anims.push(node.animate(frames, { duration: ms, iterations: Infinity }));
  }

  function stopAnims() {
    for (var i = 0; i < anims.length; i++) anims[i].cancel();
    anims = [];
  }

  function spinner(size) {
    var s = icon(SPIN, size, ACCENT);
    animate(s, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], 900);
    return s;
  }

  function iconButton(shapes, label) {
    var b = el('button', 'width:28px;height:28px;display:flex;align-items:center;justify-content:center;' +
      'border-radius:6px;color:#b4bac3;cursor:pointer;flex:none');
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.title = label;
    b.appendChild(icon(shapes, 16, 'currentColor'));
    return b;
  }

  /** 滑鼠移入時加底色（不用 :hover，因為不注入 <style>）。 */
  function hover(b, bg) {
    b.addEventListener('mouseenter', function () {
      if (!b.disabled) b.style.background = bg;
    });
    b.addEventListener('mouseleave', function () {
      b.style.background = 'transparent';
    });
  }

  // ---------- DOM ----------
  var root = el('div', 'position:fixed;right:16px;bottom:16px;z-index:2147483646;color:' + FG + ';' +
    'user-select:none;-webkit-user-select:none');
  root.id = opts.id;

  // 展開狀態
  var full = el('div', 'display:block;width:264px;background:' + BG + ';border-radius:10px;overflow:hidden;' +
    'box-shadow:' + SHADOW);
  var head = el('div', 'display:flex;align-items:center;gap:8px;padding:8px 8px 8px 12px;cursor:move;' +
    'border-bottom:1px solid rgba(255,255,255,.08)');
  var headGrip = icon(GRIP, 14, MUTED, true);
  var title = el('div', 'flex-grow:1;font-weight:600;font-size:13px', opts.title);
  var minBtn = iconButton(MINUS, '最小化');
  var closeBtn = iconButton(CROSS, '關閉');
  head.appendChild(headGrip);
  head.appendChild(title);
  head.appendChild(minBtn);
  head.appendChild(closeBtn);
  var track = el('div', 'display:none;height:3px;background:rgba(255,255,255,.08);overflow:hidden');
  var bar = el('div', 'display:block;width:40%;height:3px;background:' + ACCENT);
  track.appendChild(bar);
  var list = el('div', 'display:flex;flex-direction:column;padding:6px');
  var foot = el('div', 'display:block;padding:6px 12px 10px;font-size:11px;color:' + MUTED);
  full.appendChild(head);
  full.appendChild(track);
  full.appendChild(list);
  full.appendChild(foot);

  // 最小化狀態
  var mini = el('div', 'display:none;align-items:center;gap:4px;background:' + BG + ';border-radius:22px;' +
    'padding:0 4px 0 12px;height:44px;cursor:move;box-shadow:' + SHADOW);
  var miniIcon = el('span', 'display:flex;align-items:center');
  var miniGrip = icon(GRIP, 14, MUTED, true);
  miniIcon.appendChild(miniGrip);
  var miniLabel = el('span', 'font-weight:600;font-size:13px;padding:0 6px', opts.mini);
  var miniProg = el('span', 'display:none;font-size:12px;color:' + ACCENT + ';padding-right:4px');
  var expandBtn = el('button', 'width:36px;height:36px;display:flex;align-items:center;justify-content:center;' +
    'border-radius:18px;background:rgba(255,255,255,.08);cursor:pointer;flex:none');
  expandBtn.type = 'button';
  expandBtn.setAttribute('aria-label', '展開');
  expandBtn.title = '展開';
  expandBtn.appendChild(icon(EXPAND, 16, 'currentColor'));
  mini.appendChild(miniIcon);
  mini.appendChild(miniLabel);
  mini.appendChild(miniProg);
  mini.appendChild(expandBtn);

  root.appendChild(full);
  root.appendChild(mini);

  // 指令按鈕
  var cmds = opts.commands;
  for (var i = 0; i < cmds.length; i++) addCommand(cmds[i]);

  function addCommand(c) {
    var b = el('button', 'display:flex;align-items:center;gap:12px;padding:0 10px;height:44px;border-radius:6px;' +
      'cursor:pointer;background:transparent');
    b.type = 'button';
    b.setAttribute('data-__bmt_cmd', c.id);
    b.title = c.label + '（⌥⇧' + c.key + '）';
    var ic = el('span', 'display:flex;align-items:center;flex:none');
    ic.appendChild(icon(c.icon, 20, ACCENT));
    var label = el('span', 'flex-grow:1', c.label);
    var kbd = el('kbd', 'font:11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:#b4bac3;' +
      'border:1px solid rgba(255,255,255,.18);border-radius:4px;padding:4px 6px', '⌥⇧' + c.key);
    var prog = el('span', 'display:none;font-size:12px;color:' + ACCENT);
    b.appendChild(ic);
    b.appendChild(label);
    b.appendChild(kbd);
    b.appendChild(prog);
    hover(b, 'rgba(255,255,255,.07)');
    b.addEventListener('click', function () {
      run(c);
    });
    c.ui = { btn: b, icon: ic, kbd: kbd, prog: prog };
    list.appendChild(b);
  }
  hover(minBtn, 'rgba(255,255,255,.08)');
  hover(closeBtn, 'rgba(255,255,255,.08)');

  // ---------- 狀態 ----------
  function minimized() {
    return mini.style.display !== 'none';
  }

  function setMinimized(on) {
    full.style.display = on ? 'none' : 'block';
    mini.style.display = on ? 'flex' : 'none';
    keepInView();
  }

  /** 面板以右下角定位，切換大小後若超出視窗左／上緣就推回來（量一次）。 */
  function keepInView() {
    var r = root.getBoundingClientRect();
    if (r.left < 0) root.style.right = Math.max(0, parseFloat(root.style.right) + r.left) + 'px';
    if (r.top < 0) root.style.bottom = Math.max(0, parseFloat(root.style.bottom) + r.top) + 'px';
  }

  function setProgress(text) {
    if (!busy) return;
    busy.ui.prog.textContent = text || '';
    miniProg.textContent = text || '';
    miniProg.style.display = text ? 'inline' : 'none';
  }

  function setBusy(c) {
    busy = c;
    var ring = c ? '0 0 0 2px ' + ACCENT + ',' + SHADOW : SHADOW;
    full.style.boxShadow = ring;
    mini.style.boxShadow = ring;
    track.style.display = c ? 'block' : 'none';
    closeBtn.disabled = !!c;
    closeBtn.style.opacity = c ? '.4' : '1';
    closeBtn.style.cursor = c ? 'default' : 'pointer';
    stopAnims();
    for (var i = 0; i < cmds.length; i++) {
      var u = cmds[i].ui;
      var me = cmds[i] === c;
      u.btn.disabled = !!c;
      u.btn.style.cursor = c ? 'default' : 'pointer';
      u.btn.style.opacity = c && !me ? '.4' : '1';
      u.btn.style.background = me ? 'rgba(255,255,255,.07)' : 'transparent';
      u.kbd.style.display = c ? 'none' : 'inline-block';
      u.prog.style.display = me ? 'inline' : 'none';
      u.prog.textContent = '';
      u.icon.replaceChild(me ? spinner(20) : icon(cmds[i].icon, 20, ACCENT), u.icon.firstChild);
    }
    miniIcon.replaceChild(c ? spinner(16) : miniGrip, miniIcon.firstChild);
    miniProg.style.display = 'none';
    miniProg.textContent = '';
    if (c) animate(bar, [{ transform: 'translateX(-100%)' }, { transform: 'translateX(260%)' }], 1200);
  }

  function run(c) {
    if (busy) return toast('指令執行中', 'info');
    var finished = false;
    setBusy(c);
    var ctx = {
      progress: function (text) {
        if (!finished) setProgress(text);
      },
      done: function () {
        if (finished) return;
        finished = true;
        if (busy === c) setBusy(null);
      }
    };
    try {
      c.run(ctx);
    } catch (e) {
      ctx.done();
      toast('執行失敗：' + (e && e.message), 'error');
    }
  }

  // ---------- 拖曳 ----------
  /** 拖曳開始時量一次尺寸，整個面板限制在視窗內；位置存成 right／bottom。 */
  function startDrag(e) {
    if (e.button !== 0) return;
    for (var t = e.target; t && t !== root; t = t.parentNode) if (t.tagName === 'BUTTON') return;
    e.preventDefault(); // 避免選取文字
    var r = root.getBoundingClientRect();
    var vw = d.documentElement.clientWidth || w.innerWidth;
    var vh = d.documentElement.clientHeight || w.innerHeight;
    var sx = e.clientX;
    var sy = e.clientY;
    function move(ev) {
      if ('buttons' in ev && !(ev.buttons & 1)) return up(); // 在視窗外放開：收不到 mouseup
      var x = Math.min(Math.max(r.left + ev.clientX - sx, 0), Math.max(vw - r.width, 0));
      var y = Math.min(Math.max(r.top + ev.clientY - sy, 0), Math.max(vh - r.height, 0));
      root.style.right = vw - x - r.width + 'px';
      root.style.bottom = vh - y - r.height + 'px';
    }
    function up() {
      d.removeEventListener('mousemove', move, true);
      d.removeEventListener('mouseup', up, true);
      w.removeEventListener('blur', up);
    }
    d.addEventListener('mousemove', move, true);
    d.addEventListener('mouseup', up, true);
    w.addEventListener('blur', up);
  }
  head.addEventListener('mousedown', startDrag);
  mini.addEventListener('mousedown', startDrag);

  // ---------- 快捷鍵：⌥⇧1~9 ----------
  function editable(t) {
    return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  }

  function onKey(e) {
    // 用 e.code 判斷實體按鍵：Mac 的 Option+Shift+數字會產生特殊字元，e.key 不可靠
    var m = /^Digit([1-9])$/.exec(e.code || '');
    if (!m || !e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey || editable(e.target)) return;
    for (var i = 0; i < cmds.length; i++) {
      if (cmds[i].key !== m[1]) continue;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) run(cmds[i]); // 長按的自動連發不重複觸發
      return;
    }
  }
  w.addEventListener('keydown', onKey, true);

  // ---------- 最小化／關閉 ----------
  minBtn.addEventListener('click', function () {
    setMinimized(true);
  });
  expandBtn.addEventListener('click', function () {
    setMinimized(false);
  });

  function close() {
    if (busy) return;
    w.removeEventListener('keydown', onKey, true);
    stopAnims();
    if (root.parentNode) root.parentNode.removeChild(root);
  }
  closeBtn.addEventListener('click', close);

  foot.textContent = opts.footer || '';
  (d.body || d.documentElement).appendChild(root);

  var api = {
    expand: function () {
      if (minimized()) setMinimized(false);
    },
    close: close
  };
  root.__bmtPanel = api;
  return api;
}
