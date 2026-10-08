'use strict';

var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var JSDOM = require('jsdom').JSDOM;
var build = require('../scripts/build.js');

// 舊版三支書籤的測試，改以「fm-tools 面板 + 點擊對應按鈕」再跑一次（見 test/fm-target.js）
global.__bmtFmTools = true;
require('./fm-learning-md.test.js');
require('./fm-flashcard-batch.test.js');
require('./fm-transcript-copy.test.js');

var SRC = fs.readFileSync(path.join(__dirname, '../bookmarks/fm-tools/source.js'), 'utf8');
var CODE;
var ID = '__bmt_fm_tools__';

function flush() {
  return new Promise(function (r) { setImmediate(r); });
}

/** 可手動推進的假計時器（含 Date.now）。 */
function fakeTimers(win) {
  var now = 0;
  var seq = 0;
  var timers = {};
  win.setTimeout = function (fn, ms) {
    timers[++seq] = { fn: fn, at: now + (ms || 0) };
    return seq;
  };
  win.clearTimeout = function (id) {
    delete timers[id];
  };
  var base = Date.now();
  win.Date.now = function () {
    return base + now;
  };
  return function tick(ms) {
    var end = now + ms;
    for (;;) {
      var next = null;
      Object.keys(timers).forEach(function (id) {
        if (timers[id].at <= end && (!next || timers[id].at < timers[next].at)) next = id;
      });
      if (!next) break;
      var t = timers[next];
      delete timers[next];
      now = t.at;
      t.fn();
    }
    now = end;
  };
}

var CARD =
  '<div class="LM-Flashcard"><div class="LM-Flashcard-front"><div class="LM-Flashcard-text">Q</div></div>' +
  '<div class="LM-Flashcard-back"><div class="LM-Flashcard-text">A</div></div></div>';

async function setup(html) {
  if (!CODE) CODE = decodeURIComponent((await build.toBookmarklet(SRC)).slice('javascript:'.length));
  var win = new JSDOM('<!doctype html><body>' + (html || '') + '<input id="inp"></body>', {
    runScripts: 'outside-only'
  }).window;
  var r = { win: win, d: win.document, copied: [], tick: fakeTimers(win) };
  Object.defineProperty(win.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: function (t) { r.copied.push(t); return Promise.resolve(); } }
  });
  win.document.execCommand = function () { return false; };
  r.run = function () { win.eval(CODE); };
  r.panel = function () { return win.document.getElementById(ID); };
  r.btn = function (id) { return win.document.querySelector('#' + ID + ' [data-__bmt_cmd="' + id + '"]'); };
  r.label = function (name) { return win.document.querySelector('#' + ID + ' [aria-label="' + name + '"]'); };
  r.key = function (code, opts, target) {
    opts = opts || {};
    var e = new win.KeyboardEvent('keydown', {
      code: code, altKey: opts.alt !== false, shiftKey: opts.shift !== false, repeat: !!opts.repeat,
      bubbles: true, cancelable: true
    });
    (target || win.document.body).dispatchEvent(e);
    return e;
  };
  r.toast = function () {
    var el = win.document.getElementById('__bmt_toast__');
    return el && el.textContent;
  };
  r.run();
  return r;
}

/** 展開、最小化、縮小三個區塊（root 的子元素）。 */
function parts(r) {
  var p = r.panel();
  return { full: p.children[0], mini: p.children[1], compact: p.children[2] };
}

test('建立面板：標題、三顆按鈕（icon、文字、⌥⇧ 快捷鍵）', async function () {
  var r = await setup();
  var p = r.panel();
  assert.ok(p);
  assert.ok(p.textContent.indexOf('Master.dev 工具') >= 0);
  var expect = [['md', '目前這題轉 MD', '⌥⇧1'], ['batch', '學習卡批次複製', '⌥⇧2'], ['transcript', '逐字稿複製', '⌥⇧3']];
  expect.forEach(function (e) {
    var b = r.btn(e[0]);
    assert.ok(b, e[0]);
    assert.ok(b.querySelector('svg'), e[0] + ' 有 icon');
    assert.ok(b.textContent.indexOf(e[1]) >= 0);
    assert.strictEqual(b.querySelector('kbd').textContent, e[2]);
  });
});

