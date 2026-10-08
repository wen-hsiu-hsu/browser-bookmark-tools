/* @include toast */

/**
 * 共用浮動面板：可拖曳、三種大小（展開／縮小／最小化）、每個指令一顆按鈕＋快捷鍵（⌥⇧數字），
 * 執行中顯示視覺提示。
 * 規格見 shared/README.md。
 *
 * createPanel(opts) → api
 *   opts.id        面板 id（需以 __bmt_ 開頭）
 *   opts.title     展開時的標題
 *   opts.mini      最小化時顯示的短名稱
 *   opts.footer    底部說明文字（例如版本）
 *   opts.version   版本字串，寫在 root 的 data-__bmt_ver（新版書籤用來辨認舊版面板）
 *   opts.commands  [{ id, label, key: '1'~'9', icon: [[tag, attrs], ...], run: function (ctx) }]
 *                  ctx.progress(text) 更新進度文字；ctx.done() 結束（只算一次）
 *   api.expand()   最小化時還原成最小化前的模式；其他模式只夾回視窗內（重複點書籤時呼叫）
 *   api.close()    移除面板並停用快捷鍵（執行中無效）
 *   api.busy()     是否有指令執行中
 *
 * 看門狗：執行中超過 IDLE_MS 沒有呼叫 progress()／done()，視為卡住，自動解除並提示，
 * 避免非同步流程中途拋錯時面板永遠停在執行中。
 *
 * 不使用 <style>：嚴格 CSP 會擋 inline <style>，但不擋 CSSOM（el.style）與 Web Animations。
 */
