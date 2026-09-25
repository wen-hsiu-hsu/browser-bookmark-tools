/**
 * @name    網頁白板
 * @version 1.0.0
 * @desc    在任何網頁上疊一層透明白板：手繪筆畫 + 便利貼，關閉即消失
 *
 * 建置：npm run build -- web-whiteboard
 */
(function () {
  /* @include toast */

  var d = document;
  var w = window;
  var root = d.documentElement;
  var P = '__bmt_wb_';

  // ---------- 重複開啟 ----------
  if (d.getElementById(P + 'toolbar__')) {
    toast('白板已開啟', 'info');
    return;
  }
  // 舊版（Claude Projects 時期）的白板
  if (d.getElementById('__lm_wb_layer__')) {
    toast('舊版白板仍開著，請先關閉', 'error');
    return;
  }

  // ---------- 常數 ----------
  var Z = 2147483000; // 低於 toast 的 2147483647
  var COLORS = [
    ['#000000', '黑'],
    ['#ffffff', '白'],
    ['#dc2626', '紅'],
    ['#2563eb', '藍'],
    ['#16a34a', '綠'],
    ['#ca8a04', '黃']
  ];
  var WIDTHS = [
    [2, '細'],
    [4, '中'],
    [8, '粗']
  ];
  var NOTE_W = 160;
  var NOTE_H = 120;
  var NOTE_MIN_W = 80;
  var NOTE_MIN_H = 60;
  var ERASE_TOLERANCE = 6;
  var CURSORS = { pen: 'crosshair', eraser: 'cell', note: 'copy' };
  var FONT = '13px/1.4 -apple-system,BlinkMacSystemFont,sans-serif';
  var BTN_BG = '#3f3f46';
  var BTN_HOVER = '#52525b';
  var BTN_ON = '#2563eb';

  // 線條風格圖示（viewBox 24×24），每個元素是一段 path 的 d
  var NS = 'http://www.w3.org/2000/svg';
  var ICONS = {
    grip: ['M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01'],
    pointer: ['M4 4l7 16 2.5-6.5L20 11z'],
    draw: ['M12 19l7-7 3 3-7 7z', 'M18 13l-1.5-7.5L2 2l3.5 14.5L13 18z', 'M2 2l7.6 7.6', 'M11 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'],
    pen: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
    eraser: ['M7 21l-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L13 21', 'M22 21H7', 'M5 11l9 9'],
    note: ['M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5z', 'M15 3v6h6'],
    line: ['M5 12h14'],
    trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6'],
    undo: ['M9 14L4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'],
    redo: ['M15 14l5-5-5-5', 'M20 9H9.5a5.5 5.5 0 0 0 0 11H13'],
    minimize: ['M5 12h14'],
    close: ['M18 6L6 18', 'M6 6l12 12']
  };

  // ---------- 狀態 ----------
  var state = {
    mode: 'interact', // 'interact' | 'draw'
    tool: 'pen', // 'pen' | 'eraser' | 'note'
    color: COLORS[0][0],
    width: WIDTHS[1][0],
    strokes: [], // {id, color, width, points:[{x,y}], box:{x1,y1,x2,y2}}，座標為文件座標
    notes: [], // {id, x, y, w, h, color, text, el}
    undoStack: [],
    redoStack: [],
    dock: 'bottom', // 'top' | 'bottom' | 'left' | 'right'
    minimized: false
  };
  var session = null; // 進行中的畫筆/橡皮擦動作
  var endDrag = null; // 進行中的拖曳（便利貼、工具列）的結束函式
  var uidCounter = 0;
  var vw = 0;
  var vh = 0;
  var dpr = 1;
  var lastClientW = 0;
  var lastClientH = 0;
  var rafPending = false;
  var closed = false;
  var raf =
    w.requestAnimationFrame ||
    function (fn) {
      return setTimeout(fn, 16);
    };

  function uid() {
    uidCounter += 1;
    return 'w' + uidCounter;
  }

  function scrollX() {
    return w.pageXOffset || 0;
  }

  function scrollY() {
    return w.pageYOffset || 0;
  }

  function docPoint(e) {
    return { x: e.clientX + scrollX(), y: e.clientY + scrollY() };
  }

  /**
   * 以 all:initial 隔離頁面 CSS，再套上指定樣式。
   * 每條都加 !important：inline 樣式會輸給頁面樣式表裡的 !important（例如 button{background:red!important}）。
   */
  function css(el, text) {
    el.style.cssText = ('all:initial;box-sizing:border-box;' + text).replace(/;/g, '!important;') + '!important';
  }

  /** 事後修改單一樣式（同樣加 !important）。 */
  function setStyle(el, prop, value) {
    el.style.setProperty(prop, value, 'important');
  }

  function el(tag, text, cls) {
    var e = d.createElement(tag);
    if (text != null) css(e, text);
    if (cls) e.className = P + cls + '__';
    return e;
  }

  function icon(name, size, strokeWidth) {
    var svg = d.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    // 顏色、線寬寫在 style：all:initial 的優先權高於 SVG presentation attribute；
    // all:initial 也會把 color 重設成黑色，所以要 color:inherit 讓 currentColor 取按鈕文字色
    css(
      svg,
      'display:block;flex:0 0 auto;pointer-events:none;color:inherit;' +
        'width:' + size + 'px;height:' + size + 'px;fill:none;stroke:currentColor;' +
        'stroke-width:' + (strokeWidth || 2) + ';stroke-linecap:round;stroke-linejoin:round'
    );
    var paths = ICONS[name];
    for (var i = 0; i < paths.length; i++) {
      var p = d.createElementNS(NS, 'path');
      p.setAttribute('d', paths[i]);
      // 避免頁面的 svg path{...} 規則蓋掉（不能用 all:，會連 d 屬性一起重設）
      p.style.cssText =
        'fill:inherit!important;stroke:inherit!important;stroke-width:inherit!important;' +
        'stroke-linecap:inherit!important;stroke-linejoin:inherit!important';
      svg.appendChild(p);
    }
    return svg;
  }

  // ---------- 畫布（固定於視窗，捲動時重畫） ----------
  var canvas = el('canvas', 'position:fixed;top:0;left:0;z-index:' + Z + ';pointer-events:none;display:block');
  canvas.id = P + 'canvas__';
  root.appendChild(canvas);
  var ctx = canvas.getContext ? canvas.getContext('2d') : null;

  function measure() {
    lastClientW = root.clientWidth;
    lastClientH = root.clientHeight;
    // quirks mode 下 documentElement.clientHeight 是整份文件高度，所以取與 inner* 的較小值
    vw = Math.min(root.clientWidth || w.innerWidth, w.innerWidth);
    vh = Math.min(root.clientHeight || w.innerHeight, w.innerHeight);
    dpr = w.devicePixelRatio || 1;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    setStyle(canvas, 'width', vw + 'px');
    setStyle(canvas, 'height', vh + 'px');
  }

  /** 把 context 的座標系設成「文件座標」。 */
  function applyView() {
    ctx.setTransform(dpr, 0, 0, dpr, -scrollX() * dpr, -scrollY() * dpr);
  }

  function setPen(s) {
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  function drawStroke(s) {
    var pts = s.points;
    setPen(s);
    ctx.beginPath();
    if (pts.length === 1) {
      ctx.arc(pts[0].x, pts[0].y, s.width / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }

  function drawSegment(s, a, b) {
    if (!ctx) return;
    applyView();
    setPen(s);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  function inView(s) {
    var m = s.width;
    var x = scrollX();
    var y = scrollY();
    return s.box.x2 + m >= x && s.box.x1 - m <= x + vw && s.box.y2 + m >= y && s.box.y1 - m <= y + vh;
  }

  function redraw() {
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    applyView();
    for (var i = 0; i < state.strokes.length; i++) {
      if (inView(state.strokes[i])) drawStroke(state.strokes[i]);
    }
    if (session && session.type === 'pen') drawStroke(session.stroke);
  }

  function scheduleRedraw() {
    if (rafPending) return;
    rafPending = true;
    raf(function () {
      rafPending = false;
      if (closed) return;
      // 頁面長高冒出捲軸時不會觸發 resize，順便檢查可視寬高有沒有變
      if (root.clientWidth !== lastClientW || root.clientHeight !== lastClientH) measure();
      redraw();
    });
  }

  function onScroll() {
    scheduleRedraw();
  }

  function onResize() {
    measure();
    scheduleRedraw();
  }

  // ---------- 筆畫幾何 ----------
  function addPoint(s, p) {
    s.points.push(p);
    var b = s.box;
    if (!b) {
      s.box = { x1: p.x, y1: p.y, x2: p.x, y2: p.y };
      return;
    }
    if (p.x < b.x1) b.x1 = p.x;
    if (p.x > b.x2) b.x2 = p.x;
    if (p.y < b.y1) b.y1 = p.y;
    if (p.y > b.y2) b.y2 = p.y;
  }

  function distToSegment(p, a, b) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var lenSq = dx * dx + dy * dy;
    var t = lenSq === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    var ex = p.x - (a.x + t * dx);
    var ey = p.y - (a.y + t * dy);
    return Math.sqrt(ex * ex + ey * ey);
  }

  function cross(a, b, c) {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  }

  /** 線段 ab 與 cd 的最短距離（相交時為 0）。 */
  function segDist(a, b, c, e) {
    var d1 = cross(a, b, c);
    var d2 = cross(a, b, e);
    var d3 = cross(c, e, a);
    var d4 = cross(c, e, b);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
    return Math.min(distToSegment(a, c, e), distToSegment(b, c, e), distToSegment(c, a, b), distToSegment(e, a, b));
  }

  /** 橡皮擦從 a 移到 b 的路徑是否碰到筆畫 s（滑鼠移動快時取樣點會跳過筆畫，所以檢查整段）。 */
  function hitStroke(s, a, b) {
    var r = s.width / 2 + ERASE_TOLERANCE;
    var box = s.box;
    if (
      Math.max(a.x, b.x) < box.x1 - r ||
      Math.min(a.x, b.x) > box.x2 + r ||
      Math.max(a.y, b.y) < box.y1 - r ||
      Math.min(a.y, b.y) > box.y2 + r
    ) {
      return false;
    }
    var pts = s.points;
    if (pts.length === 1) return distToSegment(pts[0], a, b) <= r;
    for (var i = 0; i < pts.length - 1; i++) {
      if (segDist(a, b, pts[i], pts[i + 1]) <= r) return true;
    }
    return false;
  }

  // ---------- Undo / Redo ----------
  function pushUndo(record) {
    state.undoStack.push(record);
    state.redoStack.length = 0;
  }

  function indexById(list, id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return i;
    }
    return -1;
  }

  function removeStroke(id) {
    var i = indexById(state.strokes, id);
    if (i !== -1) state.strokes.splice(i, 1);
  }

  function applyInverse(r) {
    if (r.type === 'stroke-add') removeStroke(r.stroke.id);
    else if (r.type === 'stroke-erase') {
      // 反向插回：每筆的 index 是當時刪除前的位置
      for (var i = r.items.length - 1; i >= 0; i--) state.strokes.splice(r.items[i].index, 0, r.items[i].stroke);
    } else if (r.type === 'clear-all') state.strokes = r.snapshot.slice();
    else if (r.type === 'note-add') removeNote(r.note.id);
    else if (r.type === 'note-delete') {
      state.notes.splice(r.index, 0, r.note);
      mountNote(r.note);
    }
    redraw();
  }

  function applyForward(r) {
    if (r.type === 'stroke-add') state.strokes.push(r.stroke);
    else if (r.type === 'stroke-erase') {
      for (var i = 0; i < r.items.length; i++) removeStroke(r.items[i].stroke.id);
    } else if (r.type === 'clear-all') state.strokes = [];
    else if (r.type === 'note-add') {
      state.notes.push(r.note);
      mountNote(r.note);
    } else if (r.type === 'note-delete') removeNote(r.note.id);
    redraw();
  }

  function undo() {
    var r = state.undoStack.pop();
    if (!r) return toast('沒有可復原的動作', 'error');
    applyInverse(r);
    state.redoStack.push(r);
    toast('已復原');
  }

  function redo() {
    var r = state.redoStack.pop();
    if (!r) return toast('沒有可重做的動作', 'error');
    applyForward(r);
    state.undoStack.push(r);
    toast('已重做');
  }

  // ---------- 拖曳共用 ----------
  /**
   * 開始一段拖曳：onMove(dx, dy) 收到相對起點的位移，onEnd(e) 在放開時呼叫
   * （e 是結束時的滑鼠事件；白板關閉而中止時沒有 e）。
   * 在視窗外放開滑鼠時收不到 mouseup，所以移動時若沒有按著左鍵就視為結束。
   */
  function startDrag(e, onMove, onEnd) {
    if (endDrag) endDrag();
    e.preventDefault();
    var sx = e.clientX;
    var sy = e.clientY;
    function move(e2) {
      if (!(e2.buttons & 1)) return finish(e2);
      onMove(e2.clientX - sx, e2.clientY - sy);
    }
    function finish(end) {
      d.removeEventListener('mousemove', move, true);
      d.removeEventListener('mouseup', finish, true);
      endDrag = null;
      if (onEnd) onEnd(end);
    }
    d.addEventListener('mousemove', move, true);
    d.addEventListener('mouseup', finish, true);
    endDrag = finish;
  }

  // ---------- 便利貼 ----------
  var notesLayer = el('div', 'position:absolute;top:0;left:0;width:0;height:0;overflow:visible;z-index:' + Z);
  notesLayer.id = P + 'notes__';
  root.appendChild(notesLayer);

  function removeNote(id) {
    var i = indexById(state.notes, id);
    if (i === -1) return;
    var note = state.notes[i];
    if (note.el && note.el.parentNode) note.el.parentNode.removeChild(note.el);
    note.el = null;
    state.notes.splice(i, 1);
  }

  function stop(e) {
    e.stopPropagation();
  }

  function mountNote(note) {
    var box = el(
      'div',
      'position:absolute;display:flex;flex-direction:column;pointer-events:auto;overflow:hidden;' +
        'border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,.25);font:' + FONT + ';color:#000',
      'note'
    );
    function place() {
      setStyle(box, 'left', note.x + 'px');
      setStyle(box, 'top', note.y + 'px');
      setStyle(box, 'width', note.w + 'px');
      setStyle(box, 'height', note.h + 'px');
    }
    place();
    setStyle(box, 'background', note.color);

    var hdr = el(
      'div',
      'display:flex;justify-content:flex-end;align-items:center;flex:0 0 auto;height:20px;' +
        'cursor:move;background:rgba(0,0,0,.15)',
      'note_hdr'
    );
    var del = el(
      'button',
      'display:flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;' +
        'border:none;background:transparent;color:#000;cursor:pointer',
      'note_close'
    );
    del.type = 'button';
    del.title = '刪除便利貼';
    del.setAttribute('aria-label', '刪除便利貼');
    del.appendChild(icon('close', 14, 2.5));
    hdr.appendChild(del);

    var body = el(
      'textarea',
      'display:block;flex:1 1 auto;min-height:0;width:100%;padding:6px 6px 14px;border:none;outline:none;' +
        'resize:none;background:transparent;color:#000;font:' + FONT + ';white-space:pre-wrap;' +
        'overflow-wrap:break-word;overflow:auto;cursor:text',
      'note_body'
    );
    body.value = note.text || '';
    body.placeholder = '輸入文字…';

    var grip = el(
      'div',
      'position:absolute;right:0;bottom:0;width:14px;height:14px;cursor:nwse-resize;' +
        'background:linear-gradient(135deg,transparent 50%,rgba(0,0,0,.35) 50%)',
      'note_resize'
    );
    grip.title = '拖曳調整大小';

    box.appendChild(hdr);
    box.appendChild(body);
    box.appendChild(grip);
    notesLayer.appendChild(box);
    note.el = box;

    // 拖曳移動（不納入 undo）
    hdr.addEventListener('mousedown', function (e) {
      if (e.button !== 0 || del.contains(e.target)) return;
      var ox = note.x;
      var oy = note.y;
      startDrag(e, function (dx, dy) {
        note.x = ox + dx;
        note.y = oy + dy;
        place();
      });
    });

    // 縮放（不納入 undo）
    grip.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      var ow = note.w;
      var oh = note.h;
      startDrag(e, function (dx, dy) {
        note.w = Math.max(NOTE_MIN_W, ow + dx);
        note.h = Math.max(NOTE_MIN_H, oh + dy);
        place();
      });
    });

    // 文字編輯（不納入 undo）
    body.addEventListener('input', function () {
      note.text = body.value;
    });
    // 打字時不要觸發網站的快捷鍵
    body.addEventListener('keydown', stop);
    body.addEventListener('keypress', stop);
    body.addEventListener('keyup', stop);

    // 刪除（納入 undo）
    del.addEventListener('click', function (e) {
      e.stopPropagation();
      var i = indexById(state.notes, note.id);
      if (i === -1) return;
      removeNote(note.id);
      pushUndo({ type: 'note-delete', note: note, index: i });
    });

    return body;
  }

  function createNoteAt(pt) {
    var note = {
      id: uid(),
      x: pt.x,
      y: pt.y,
      w: NOTE_W,
      h: NOTE_H,
      color: state.color === '#000000' ? '#ffffff' : state.color, // 黑底看不到黑字，改用白色
      text: ''
    };
    state.notes.push(note);
    var body = mountNote(note);
    pushUndo({ type: 'note-add', note: note });
    try {
      body.focus({ preventScroll: true });
    } catch (err) {
      body.focus();
    }
  }

  // ---------- 畫布互動 ----------
  /**
   * 刪除橡皮擦路徑 a→b 碰到的筆畫。
   * 點擊（a === b）只刪最上層那條；拖曳時刪除沿途碰到的所有筆畫。
   * 同一次按下到放開擦掉的筆畫合併成一筆 undo 紀錄。
   */
  function eraseAlong(a, b) {
    var hit = false;
    for (var i = state.strokes.length - 1; i >= 0; i--) {
      if (hitStroke(state.strokes[i], a, b)) {
        if (!session.record) {
          session.record = { type: 'stroke-erase', items: [] };
          pushUndo(session.record);
        }
        session.record.items.push({ stroke: state.strokes.splice(i, 1)[0], index: i });
        hit = true;
        if (a === b) break;
      }
    }
    if (hit) redraw();
  }

  function endSession() {
    if (!session) return;
    var s = session;
    session = null;
    if (s.type === 'pen') {
      state.strokes.push(s.stroke);
      pushUndo({ type: 'stroke-add', stroke: s.stroke });
    }
  }

  canvas.addEventListener('mousedown', function (e) {
    if (state.mode !== 'draw' || e.button !== 0) return;
    e.preventDefault(); // 避免反白頁面文字或觸發拖放
    // preventDefault 會讓焦點留在原本的便利貼，之後的 Ctrl+Z 會變成還原文字，所以手動移開
    var active = d.activeElement;
    if (active && active !== d.body && isEditable(active) && active.blur) active.blur();
    endSession();
    var pt = docPoint(e);
    if (state.tool === 'pen') {
      var stroke = { id: uid(), color: state.color, width: state.width, points: [] };
      addPoint(stroke, pt);
      session = { type: 'pen', stroke: stroke };
      if (ctx) {
        applyView();
        drawStroke(stroke);
      }
    } else if (state.tool === 'eraser') {
      session = { type: 'eraser', last: pt };
      eraseAlong(pt, pt);
    } else if (state.tool === 'note') {
      createNoteAt(pt);
    }
  });

  function onMouseMove(e) {
    if (!session) return;
    if (!(e.buttons & 1)) return endSession(); // 在視窗外放開滑鼠
    var pt = docPoint(e);
    if (session.type === 'pen') {
      var pts = session.stroke.points;
      var last = pts[pts.length - 1];
      if (last.x === pt.x && last.y === pt.y) return;
      addPoint(session.stroke, pt);
      drawSegment(session.stroke, last, pt);
    } else {
      eraseAlong(session.last, pt);
      session.last = pt;
    }
  }

  d.addEventListener('mousemove', onMouseMove);
  d.addEventListener('mouseup', endSession);

  // ---------- 工具列 ----------
  var bar = el(
    'div',
    'position:fixed;z-index:' + Z + ';display:flex;align-items:center;gap:6px;padding:8px;' +
      'background:rgba(30,30,30,.92);color:#fff;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.3);' +
      'font:' + FONT + ';pointer-events:auto'
  );
  bar.id = P + 'toolbar__';

  var bubble = el(
    'button',
    'position:fixed;z-index:' + Z + ';display:none;align-items:center;justify-content:center;' +
      'width:40px;height:40px;padding:0;border:none;border-radius:50%;background:rgba(30,30,30,.92);' +
      'color:#fff;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.3);pointer-events:auto'
  );
  bubble.id = P + 'bubble__';
  bubble.type = 'button';
  bubble.title = '展開白板工具列';
  bubble.setAttribute('aria-label', '展開白板工具列');
  bubble.appendChild(icon('pen', 20));

  var seps = [];

  function paintButton(b, hover) {
    setStyle(b, 'background', b.__bmtOn ? BTN_ON : hover ? BTN_HOVER : BTN_BG);
  }

  function setOn(b, on) {
    b.__bmtOn = on;
    paintButton(b, false);
  }

  function button(label, title, child, onClick) {
    var b = el(
      'button',
      'display:flex;align-items:center;justify-content:center;flex:0 0 auto;width:32px;height:32px;' +
        'padding:0;margin:0;border:none;border-radius:6px;color:#fff;cursor:pointer;background:' + BTN_BG
    );
    b.type = 'button';
    b.title = title;
    b.setAttribute('aria-label', label);
    b.appendChild(child);
    b.addEventListener('mouseenter', function () {
      paintButton(b, true);
    });
    b.addEventListener('mouseleave', function () {
      paintButton(b, false);
    });
    b.addEventListener('click', onClick);
    bar.appendChild(b);
    return b;
  }

  function sep() {
    var s = el('div', 'flex:0 0 auto;background:rgba(255,255,255,.2)');
    seps.push(s);
    bar.appendChild(s);
  }

  // 1. 拖曳把手
  var grip = el(
    'div',
    'display:flex;align-items:center;justify-content:center;flex:0 0 auto;width:20px;height:32px;' +
      'color:rgba(255,255,255,.6);cursor:grab'
  );
  grip.title = '拖曳以移動工具列';
  grip.setAttribute('aria-label', '移動工具列');
  grip.appendChild(icon('grip', 18, 3));
  bar.appendChild(grip);

  // 2. 模式切換
  var modeBtn = button('切換模式', '', icon('pointer', 18), function () {
    setMode(state.mode === 'draw' ? 'interact' : 'draw');
  });
  sep();

  // 3. 工具
  var toolBtns = {
    pen: button('筆', '筆', icon('pen', 18), function () {
      selectTool('pen');
    }),
    eraser: button('橡皮擦', '橡皮擦（整條筆畫刪除）', icon('eraser', 18), function () {
      selectTool('eraser');
    }),
    note: button('便利貼', '便利貼（點畫布新增）', icon('note', 18), function () {
      selectTool('note');
    })
  };
  sep();

  // 4. 顏色
  var swatches = [];
  COLORS.forEach(function (c) {
    var b = el(
      'button',
      'display:block;flex:0 0 auto;width:22px;height:22px;margin:0 2px;padding:0;border-radius:50%;' +
        'cursor:pointer;background:' + c[0]
    );
    b.type = 'button';
    b.title = c[1];
    b.setAttribute('aria-label', c[1]);
    b.addEventListener('click', function () {
      state.color = c[0];
      updateColorUI();
    });
    swatches.push(b);
    bar.appendChild(b);
  });
  sep();

  // 5. 粗細
  var widthBtns = WIDTHS.map(function (wd, i) {
    return button(wd[1], '粗細：' + wd[1] + '（' + wd[0] + 'px）', icon('line', 18, [1.5, 3, 5.5][i]), function () {
      state.width = wd[0];
      updateWidthUI();
    });
  });
  sep();

  // 6. 清除、復原、重做
  button('清除全部', '清除所有筆畫（便利貼保留）', icon('trash', 18), clearAll);
  button('復原', '復原（Ctrl+Z）', icon('undo', 18), undo);
  button('重做', '重做（Ctrl+Y）', icon('redo', 18), redo);
  sep();

  // 7. 最小化、關閉
  button('最小化', '最小化工具列', icon('minimize', 18), function () {
    setMinimized(true);
  });
  button('關閉白板', '關閉白板（內容不會保存）', icon('close', 18), attemptClose);

  bubble.addEventListener('click', function () {
    setMinimized(false);
  });

  root.appendChild(bar);
  root.appendChild(bubble);

  // 白板元件上的點擊不傳到頁面（避免觸發頁面的「點外面關閉」或搶焦點的處理）
  [bar, bubble, notesLayer].forEach(function (n) {
    ['mousedown', 'pointerdown', 'click'].forEach(function (type) {
      n.addEventListener(type, stop);
    });
  });

  function updateToolUI() {
    for (var k in toolBtns) setOn(toolBtns[k], k === state.tool);
    setStyle(canvas, 'cursor', CURSORS[state.tool]);
  }

  function updateColorUI() {
    for (var i = 0; i < swatches.length; i++) {
      var on = COLORS[i][0] === state.color;
      setStyle(swatches[i], 'border', '2px solid ' + (on ? '#fff' : 'rgba(255,255,255,.25)'));
      setStyle(swatches[i], 'box-shadow', on ? '0 0 0 2px #2563eb' : 'none');
    }
  }

  function updateWidthUI() {
    for (var i = 0; i < widthBtns.length; i++) setOn(widthBtns[i], WIDTHS[i][0] === state.width);
  }

  function updateModeUI() {
    var draw = state.mode === 'draw';
    setOn(modeBtn, draw);
    modeBtn.title = draw ? '目前：畫圖模式（點擊或按 Esc 切回互動模式）' : '目前：互動模式（點擊切換到畫圖模式）';
    modeBtn.replaceChild(icon(draw ? 'draw' : 'pointer', 18), modeBtn.firstChild);
    setStyle(canvas, 'pointer-events', draw ? 'auto' : 'none');
  }

  function setMode(mode) {
    if (state.mode === mode) return;
    if (mode !== 'draw') endSession();
    state.mode = mode;
    updateModeUI();
    toast(mode === 'draw' ? '已切換至畫圖模式' : '已切換至互動模式');
  }

  function selectTool(tool) {
    state.tool = tool;
    updateToolUI();
    setMode('draw');
  }

  /**
   * 把工具列（或最小化圓鈕）貼到指定邊並置中。
   * 置中用「兩側 0 + margin auto」而不是 left:50% + translate：
   * 後者的可用寬度只剩半個視窗，工具列會提早折行。
   */
  function placeOnEdge(node, edge) {
    var horizontal = edge === 'top' || edge === 'bottom';
    var opposite = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
    setStyle(node, 'transform', 'none');
    setStyle(node, edge, '16px');
    setStyle(node, opposite[edge], 'auto');
    setStyle(node, horizontal ? 'left' : 'top', '0');
    setStyle(node, horizontal ? 'right' : 'bottom', '0');
    setStyle(node, 'margin', horizontal ? '0 auto' : 'auto 0');
  }

  function applyDock() {
    var vertical = state.dock === 'left' || state.dock === 'right';
    placeOnEdge(bar, state.dock);
    placeOnEdge(bubble, state.dock);
    setStyle(bar, 'flex-direction', vertical ? 'column' : 'row');
    setStyle(bar, 'flex-wrap', vertical ? 'nowrap' : 'wrap');
    // 直向可捲動時若置中，上方溢出的部分捲不到，所以從頭排
    setStyle(bar, 'justify-content', vertical ? 'flex-start' : 'center');
    setStyle(bar, 'width', vertical ? 'auto' : 'max-content');
    setStyle(bar, 'height', vertical ? 'max-content' : 'auto');
    setStyle(bar, 'max-width', vertical ? 'none' : 'calc(100vw - 32px)');
    setStyle(bar, 'max-height', vertical ? 'calc(100vh - 32px)' : 'none');
    setStyle(bar, 'overflow-y', vertical ? 'auto' : 'visible');
    setStyle(bar, 'overflow-x', 'hidden');
    setStyle(grip, 'width', vertical ? '32px' : '20px');
    setStyle(grip, 'height', vertical ? '20px' : '32px');
    for (var i = 0; i < seps.length; i++) {
      setStyle(seps[i], 'width', vertical ? '24px' : '1px');
      setStyle(seps[i], 'height', vertical ? '1px' : '24px');
    }
  }

  function setMinimized(min) {
    state.minimized = min;
    // 縮小工具列通常是想回去操作網頁；圓鈕也看不出目前模式，所以切回互動模式
    if (min) setMode('interact');
    setStyle(bar, 'display', min ? 'none' : 'flex');
    setStyle(bubble, 'display', min ? 'flex' : 'none');
  }

  // 拖曳工具列：放開後依滑鼠位置吸附到最近的邊
  // （不用工具列中心：橫向工具列很寬，拖到左邊時中心仍靠近畫面中間）
  grip.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    var r = bar.getBoundingClientRect();
    setStyle(bar, 'right', 'auto');
    setStyle(bar, 'bottom', 'auto');
    setStyle(bar, 'margin', '0');
    setStyle(bar, 'left', r.left + 'px');
    setStyle(bar, 'top', r.top + 'px');
    setStyle(grip, 'cursor', 'grabbing');
    startDrag(
      e,
      function (dx, dy) {
        setStyle(bar, 'left', r.left + dx + 'px');
        setStyle(bar, 'top', r.top + dy + 'px');
      },
      function (end) {
        setStyle(grip, 'cursor', 'grab');
        if (!end) return; // 白板關閉時中止拖曳
        var x = end.clientX;
        var y = end.clientY;
        var dist = { top: y, bottom: w.innerHeight - y, left: x, right: w.innerWidth - x };
        var best = 'bottom';
        for (var k in dist) {
          if (dist[k] < dist[best]) best = k;
        }
        state.dock = best;
        applyDock();
      }
    );
  });

  // ---------- 清除全部（只清筆畫） ----------
  function clearAll() {
    if (!state.strokes.length) return toast('目前沒有筆畫', 'error');
    var snapshot = state.strokes.slice();
    state.strokes = [];
    redraw();
    pushUndo({ type: 'clear-all', snapshot: snapshot });
    toast('已清除所有筆畫');
  }

  // ---------- 鍵盤快捷鍵 ----------
  function isEditable(t) {
    return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  }

  function onKeyDown(e) {
    if (notesLayer.contains(e.target)) {
      e.stopPropagation(); // 在便利貼打字時不觸發網站的快捷鍵
      return;
    }
    if (isEditable(e.target)) return; // 保留輸入框原本的 undo 等行為
    if (e.key === 'Escape' || e.key === 'Esc') {
      if (state.mode !== 'draw') return;
      // 只在真的切換模式時攔下，避免同時關掉頁面上的對話框
      e.preventDefault();
      e.stopPropagation();
      setMode('interact');
      return;
    }
    if (state.mode !== 'draw' || !(e.ctrlKey || e.metaKey) || e.altKey) return;
    var key = (e.key || '').toLowerCase();
    var action;
    if (key === 'z' && !e.shiftKey) action = undo;
    else if (key === 'y' || (key === 'z' && e.shiftKey)) action = redo;
    else return;
    e.preventDefault();
    e.stopPropagation();
    action();
  }

  // capture：先於頁面自己的快捷鍵處理
  w.addEventListener('keydown', onKeyDown, true);
  w.addEventListener('scroll', onScroll);
  w.addEventListener('resize', onResize);

  // ---------- 關閉 ----------
  function attemptClose() {
    if (state.strokes.length || state.notes.length) {
      if (!w.confirm('白板尚有內容，關閉後將永久遺失，確定要關閉嗎？')) return;
    }
    teardown();
    toast('已關閉白板');
  }

  function teardown() {
    closed = true;
    session = null;
    if (endDrag) endDrag();
    d.removeEventListener('mousemove', onMouseMove);
    d.removeEventListener('mouseup', endSession);
    w.removeEventListener('keydown', onKeyDown, true);
    w.removeEventListener('scroll', onScroll);
    w.removeEventListener('resize', onResize);
    [canvas, notesLayer, bar, bubble].forEach(function (n) {
      if (n.parentNode) n.parentNode.removeChild(n);
    });
  }

  // ---------- 初始化 ----------
  measure();
  applyDock();
  updateToolUI();
  updateColorUI();
  updateWidthUI();
  updateModeUI();
  toast('白板已開啟');
})();