test('重複點書籤：不建立第二個面板，最小化時改為展開', async function () {
  var r = await setup();
  r.label('最小化').click();
  assert.strictEqual(parts(r).full.style.display, 'none');
  r.run();
  assert.strictEqual(r.d.querySelectorAll('#' + ID).length, 1);
  assert.strictEqual(parts(r).full.style.display, 'block');
  assert.strictEqual(parts(r).mini.style.display, 'none');
});

test('最小化與展開', async function () {
  var r = await setup();
  r.label('最小化').click();
  assert.strictEqual(parts(r).mini.style.display, 'flex');
  assert.ok(parts(r).mini.textContent.indexOf('Master.dev') >= 0);
  r.label('還原').click();
  assert.strictEqual(parts(r).full.style.display, 'block');
  assert.strictEqual(parts(r).mini.style.display, 'none');
});

test('快捷鍵 ⌥⇧1 觸發；最小化時仍有效', async function () {
  var r = await setup(CARD);
  r.label('最小化').click();
  var e = r.key('Digit1');
  assert.strictEqual(e.defaultPrevented, true);
  await flush();
  assert.deepStrictEqual(r.copied, ['### Q\n\nA']);
});

test('快捷鍵：缺 Shift、焦點在輸入框、長按連發、沒有對應指令時都不觸發', async function () {
  var r = await setup(CARD);
  r.key('Digit1', { shift: false });
  r.key('Digit1', {}, r.d.getElementById('inp'));
  r.key('Digit1', { repeat: true });
  var e = r.key('Digit9');
  await flush();
  assert.deepStrictEqual(r.copied, []);
  assert.strictEqual(e.defaultPrevented, false);
});

test('關閉：移除面板並停用快捷鍵', async function () {
  var r = await setup(CARD);
  r.label('關閉').click();
  assert.strictEqual(r.panel(), null);
  r.key('Digit1');
  await flush();
  assert.deepStrictEqual(r.copied, []);
  r.run(); // 關閉後再點書籤可重新建立
  assert.ok(r.panel());
});

test('執行中：外框、進度條、進度文字；其他按鈕與關閉停用；快捷鍵提示執行中；結束後恢復', async function () {
  var r = await setup(
    '<div class="transcripts"></div><div class="FMPlayer2-Transcripts active"></div>'
  );
  r.btn('transcript').click(); // 面板已開啟但沒有內容：進入等待
  var f = parts(r).full;
  assert.ok(/^0 0 0 2px/.test(f.style.boxShadow), '外框亮起');
  assert.strictEqual(f.children[1].style.display, 'block', '進度條顯示');
  assert.strictEqual(r.btn('transcript').textContent.indexOf('載入中') >= 0, true);
  assert.strictEqual(r.btn('md').disabled, true);
  assert.strictEqual(r.btn('batch').disabled, true);
  assert.strictEqual(r.label('關閉').disabled, true);
  r.label('關閉').click();
  assert.ok(r.panel(), '執行中不能關閉');
  r.key('Digit1');
  assert.strictEqual(r.toast(), '指令執行中');

  r.tick(4000); // 逾時結束
  assert.strictEqual(r.toast(), '已開啟 Transcripts 但抓不到逐字稿，請稍後再試');
  assert.ok(!/^0 0 0 2px/.test(f.style.boxShadow), '外框恢復');
  assert.strictEqual(f.children[1].style.display, 'none');
  assert.strictEqual(r.btn('md').disabled, false);
  assert.strictEqual(r.label('關閉').disabled, false);
  assert.strictEqual(r.btn('transcript').querySelector('kbd').style.display, 'inline-block');
});