function createPanel(opts) {
  var d = document;
  var w = window;
  var SVG = 'http://www.w3.org/2000/svg';
  var T = bmtTheme();
  var ACCENT = T.accent;
  var BG = T.bg;
  var FG = T.fg;
  var MUTED = T.muted;
  var FONT = T.font;
  var SHADOW = T.shadow;
  var GRIP = [['circle', { cx: 9, cy: 6, r: 1.6 }], ['circle', { cx: 15, cy: 6, r: 1.6 }],
    ['circle', { cx: 9, cy: 12, r: 1.6 }], ['circle', { cx: 15, cy: 12, r: 1.6 }],
    ['circle', { cx: 9, cy: 18, r: 1.6 }], ['circle', { cx: 15, cy: 18, r: 1.6 }]];
  var SPIN = [['circle', { cx: 12, cy: 12, r: 9, 'stroke-opacity': '.25' }], ['path', { d: 'M21 12a9 9 0 0 0-9-9' }]];
  var MINUS = [['path', { d: 'M6 12h12' }]];
  var CROSS = [['path', { d: 'M6 6l12 12M18 6L6 18' }]];
  var EXPAND = [['path', { d: 'M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6' }]];
  var SHRINK = [['path', { d: 'M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7' }]];
  var ICON_FG = FG; // 標題列、縮小欄、膠囊上的控制鈕 icon

  var IDLE_MS = 15000;
  var busy = null; // 執行中的指令
  var anims = [];
  var watchdog = null;

  /**
   * 建立元素；css 開頭一律 all:initial 並加 !important，隔離頁面樣式（之後一律用 bmtSet 修改）。
   * all:initial 會把 cursor 重設成 auto（文字上變成 text 游標），所以預設繼承父層。
   */
  function el(tag, css, text) {
    var e = d.createElement(tag);
    bmtCss(e, 'font:' + FONT + ';color:inherit;cursor:inherit;' + (css || ''));
    if (text) e.textContent = text;
    return e;
  }

  /** 線條 SVG icon；fill 傳 true 時改為實心（拖曳點）。 */
  function icon(shapes, size, color, fill) {
    return bmtIcon(shapes, size, color, fill);
  }

  /** Web Animations：不支援時（舊瀏覽器、jsdom）就不動畫，狀態仍正確。 */
  function animate(node, frames, ms) {
    var a = bmtAnimate(node, frames, ms);
    if (a) anims.push(a);
  }

  function stopAnims() {
    for (var i = 0; i < anims.length; i++) anims[i].cancel();
    anims = [];
  }

  function spinner(size) {
    var s = icon(SPIN, size, ACCENT);
    animate(s, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], T.spin);
    return s;
  }

  function iconButton(shapes, label) {
    var b = el('button', 'width:28px;height:28px;display:flex;align-items:center;justify-content:center;' +
      'border-radius:6px;cursor:pointer;flex:none');
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.title = label;
    b.appendChild(icon(shapes, 16, ICON_FG));
    return b;
  }

  /** 按鈕平常的底色：執行中的指令按鈕（展開與縮小模式各一顆）維持反白。 */
  function restBg(b) {
    return busy && (busy.ui.btn === b || busy.ui.cbtn === b) ? T.hover : 'transparent';
  }

  /**
   * 滑鼠移入加底色、鍵盤焦點加外框（不用 :hover／:focus-visible，因為不注入 <style>；
   * all:initial 也會清掉瀏覽器預設的焦點外框）。
   */
  function hover(b, bg) {
    b.addEventListener('mouseenter', function () {
      if (!b.disabled) bmtSet(b, 'background', bg);
    });
    b.addEventListener('mouseleave', function () {
      bmtSet(b, 'background', restBg(b));
    });
    b.addEventListener('focus', function () {
      // 滑鼠點擊也會觸發 focus：支援 :focus-visible 時只在鍵盤焦點顯示外框
      try {
        if (!b.matches(':focus-visible')) return;
      } catch (e) {}
      bmtSet(b, 'outline', T.focusRing);
      bmtSet(b, 'outline-offset', '-2px');
    });
    b.addEventListener('blur', function () {
      bmtSet(b, 'outline', 'none');
    });
  }

  // ---------- DOM ----------
  // 以右上角定位（right／top）：切換大小時右上角不動，最小化鈕附近的視線不會落空
  var root = el('div', 'position:fixed;right:16px;top:16px;z-index:' + T.zPanel + ';color:' + FG + ';' +
    'cursor:default;user-select:none;-webkit-user-select:none');
  root.id = opts.id;
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', opts.title);
  root.setAttribute('data-__bmt_ver', opts.version || '');

  // 展開狀態
  var full = el('div', 'display:block;width:264px;background:' + BG + ';border-radius:10px;overflow:hidden;' +
    'box-shadow:' + SHADOW);
  var head = el('div', 'display:flex;align-items:center;gap:8px;padding:8px 8px 8px 12px;cursor:move;' +
    'border-bottom:1px solid ' + T.border);
  var headGrip = icon(GRIP, 14, MUTED, true);
  var title = el('div', 'flex-grow:1;font-weight:600;font-size:13px', opts.title);
  var shrinkBtn = iconButton(SHRINK, '縮小');
  var minBtn = iconButton(MINUS, '最小化');
  var closeBtn = iconButton(CROSS, '關閉');
  head.appendChild(headGrip);
  head.appendChild(title);
  head.appendChild(shrinkBtn);
  head.appendChild(minBtn);
  head.appendChild(closeBtn);
  var track = el('div', 'display:none;height:3px;background:' + T.border + ';overflow:hidden');
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
  var restoreBtn = el('button', 'width:36px;height:36px;display:flex;align-items:center;justify-content:center;' +
    'border-radius:18px;background:' + T.active + ';cursor:pointer;flex:none');
  restoreBtn.type = 'button';
  restoreBtn.setAttribute('aria-label', '還原');
  restoreBtn.title = '還原';
  restoreBtn.appendChild(icon(EXPAND, 16, ICON_FG));
  mini.appendChild(miniIcon);
  mini.appendChild(miniLabel);
  mini.appendChild(miniProg);
  mini.appendChild(restoreBtn);

  // 縮小狀態：直排 icon 欄（拖曳點、進度條、指令 icon、控制鈕），不顯示文字
  var compact = el('div', 'display:none;flex-direction:column;align-items:center;gap:2px;width:44px;' +
    'padding:0 4px 6px;background:' + BG + ';border-radius:10px;overflow:hidden;box-shadow:' + SHADOW);
  var cGrip = el('div', 'display:flex;justify-content:center;align-self:stretch;margin:0 -4px;padding:8px 0;cursor:move');
  cGrip.appendChild(icon(GRIP, 14, MUTED, true));
  var cTrack = el('div', 'display:none;align-self:stretch;margin:0 -4px 4px;height:3px;' +
    'background:' + T.border + ';overflow:hidden');
  var cBar = el('div', 'display:block;width:40%;height:3px;background:' + ACCENT);
  cTrack.appendChild(cBar);
  var cList = el('div', 'display:flex;flex-direction:column;align-items:center;gap:2px');
  var cSep = el('div', 'display:block;width:24px;height:1px;margin:4px 0;background:' + T.borderStrong);
  var cExpandBtn = iconButton(EXPAND, '展開');
  var cMinBtn = iconButton(MINUS, '最小化');
  var cCloseBtn = iconButton(CROSS, '關閉');
  compact.appendChild(cGrip);
  compact.appendChild(cTrack);
  compact.appendChild(cList);
  compact.appendChild(cSep);
  compact.appendChild(cExpandBtn);
  compact.appendChild(cMinBtn);
  compact.appendChild(cCloseBtn);

  root.appendChild(full);
  root.appendChild(mini);
  root.appendChild(compact);
  var closers = [closeBtn, cCloseBtn];

  // 指令按鈕
  var cmds = opts.commands;
  for (var i = 0; i < cmds.length; i++) addCommand(cmds[i]);

  function addCommand(c) {
    var b = el('button', 'display:flex;align-items:center;gap:12px;padding:0 10px;height:44px;border-radius:6px;' +
      'cursor:pointer;background:transparent');
    b.type = 'button';
    b.setAttribute('data-__bmt_cmd', c.id);
    b.title = cmdTitle(c);
    var ic = el('span', 'display:flex;align-items:center;flex:none');
    ic.appendChild(icon(c.icon, 20, ACCENT));
    var label = el('span', 'flex-grow:1', c.label);
    var kbd = el('kbd', 'font:11px/1 ' + T.mono + ';color:' + T.kbd + ';' +
      'border:1px solid ' + T.borderStrong + ';border-radius:4px;padding:4px 6px', '⌥⇧' + c.key);
    var prog = el('span', 'display:none;font-size:12px;color:' + ACCENT);
    b.appendChild(ic);
    b.appendChild(label);
    b.appendChild(kbd);
    b.appendChild(prog);
    hover(b, T.hover);
    b.addEventListener('click', function () {
      run(c);
    });
    // 縮小模式的按鈕：只有 icon，名稱與快捷鍵放在 title（hover 提示）
    var cb = el('button', 'width:36px;height:36px;display:flex;align-items:center;justify-content:center;' +
      'border-radius:6px;cursor:pointer;background:transparent;flex:none');
    cb.type = 'button';
    cb.setAttribute('data-__bmt_ccmd', c.id);
    cb.setAttribute('aria-label', c.label);
    cb.title = b.title;
    var cic = el('span', 'display:flex;align-items:center;flex:none');
    cic.appendChild(icon(c.icon, 20, ACCENT));
    cb.appendChild(cic);
    hover(cb, T.hover);
    cb.addEventListener('click', function () {
      run(c);
    });
    c.ui = { btn: b, icon: ic, kbd: kbd, prog: prog, cbtn: cb, cicon: cic };
    list.appendChild(b);
    cList.appendChild(cb);
  }
  var ctrls = [shrinkBtn, minBtn, closeBtn, cExpandBtn, cMinBtn, cCloseBtn];
  for (i = 0; i < ctrls.length; i++) hover(ctrls[i], T.hover);
  hover(restoreBtn, T.borderStrong);
  restoreBtn.addEventListener('mouseleave', function () {
    bmtSet(restoreBtn, 'background', T.active);
  });

  // ---------- 狀態 ----------
  var mode = 'full'; // 'full' | 'compact' | 'mini'
  var lastMode = 'full'; // 最小化前的模式，膠囊還原時回到這裡

  /**
   * 切換模式。被隱藏的按鈕收不到 mouseleave／blur，先清掉 hover 底色與焦點外框；
   * 焦點原本在面板內（鍵盤操作）時，移到新模式的對應控制鈕，避免焦點掉回 body。
   */
  function setMode(m) {
    if (m === 'mini' && mode !== 'mini') lastMode = mode;
    mode = m;
    var focused = root.contains(d.activeElement);
    for (var i = 0; i < ctrls.length; i++) {
      bmtSet(ctrls[i], 'background', 'transparent');
      bmtSet(ctrls[i], 'outline', 'none');
    }
    bmtSet(restoreBtn, 'background', T.active);
    bmtSet(restoreBtn, 'outline', 'none');
    bmtSet(full, 'display', m === 'full' ? 'block' : 'none');
    bmtSet(compact, 'display', m === 'compact' ? 'flex' : 'none');
    bmtSet(mini, 'display', m === 'mini' ? 'flex' : 'none');
    keepInView();
    if (focused) ({ full: shrinkBtn, compact: cExpandBtn, mini: restoreBtn })[m].focus();
  }

  /** 視窗大小：標準模式用 clientWidth／Height（不含捲軸）；quirks mode 下那是 html 的大小，改用 inner*。 */
  function viewport() {
    var std = d.compatMode === 'CSS1Compat';
    return {
      w: (std && d.documentElement.clientWidth) || w.innerWidth,
      h: (std && d.documentElement.clientHeight) || w.innerHeight
    };
  }

  /**
   * 面板以右上角定位（right／top）。切換大小、展開、視窗縮放後量一次，
   * 把整個面板夾回視窗內，避免標題列跑到畫面外而救不回來。
   */
  function keepInView() {
    var r = root.getBoundingClientRect();
    var v = viewport();
    var right = parseFloat(root.style.right) || 0;
    var top = parseFloat(root.style.top) || 0;
    bmtSet(root, 'right', Math.min(Math.max(right, 0), Math.max(v.w - r.width, 0)) + 'px');
    bmtSet(root, 'top', Math.min(Math.max(top, 0), Math.max(v.h - r.height, 0)) + 'px');
  }

  function cmdTitle(c) {
    return c.label + '（⌥⇧' + c.key + '）';
  }

  function setProgress(text) {
    if (!busy) return;
    busy.ui.prog.textContent = text || '';
    busy.ui.cbtn.title = text ? busy.label + '：' + text : cmdTitle(busy);
    miniProg.textContent = text || '';
    bmtSet(miniProg, 'display', text ? 'inline' : 'none');
  }

  function setBusy(c) {
    busy = c;
    root.setAttribute('aria-busy', c ? 'true' : 'false');
    var ring = c ? '0 0 0 2px ' + ACCENT + ',' + SHADOW : SHADOW;
    bmtSet(full, 'box-shadow', ring);
    bmtSet(mini, 'box-shadow', ring);
    bmtSet(compact, 'box-shadow', ring);
    bmtSet(track, 'display', c ? 'block' : 'none');
    bmtSet(cTrack, 'display', c ? 'block' : 'none');
    for (var j = 0; j < closers.length; j++) {
      closers[j].disabled = !!c;
      bmtSet(closers[j], 'opacity', c ? T.disabledOpacity : '1');
      bmtSet(closers[j], 'cursor', c ? 'default' : 'pointer');
      bmtSet(closers[j], 'background', 'transparent');
      bmtSet(closers[j], 'outline', 'none');
    }
    stopAnims();
    for (var i = 0; i < cmds.length; i++) {
      var u = cmds[i].ui;
      var me = cmds[i] === c;
      var btns = [u.btn, u.cbtn];
      for (j = 0; j < btns.length; j++) {
        // 停用的按鈕被瀏覽器移除焦點時不一定觸發 blur，外框會殘留
        if (c) bmtSet(btns[j], 'outline', 'none');
        btns[j].disabled = !!c;
        bmtSet(btns[j], 'cursor', c ? 'default' : 'pointer');
        bmtSet(btns[j], 'opacity', c && !me ? T.disabledOpacity : '1');
        bmtSet(btns[j], 'background', restBg(btns[j]));
      }
      u.cbtn.title = cmdTitle(cmds[i]);
      bmtSet(u.kbd, 'display', c ? 'none' : 'inline-block');
      bmtSet(u.prog, 'display', me ? 'inline' : 'none');
      u.prog.textContent = '';
      u.icon.replaceChild(me ? spinner(20) : icon(cmds[i].icon, 20, ACCENT), u.icon.firstChild);
      u.cicon.replaceChild(me ? spinner(20) : icon(cmds[i].icon, 20, ACCENT), u.cicon.firstChild);
    }
    miniIcon.replaceChild(c ? spinner(16) : miniGrip, miniIcon.firstChild);
    bmtSet(miniProg, 'display', 'none');
    miniProg.textContent = '';
    if (c) {
      animate(bar, [{ transform: 'translateX(-100%)' }, { transform: 'translateX(260%)' }], T.progress);
      animate(cBar, [{ transform: 'translateX(-100%)' }, { transform: 'translateX(260%)' }], T.progress);
    }
  }

  /**
   * 執行中又觸發指令：短暫顯示「指令執行中」，之後恢復原本持續顯示的進度 toast，
   * 避免等待期間的提示被一則會自動消失的 toast 取代。
   */
  function remindBusy() {
    var t = d.getElementById('__bmt_toast__');
    var prev = t && t.style.opacity !== '0' && t.getAttribute('data-__bmt_type') === 'info' ? t.textContent : null;
    toast('指令執行中', 'info', 0);
    var cur = busy;
    setTimeout(function () {
      var now = d.getElementById('__bmt_toast__');
      if (!now || now.textContent !== '指令執行中') return; // 已被新的訊息取代
      if (busy === cur && prev) toast(prev, 'info', 0);
      else toast('指令執行中', 'info'); // 已結束或原本沒有進度訊息：照常淡出
    }, 1500);
  }

  function run(c) {
    if (busy) return remindBusy();
    var finished = false;
    setBusy(c);
    function arm() {
      clearTimeout(watchdog);
      watchdog = setTimeout(function () {
        if (finished) return;
        ctx.done();
        toast('指令沒有回應，已解除執行中狀態', 'error');
      }, IDLE_MS);
    }
    var ctx = {
      progress: function (text) {
        if (finished) return;
        setProgress(text);
        arm();
      },
      done: function () {
        if (finished) return;
        finished = true;
        clearTimeout(watchdog);
        if (busy === c) setBusy(null);
      }
    };
    arm();
    try {
      c.run(ctx);
    } catch (e) {
      ctx.done();
      toast('執行失敗：' + (e && e.message), 'error');
    }
  }

  // ---------- 拖曳 ----------
  /** 拖曳開始時量一次尺寸，整個面板限制在視窗內；位置存成 right／top。 */
  function startDrag(e) {
    if (e.button !== 0) return;
    for (var t = e.target; t && t !== root; t = t.parentNode) if (t.tagName === 'BUTTON') return;
    e.preventDefault(); // 避免選取文字
    var r = root.getBoundingClientRect();
    var v = viewport();
    var vw = v.w;
    var vh = v.h;
    var sx = e.clientX;
    var sy = e.clientY;
    function move(ev) {
      if ('buttons' in ev && !(ev.buttons & 1)) return up(); // 在視窗外放開：收不到 mouseup
      var x = Math.min(Math.max(r.left + ev.clientX - sx, 0), Math.max(vw - r.width, 0));
      var y = Math.min(Math.max(r.top + ev.clientY - sy, 0), Math.max(vh - r.height, 0));
      bmtSet(root, 'right', vw - x - r.width + 'px');
      bmtSet(root, 'top', y + 'px');
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
  cGrip.addEventListener('mousedown', startDrag);

  // ---------- 快捷鍵：⌥⇧1~9 ----------
  function editable(t) {
    return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  }

  function onKey(e) {
    // 面板被頁面移除（例如 SPA 重新渲染）：一併停用快捷鍵，避免殘留的監聽器搶走新面板的按鍵
    if (!d.documentElement.contains(root)) return detach();
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
  w.addEventListener('resize', keepInView);

  function detach() {
    w.removeEventListener('keydown', onKey, true);
    w.removeEventListener('resize', keepInView);
    clearTimeout(watchdog);
    stopAnims();
  }

  // ---------- 最小化／關閉 ----------
  function on(b, m) {
    b.addEventListener('click', function () {
      setMode(m);
    });
  }
  on(shrinkBtn, 'compact');
  on(minBtn, 'mini');
  on(cExpandBtn, 'full');
  on(cMinBtn, 'mini');
  restoreBtn.addEventListener('click', function () {
    setMode(lastMode);
  });

  function close() {
    if (busy) return;
    detach();
    if (root.parentNode) root.parentNode.removeChild(root);
  }
  closeBtn.addEventListener('click', close);
  cCloseBtn.addEventListener('click', close);

  foot.textContent = opts.footer || '';
  (d.body || d.documentElement).appendChild(root);
  // 第一次出現在右下角：量一次高度換算成 top（之後一律以右上角為準）
  bmtSet(root, 'top', viewport().h - root.getBoundingClientRect().height - 16 + 'px');
  keepInView();

  var api = {
    expand: function () {
      if (mode === 'mini') setMode(lastMode);
      else keepInView();
    },
    close: close,
    busy: function () {
      return !!busy;
    }
  };
  root.__bmtPanel = api;
  return api;
}