test('最小化時執行：膠囊顯示外框與進度文字', async function () {
  var r = await setup('<div class="transcripts"></div><div class="FMPlayer2-Transcripts active"></div>');
  r.label('最小化').click();
  r.key('Digit3');
  var m = parts(r).mini;
  assert.ok(/^0 0 0 2px/.test(m.style.boxShadow));
  assert.ok(m.textContent.indexOf('載入中') >= 0);
  r.tick(4000);
  assert.strictEqual(m.textContent.indexOf('載入中'), -1);
});

test('拖曳：限制在視窗內，位置以 right／top 表示；從按鈕上按下不會拖曳', async function () {
  var r = await setup();
  var p = r.panel();
  var win = r.win;
  p.getBoundingClientRect = function () {
    return { left: 100, top: 100, width: 264, height: 200, right: 364, bottom: 300 };
  };
  var head = parts(r).full.children[0];
  function mouse(type, target, x, y) {
    target.dispatchEvent(new win.MouseEvent(type, { clientX: x, clientY: y, button: 0, buttons: 1, bubbles: true }));
  }
  var vw = win.innerWidth;
  var vh = win.innerHeight;

  mouse('mousedown', head, 110, 110);
  mouse('mousemove', r.d, 60, 80); // 位移 (-50, -30)
  assert.strictEqual(p.style.right, vw - 50 - 264 + 'px');
  assert.strictEqual(p.style.top, '70px');
  mouse('mousemove', r.d, -5000, -5000); // 拖出左上：限制在 0
  assert.strictEqual(p.style.right, vw - 264 + 'px');
  assert.strictEqual(p.style.top, '0px');
  mouse('mousemove', r.d, 5000, 5000); // 拖出右下：限制在 0
  assert.strictEqual(p.style.right, '0px');
  assert.strictEqual(p.style.top, vh - 200 + 'px');
  mouse('mouseup', r.d, 0, 0);
  mouse('mousemove', r.d, 110, 110); // 放開後不再移動
  assert.strictEqual(p.style.right, '0px');

  mouse('mousedown', r.label('最小化'), 110, 110);
  mouse('mousemove', r.d, 60, 80);
  assert.strictEqual(p.style.right, '0px', '從按鈕開始不拖曳');
});

test('注入頁面的 id 使用 __bmt_ 前綴', async function () {
  var r = await setup();
  assert.ok(/^__bmt_/.test(r.panel().id));
  Array.prototype.forEach.call(r.panel().querySelectorAll('[data-__bmt_cmd]'), function (b) {
    assert.ok(b.getAttribute('data-__bmt_cmd'));
  });
});

test('建置結果不含控制字元', async function () {
  var url = await build.toBookmarklet(SRC);
  assert.ok(!/[\x00-\x1f\x7f]/.test(url));
});

// ---- code review 補充 ----

function idle(r) {
  return ['md', 'batch', 'transcript'].every(function (id) { return !r.btn(id).disabled; }) &&
    !/^0 0 0 2px/.test(parts(r).full.style.boxShadow);
}

test('各指令結束後面板都回到閒置狀態', async function () {
  var r = await setup(CARD);
  r.btn('md').click();
  await flush();
  assert.ok(idle(r), 'md 成功');
  r.d.querySelector('.LM-Flashcard').remove();
  r.btn('md').click();
  assert.ok(idle(r), 'md 失敗');
  r.btn('batch').click();
  assert.ok(idle(r), 'batch 找不到');
  r.btn('transcript').click();
  assert.ok(idle(r), 'transcript 找不到');
});

test('舊版批次書籤執行中（共用標記）→ 提示批次複製執行中，面板回到閒置', async function () {
  var r = await setup(CARD);
  r.d.documentElement.setAttribute('data-__bmt_fm_batch', r.win.Date.now());
  r.btn('batch').click();
  assert.strictEqual(r.toast(), '批次複製執行中');
  assert.ok(idle(r));
  assert.deepStrictEqual(r.copied, []);
});

test('舊版逐字稿書籤等待中（共用標記）→ 不點按鈕，複製成功後也不關閉', async function () {
  var r = await setup('<button class="FMPlayer2-RibbonButton" data-fmp-tooltip="Transcripts (R)"></button>');
  var clicks = 0;
  r.d.querySelector('button.FMPlayer2-RibbonButton').addEventListener('click', function () { clicks++; });
  r.d.documentElement.setAttribute('data-__bmt_fm_opening', r.win.Date.now());
  r.btn('transcript').click();
  var box = r.d.createElement('div');
  box.className = 'transcripts FMPlayer2-Transcripts active';
  box.innerHTML = '<a class="line">x</a>';
  r.d.body.appendChild(box);
  r.tick(1000);
  await flush();
  assert.deepStrictEqual(r.copied, ['x']);
  assert.strictEqual(clicks, 0);
});

/** 開關式 Transcripts 按鈕；onOpen(panel) 在開啟時呼叫。回傳點擊次數。 */
function toggleButton(r, onOpen) {
  var clicks = { n: 0 };
  r.d.querySelector('button.FMPlayer2-RibbonButton').addEventListener('click', function () {
    clicks.n++;
    var p = r.d.querySelector('.FMPlayer2-Transcripts');
    if (p) return p.classList.toggle('active');
    p = r.d.createElement('div');
    p.className = 'FMPlayer2-Transcripts active';
    r.d.body.appendChild(p);
    onOpen(p);
  });
  return clicks;
}

var TS_BTN = '<button class="FMPlayer2-RibbonButton" data-fmp-tooltip="Transcripts (R)"></button>';

test('逐字稿：使用者在複製前自己關掉面板 → 不再點按鈕', async function () {
  var r = await setup(TS_BTN);
  var clicks = toggleButton(r, function (p) {
    r.win.setTimeout(function () {
      var t = r.d.createElement('div');
      t.className = 'transcripts';
      t.innerHTML = '<a class="line">x</a>';
      p.appendChild(t);
      p.classList.remove('active'); // 使用者手動關閉
    }, 300);
  });
  r.btn('transcript').click();
  r.tick(1000);
  await flush();
  assert.deepStrictEqual(r.copied, ['x']);
  assert.strictEqual(clicks.n, 1);
});

test('逐字稿：逾時當下內容仍在變動 → 複製目前內容，但不關閉面板', async function () {
  var r = await setup(TS_BTN);
  var clicks = toggleButton(r, function (p) {
    var t = r.d.createElement('div');
    t.className = 'transcripts';
    p.appendChild(t);
    var n = 0;
    (function add() {
      var a = r.d.createElement('a');
      a.className = 'line';
      a.textContent = 'L' + n++;
      t.appendChild(a);
      r.win.setTimeout(add, 100); // 持續增加，永遠不穩定
    })();
  });
  r.btn('transcript').click();
  r.tick(3200);
  await flush();
  assert.strictEqual(r.copied.length, 1);
  assert.strictEqual(clicks.n, 1);
  assert.ok(r.d.querySelector('.FMPlayer2-Transcripts.active'));
});

test('看門狗：指令一直沒結束 → 15 秒後解除執行中並提示', async function () {
  var r = await setup(CARD);
  Object.defineProperty(r.win.navigator, 'clipboard', {
    value: { writeText: function () { return new r.win.Promise(function () {}); } }
  });
  r.btn('md').click();
  r.tick(14000);
  assert.ok(!idle(r));
  r.tick(1500);
  assert.ok(idle(r));
  assert.strictEqual(r.toast(), '指令沒有回應，已解除執行中狀態');
});

test('執行中按快捷鍵：短暫提示後恢復原本的進度 toast', async function () {
  var r = await setup('<div class="transcripts"></div><div class="FMPlayer2-Transcripts active"></div>');
  r.btn('transcript').click();
  assert.strictEqual(r.toast(), '正在開啟 Transcripts…');
  r.key('Digit1');
  assert.strictEqual(r.toast(), '指令執行中');
  r.tick(1600);
  assert.strictEqual(r.toast(), '正在開啟 Transcripts…');
});

test('拖曳：滑鼠在視窗外放開（buttons=0）就停止', async function () {
  var r = await setup();
  var p = r.panel();
  var win = r.win;
  p.getBoundingClientRect = function () {
    return { left: 100, top: 100, width: 264, height: 200, right: 364, bottom: 300 };
  };
  var head = parts(r).full.children[0];
  head.dispatchEvent(new win.MouseEvent('mousedown', { clientX: 110, clientY: 110, button: 0, buttons: 1, bubbles: true }));
  r.d.dispatchEvent(new win.MouseEvent('mousemove', { clientX: 120, clientY: 120, buttons: 0, bubbles: true }));
  var right = p.style.right;
  r.d.dispatchEvent(new win.MouseEvent('mousemove', { clientX: 300, clientY: 300, buttons: 1, bubbles: true }));
  assert.strictEqual(p.style.right, right);
});

test('視窗縮小或重新點書籤：面板被夾回視窗內', async function () {
  var r = await setup();
  var p = r.panel();
  p.getBoundingClientRect = function () {
    return { left: 0, top: 0, width: 264, height: 200, right: 264, bottom: 200 };
  };
  p.style.right = '5000px';
  p.style.top = '-50px';
  r.win.dispatchEvent(new r.win.Event('resize'));
  assert.strictEqual(p.style.right, r.win.innerWidth - 264 + 'px');
  assert.strictEqual(p.style.top, '0px');
  p.style.right = '5000px';
  r.run();
  assert.strictEqual(p.style.right, r.win.innerWidth - 264 + 'px');
});

test('面板被頁面移除後：舊的快捷鍵監聽失效，重新點書籤的新面板可正常使用', async function () {
  var r = await setup(CARD);
  r.panel().remove();
  r.key('Digit1');
  await flush();
  assert.deepStrictEqual(r.copied, []);
  r.run();
  r.key('Digit1');
  await flush();
  assert.deepStrictEqual(r.copied, ['### Q\n\nA']);
});

test('不同版本的面板：閒置時換成新版', async function () {
  var r = await setup();
  var old = r.panel();
  old.setAttribute('data-__bmt_ver', '0.9.0');
  r.run();
  assert.notStrictEqual(r.panel(), old);
  assert.strictEqual(r.d.querySelectorAll('#' + ID).length, 1);
  assert.strictEqual(r.panel().getAttribute('data-__bmt_ver'), '1.1.0');
});

// ---- v1.1.0：右上角定位、縮小模式、icon 顏色、cursor ----

/** 依 display 判斷目前模式。 */
function mode(r) {
  var p = parts(r);
  if (p.full.style.display === 'block') return 'full';
  if (p.compact.style.display === 'flex') return 'compact';
  if (p.mini.style.display === 'flex') return 'mini';
  return null;
}

/** 在指定區塊內找控制鈕。 */
function ctl(r, part, name) {
  return parts(r)[part].querySelector('[aria-label="' + name + '"]');
}

function cbtn(r, id) {
  return r.d.querySelector('#' + ID + ' [data-__bmt_ccmd="' + id + '"]');
}

test('初始位置在右下角，以 right／top 表示', async function () {
  var r = await setup();
  var p = r.panel();
  assert.strictEqual(p.style.right, '16px');
  assert.strictEqual(p.style.top, r.win.innerHeight - 16 + 'px'); // jsdom 量不到高度，高度為 0
  assert.strictEqual(p.style.bottom, '');
});

test('切換模式時右上角不動', async function () {
  var r = await setup();
  var p = r.panel();
  p.style.right = '40px';
  p.style.top = '30px';
  ctl(r, 'full', '最小化').click();
  assert.strictEqual(mode(r), 'mini');
  assert.strictEqual(p.style.right, '40px');
  assert.strictEqual(p.style.top, '30px');
  ctl(r, 'mini', '還原').click();
  ctl(r, 'full', '縮小').click();
  assert.strictEqual(mode(r), 'compact');
  assert.strictEqual(p.style.right, '40px');
  assert.strictEqual(p.style.top, '30px');
});

test('三種模式直達切換；膠囊還原到最小化前的模式', async function () {
  var r = await setup();
  ctl(r, 'full', '縮小').click();
  assert.strictEqual(mode(r), 'compact');
  ctl(r, 'compact', '最小化').click();
  assert.strictEqual(mode(r), 'mini');
  ctl(r, 'mini', '還原').click();
  assert.strictEqual(mode(r), 'compact', '回到縮小');
  ctl(r, 'compact', '展開').click();
  assert.strictEqual(mode(r), 'full');
  ctl(r, 'full', '最小化').click();
  ctl(r, 'mini', '還原').click();
  assert.strictEqual(mode(r), 'full', '回到展開');
  ctl(r, 'full', '縮小').click();
  ctl(r, 'compact', '關閉').click();
  assert.strictEqual(r.panel(), null);
});

test('重複點書籤：最小化時還原到之前的模式；縮小時維持縮小', async function () {
  var r = await setup();
  ctl(r, 'full', '縮小').click();
  r.run();
  assert.strictEqual(mode(r), 'compact');
  ctl(r, 'compact', '最小化').click();
  r.run();
  assert.strictEqual(mode(r), 'compact');
});

test('縮小模式：只有 icon，title 帶名稱與快捷鍵；點擊可執行', async function () {
  var r = await setup(CARD);
  ctl(r, 'full', '縮小').click();
  var c = parts(r).compact;
  assert.strictEqual(c.textContent, '', '沒有文字');
  assert.strictEqual(c.querySelectorAll('[data-__bmt_ccmd]').length, 3);
  assert.strictEqual(cbtn(r, 'md').title, '目前這題轉 MD（⌥⇧1）');
  assert.ok(cbtn(r, 'md').querySelector('svg'));
  cbtn(r, 'md').click();
  await flush();
  assert.deepStrictEqual(r.copied, ['### Q\n\nA']);
});

test('縮小模式執行中：外框、進度條、進度寫在 title、其他按鈕與關閉停用；結束後恢復', async function () {
  var r = await setup('<div class="transcripts"></div><div class="FMPlayer2-Transcripts active"></div>');
  ctl(r, 'full', '縮小').click();
  cbtn(r, 'transcript').click();
  var c = parts(r).compact;
  assert.ok(/^0 0 0 2px/.test(c.style.boxShadow));
  assert.strictEqual(c.children[1].style.display, 'block', '進度條顯示');
  assert.strictEqual(c.textContent, '', '不顯示進度文字');
  assert.strictEqual(cbtn(r, 'transcript').title, '逐字稿複製：載入中');
  assert.strictEqual(cbtn(r, 'md').disabled, true);
  assert.strictEqual(ctl(r, 'compact', '關閉').disabled, true);
  ctl(r, 'compact', '關閉').click();
  assert.ok(r.panel(), '執行中不能關閉');
  r.tick(4000);
  assert.ok(!/^0 0 0 2px/.test(c.style.boxShadow));
  assert.strictEqual(c.children[1].style.display, 'none');
  assert.strictEqual(cbtn(r, 'transcript').title, '逐字稿複製（⌥⇧3）');
  assert.strictEqual(cbtn(r, 'md').disabled, false);
  assert.strictEqual(ctl(r, 'compact', '關閉').disabled, false);
});

test('縮小模式：從拖曳點拖曳，從按鈕上按下不拖曳', async function () {
  var r = await setup();
  var p = r.panel();
  var win = r.win;
  ctl(r, 'full', '縮小').click();
  p.getBoundingClientRect = function () {
    return { left: 100, top: 100, width: 44, height: 200, right: 144, bottom: 300 };
  };
  function mouse(type, target, x, y) {
    target.dispatchEvent(new win.MouseEvent(type, { clientX: x, clientY: y, button: 0, buttons: 1, bubbles: true }));
  }
  var right = p.style.right;
  var top = p.style.top;
  mouse('mousedown', cbtn(r, 'md'), 110, 110);
  mouse('mousemove', r.d, 60, 80);
  mouse('mouseup', r.d, 0, 0);
  assert.strictEqual(p.style.right, right, '從按鈕開始不拖曳');
  assert.strictEqual(p.style.top, top);
  mouse('mousedown', parts(r).compact.children[0], 110, 110);
  mouse('mousemove', r.d, 60, 80);
  mouse('mouseup', r.d, 0, 0);
  assert.notStrictEqual(p.style.right, right);
  assert.strictEqual(p.style.top, '70px');
});

test('控制鈕 icon 為白色（不依賴 currentColor）', async function () {
  var r = await setup();
  [['full', '縮小'], ['full', '最小化'], ['full', '關閉'], ['compact', '展開'], ['compact', '最小化'],
    ['compact', '關閉'], ['mini', '還原']].forEach(function (x) {
    var svg = ctl(r, x[0], x[1]).querySelector('svg');
    assert.strictEqual(svg.style.stroke, 'rgb(255, 255, 255)', x.join('/'));
  });
});

test('按鈕與拖曳區內的子元素繼承 cursor', async function () {
  var r = await setup();
  var p = r.panel();
  assert.strictEqual(p.style.cursor, 'default');
  Array.prototype.forEach.call(p.querySelectorAll('button *, div *'), function (e) {
    if (e.tagName === 'BUTTON') return;
    var c = e.style.cursor;
    assert.ok(c === 'inherit' || c === 'move', e.tagName + ' cursor=' + c);
  });
  assert.strictEqual(parts(r).full.children[0].style.cursor, 'move', '標題列');
  assert.strictEqual(parts(r).compact.children[0].style.cursor, 'move', '縮小欄拖曳點');
});

test('初始位置扣掉面板高度', async function () {
  var r = await setup();
  var Proto = r.win.HTMLElement.prototype;
  Proto.getBoundingClientRect = function () {
    return { left: 0, top: 0, width: 264, height: 200, right: 264, bottom: 200 };
  };
  r.panel().remove();
  r.run();
  assert.strictEqual(r.panel().style.top, r.win.innerHeight - 216 + 'px');
});

test('執行中切換模式：兩種模式都呈現執行中；縮小模式的 icon 換成轉圈，結束後換回', async function () {
  var r = await setup('<div class="transcripts"></div><div class="FMPlayer2-Transcripts active"></div>');
  var orig = cbtn(r, 'transcript').querySelector('svg');
  r.btn('transcript').click();
  ctl(r, 'full', '縮小').click();
  assert.strictEqual(mode(r), 'compact');
  var spin = cbtn(r, 'transcript').querySelector('svg');
  assert.notStrictEqual(spin, orig);
  assert.strictEqual(spin.querySelectorAll('circle').length, 1, '轉圈 icon');
  assert.strictEqual(cbtn(r, 'md').style.opacity, '0.4');
  assert.strictEqual(cbtn(r, 'transcript').style.background, 'rgba(255, 255, 255, 0.07)');
  ctl(r, 'compact', '展開').click();
  assert.strictEqual(r.btn('transcript').textContent.indexOf('載入中') >= 0, true);
  r.tick(4000);
  assert.strictEqual(cbtn(r, 'transcript').querySelectorAll('rect').length, 1, '換回原 icon');
  assert.strictEqual(cbtn(r, 'md').style.opacity, '1');
});

test('用鍵盤切換模式：焦點移到新模式的控制鈕', async function () {
  var r = await setup();
  ctl(r, 'full', '縮小').focus();
  ctl(r, 'full', '縮小').click();
  assert.strictEqual(r.d.activeElement, ctl(r, 'compact', '展開'));
  ctl(r, 'compact', '最小化').focus();
  ctl(r, 'compact', '最小化').click();
  assert.strictEqual(r.d.activeElement, ctl(r, 'mini', '還原'));
  r.d.body.focus();
  r.d.activeElement.blur();
  ctl(r, 'mini', '還原').click(); // 滑鼠操作（焦點不在面板內）：不搶焦點
  assert.notStrictEqual(r.d.activeElement && r.d.activeElement.closest && r.d.activeElement.closest('#' + ID), r.panel());
});
