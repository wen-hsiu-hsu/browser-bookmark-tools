'use strict';

var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var JSDOM = require('jsdom').JSDOM;
var build = require('../scripts/build.js');

var ROOT = path.join(__dirname, '..');
function read(p) {
  return fs.readFileSync(path.join(ROOT, p), 'utf8');
}

/** 建立 jsdom 視窗，並以可手動推進的假計時器取代 setTimeout。 */
function makeWindow() {
  var win = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' }).window;
  var now = 0;
  var seq = 0;
  var timers = {};
  win.setTimeout = function (fn, ms) {
    timers[++seq] = { fn: fn, at: now + ms };
    return seq;
  };
  win.clearTimeout = function (id) {
    delete timers[id];
  };
  win.tick = function (ms) {
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
  win.eval(build.expandIncludes('/* @include toast */\n/* @include clipboard */\n/* @include copy-prompt */'));
  return win;
}

function el(win) {
  return win.document.getElementById('__bmt_toast__');
}

test('toast：預設 success，2500ms 後淡出、300ms 後移除', function () {
  var win = makeWindow();
  win.toast('已複製');
  assert.strictEqual(el(win).textContent, '已複製');
  assert.strictEqual(el(win).getAttribute('data-__bmt_type'), 'success');
  assert.strictEqual(el(win).style.opacity, '1');
  win.tick(2499);
  assert.strictEqual(el(win).style.opacity, '1');
  win.tick(1);
  assert.strictEqual(el(win).style.opacity, '0');
  win.tick(299);
  assert.ok(el(win));
  win.tick(1);
  assert.strictEqual(el(win), null);
});

test('toast：新建時先以 opacity 0 插入再設為 1（淡入）', function () {
  var win = makeWindow();
  var body = win.document.body;
  var append = body.appendChild;
  var atInsert;
  body.appendChild = function (n) {
    var r = append.call(this, n);
    atInsert = n.style.opacity;
    return r;
  };
  win.toast('x');
  assert.strictEqual(atInsert, '0');
  assert.strictEqual(el(win).style.opacity, '1');
});

test('toast：類型記在 data-__bmt_type，狀態色條跟著變；底色為主題 bg', function () {
  var win = makeWindow();
  win.toast('x', 'error');
  assert.strictEqual(el(win).getAttribute('data-__bmt_type'), 'error');
  assert.strictEqual(el(win).style.borderLeftColor, 'rgb(248, 113, 113)');
  assert.strictEqual(el(win).style.background, 'rgb(28, 31, 36)', 'jsdom 沒有 matchMedia → 暗色');
  win.toast('x', 'info');
  assert.strictEqual(el(win).getAttribute('data-__bmt_type'), 'info');
  assert.strictEqual(el(win).style.borderLeftColor, 'rgb(124, 183, 255)');
  win.toast('x', 'whatever');
  assert.strictEqual(el(win).getAttribute('data-__bmt_type'), 'success');
});

test('toast：info 持續顯示時 icon 換成轉圈；原地更新文字不重建 icon', function () {
  var win = makeWindow();
  win.toast('3', 'info', 0);
  var spin = el(win).querySelector('svg');
  assert.strictEqual(spin.querySelectorAll('circle').length, 1);
  assert.strictEqual(spin.querySelectorAll('path').length, 1);
  win.toast('2', 'info', 0);
  assert.strictEqual(el(win).querySelector('svg'), spin, '讀秒時不換 icon');
  win.toast('完成');
  assert.notStrictEqual(el(win).querySelector('svg'), spin);
  assert.strictEqual(el(win).textContent, '完成');
});

test('toast：樣式加 !important，頁面樣式表蓋不掉', function () {
  var win = makeWindow();
  win.toast('x');
  assert.strictEqual(el(win).style.getPropertyPriority('background'), 'important');
  assert.strictEqual(el(win).style.getPropertyPriority('opacity'), 'important');
  assert.strictEqual(el(win).style.getPropertyPriority('border-left-color'), 'important');
});

test('toast：舊版書籤改寫過同 id 的 toast（文字被覆寫）→ 移除後以新樣式重建', function () {
  var win = makeWindow();
  win.toast('a');
  var first = el(win);
  first.textContent = '舊版寫入'; // 舊版 toast() 直接設定 textContent
  win.toast('b');
  assert.notStrictEqual(el(win), first);
  assert.strictEqual(win.document.querySelectorAll('#__bmt_toast__').length, 1);
  assert.strictEqual(el(win).textContent, 'b');
  assert.ok(el(win).querySelector('svg'));
  // 舊版建立的 toast（沒有 icon 結構）
  el(win).remove();
  var legacy = win.document.createElement('div');
  legacy.id = '__bmt_toast__';
  legacy.textContent = 'old';
  win.document.body.appendChild(legacy);
  win.toast('c');
  assert.strictEqual(win.document.querySelectorAll('#__bmt_toast__').length, 1);
  assert.strictEqual(el(win).textContent, 'c');
});

test('toast：重複呼叫只保留一個，舊計時器不會刪掉新 toast', function () {
  var win = makeWindow();
  win.toast('a');
  win.tick(2600); // 第一個正在淡出
  win.toast('b');
  assert.strictEqual(win.document.querySelectorAll('#__bmt_toast__').length, 1);
  assert.strictEqual(el(win).style.opacity, '1');
  win.tick(500); // 超過第一個的移除時間點
  assert.strictEqual(el(win).textContent, 'b');
  win.tick(2300);
  assert.strictEqual(el(win), null);
});

test('toast：duration 0 不自動消失，可更新文字後再以 success 結束', function () {
  var win = makeWindow();
  win.toast('3 秒後執行', 'info', 0);
  win.tick(10000);
  assert.strictEqual(el(win).textContent, '3 秒後執行');
  win.toast('完成');
  win.tick(2800);
  assert.strictEqual(el(win), null);
});

test('toast：清除舊版 __lm_md_toast__', function () {
  var win = makeWindow();
  var old = win.document.createElement('div');
  old.id = '__lm_md_toast__';
  win.document.body.appendChild(old);
  win.toast('x');
  assert.strictEqual(win.document.getElementById('__lm_md_toast__'), null);
});

test('toast：以 textContent 寫入，不解析 HTML', function () {
  var win = makeWindow();
  win.toast('<b>x</b>');
  assert.strictEqual(el(win).querySelector('b'), null);
  assert.strictEqual(el(win).textContent, '<b>x</b>');
});

test('theme：沒有 matchMedia → 暗色；prefers-color-scheme: light → 亮色；結果快取', function () {
  var win = makeWindow();
  assert.strictEqual(win.bmtTheme().dark, true);
  assert.strictEqual(win.bmtTheme().bg, '#1c1f24');

  var light = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' }).window;
  var calls = 0;
  light.matchMedia = function (q) {
    calls++;
    return { matches: q === '(prefers-color-scheme: light)' };
  };
  light.eval(build.expandIncludes('/* @include theme */'));
  var t = light.bmtTheme();
  assert.strictEqual(t.dark, false);
  assert.strictEqual(t.bg, '#ffffff');
  assert.strictEqual(t.accent, '#2563eb');
  assert.strictEqual(light.bmtTheme(), t, '同一次執行只判斷一次');
  assert.strictEqual(calls, 1);

  // 不支援 prefers-color-scheme（兩個查詢都不成立）→ 暗色
  var none = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' }).window;
  none.matchMedia = function () { return { matches: false }; };
  none.eval(build.expandIncludes('/* @include theme */'));
  assert.strictEqual(none.bmtTheme().dark, true);

  // matchMedia 拋錯 → 暗色
  var bad = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' }).window;
  bad.matchMedia = function () { throw new Error('x'); };
  bad.eval(build.expandIncludes('/* @include theme */'));
  assert.strictEqual(bad.bmtTheme().dark, true);
});

test('theme：bmtCss／bmtSet 每條樣式都加 !important', function () {
  var win = makeWindow();
  var e = win.document.createElement('div');
  win.bmtCss(e, 'color:red;padding:4px');
  assert.strictEqual(e.style.getPropertyPriority('color'), 'important');
  assert.strictEqual(e.style.getPropertyPriority('padding-top'), 'important');
  assert.strictEqual(e.style.boxSizing, 'border-box');
  win.bmtSet(e, 'color', 'blue');
  assert.strictEqual(e.style.color, 'blue');
  assert.strictEqual(e.style.getPropertyPriority('color'), 'important');
});

test('copy-prompt：按鈕用實心 fill、有複製 icon，文字以 textContent 寫入', async function () {
  var win = makeWindow();
  win.document.execCommand = function () { return false; };
  win.copyOrPrompt('data', '已複製', '<i>點此複製</i>');
  await new Promise(function (r) { setImmediate(r); });
  var b = win.document.getElementById('__bmt_copy_btn__');
  assert.ok(b);
  assert.strictEqual(b.style.background, 'rgb(37, 99, 235)');
  assert.strictEqual(b.style.getPropertyPriority('background'), 'important');
  assert.ok(b.querySelector('svg'));
  assert.strictEqual(b.querySelector('i'), null);
  assert.strictEqual(b.textContent, '<i>點此複製</i>');
});

test('copyText：clipboard API 成功', async function () {
  var win = makeWindow();
  var got;
  var calls = 0;
  Object.defineProperty(win.navigator, 'clipboard', {
    value: { writeText: function (t) { got = t; return Promise.resolve(); } }
  });
  win.document.execCommand = function () { throw new Error('不應呼叫 fallback'); };
  var ok = await new Promise(function (r) {
    win.copyText('hi', function (v) { calls++; r(v); });
  });
  await new Promise(function (r) { setImmediate(r); });
  assert.strictEqual(ok, true);
  assert.strictEqual(got, 'hi');
  assert.strictEqual(calls, 1);
});

test('copyText：clipboard API 被拒時 fallback 到 execCommand', async function () {
  var win = makeWindow();
  var copied;
  Object.defineProperty(win.navigator, 'clipboard', {
    value: { writeText: function () { return Promise.reject(new Error('blocked')); } }
  });
  win.document.execCommand = function (cmd) {
    copied = win.document.querySelector('textarea').value;
    return cmd === 'copy';
  };
  var ok = await new Promise(function (r) { win.copyText('hi', r); });
  assert.strictEqual(ok, true);
  assert.strictEqual(copied, 'hi');
  assert.strictEqual(win.document.querySelector('textarea'), null);
});

test('copyText：writeText 同步拋錯時 fallback，並還原焦點', async function () {
  var win = makeWindow();
  var input = win.document.createElement('input');
  win.document.body.appendChild(input);
  input.focus();
  Object.defineProperty(win.navigator, 'clipboard', {
    value: { writeText: function () { throw new Error('sync'); } }
  });
  win.document.execCommand = function () { return true; };
  var ok = await new Promise(function (r) { win.copyText('hi', r); });
  assert.strictEqual(ok, true);
  assert.strictEqual(win.document.activeElement, input);
});

test('copyText：沒有 clipboard API 且 execCommand 失敗 → false', async function () {
  var win = makeWindow();
  win.document.execCommand = function () { throw new Error('nope'); };
  var ok = await new Promise(function (r) { win.copyText('hi', r); });
  assert.strictEqual(ok, false);
});

test('build：expandIncludes 展開且不重複', function () {
  var out = build.expandIncludes('/* @include toast */\n  /* @include toast */');
  assert.strictEqual(out.split('function toast(').length, 2);
  // 不在獨立一行的 include（註解、字串內）不展開
  var inline = '// /* @include toast */\nvar s = "/* @include toast */";';
  assert.strictEqual(build.expandIncludes(inline), inline);
  assert.throws(function () { build.expandIncludes('/* @include nope */'); }, /nope/);
});

test('build：非 ES5 語法會讓建置失敗', async function () {
  await assert.rejects(build.toBookmarklet('(function(){ var f = () => 1; })();'), /ES5/);
  await assert.rejects(build.toBookmarklet('(function(){ let a = 1; })();'), /ES5/);
});

test('build：結果值永遠是 undefined，不會取代頁面', async function () {
  var srcs = [
    '(function(){ document.title = "x"; })();',
    '(function(){ var e = document.body; e.textContent = "done"; })();',
    read('bookmarks/_template/source.js')
  ];
  for (var i = 0; i < srcs.length; i++) {
    var url = await build.toBookmarklet(srcs[i]);
    var win = makeWindow();
    win.document.execCommand = function () { return true; };
    assert.strictEqual(win.eval(decodeURIComponent(url.slice('javascript:'.length))), undefined);
  }
});

test('build：輸出含控制字元時建置失敗', async function () {
  await assert.rejects(build.toBookmarklet('(function(){ document.title = "a\\u0001b"; })();'), /控制字元/);
});

test('build：readTag', function () {
  assert.strictEqual(build.readTag(read('bookmarks/_template/source.js'), 'version'), '1.0.0');
});

test('build：產生的書籤是單行、% 已跳脫，且可在頁面上執行', async function () {
  var src = '(function(){ /* @include toast */ toast("100%", "info"); })();';
  var url = await build.toBookmarklet(src);
  assert.ok(url.indexOf('javascript:') === 0);
  assert.ok(url.indexOf('\n') < 0);
  assert.ok(url.indexOf('100%25') > 0);
  var win = makeWindow();
  win.eval(decodeURIComponent(url.slice('javascript:'.length)));
  assert.strictEqual(el(win).textContent, '100%');
});

test('build：範本可建置並執行', async function () {
  var url = await build.toBookmarklet(read('bookmarks/_template/source.js'));
  var win = makeWindow();
  win.document.title = 'T';
  win.document.execCommand = function () { return true; };
  win.eval(decodeURIComponent(url.slice('javascript:'.length)));
  await new Promise(function (r) { setImmediate(r); });
  assert.strictEqual(el(win).textContent, '已複製');
});

test('build：findColorLiterals 找出寫死色值，略過註解與 @design-literal', function () {
  var src = [
    "var a = '#fff';",
    "var b = 'color:rgba(0,0,0,.5)';",
    "var c = 'rgb(1,2,3)';",
    "// 註解裡的 #123456 不算",
    " * 文件註解 #abc 也不算",
    "var d = ['#000000', '黑']; /* @design-literal */",
    "var e = '&#123;';",
    "var f = d.querySelector('#' + ID);",
    "var g = 'abc#def';"
  ].join('\n');
  var got = build.findColorLiterals('x.js', src).map(function (w) { return w.line; });
  assert.deepStrictEqual(got, [1, 2, 3]);
});

test('build：colorWarnings 檢查書籤與它 include 的 shared 元件，theme 除外；現有書籤都沒有警告', function () {
  var w = build.colorWarnings('demo', "(function () {\n  /* @include toast */\n  var x = '#123456';\n})();");
  assert.deepStrictEqual(w.map(function (x) { return x.file + ':' + x.line; }), ['bookmarks/demo/source.js:3']);
  fs.readdirSync(path.join(ROOT, 'bookmarks')).forEach(function (n) {
    if (n[0] === '_') return;
    assert.deepStrictEqual(build.colorWarnings(n, read('bookmarks/' + n + '/source.js')), [], n);
  });
});

test('bmtAnimate：被動畫的屬性改成一般優先權（important 會壓過動畫）；不支援時回傳 null', function () {
  var win = makeWindow();
  var calls = [];
  win.Element.prototype.animate = function (frames, opts) {
    calls.push({ node: this, opts: opts });
    return { cancel: function () {} };
  };
  win.toast('讀秒', 'info', 0);
  var svg = el(win).querySelector('svg');
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].node, svg);
  assert.strictEqual(calls[0].opts.iterations, Infinity);
  assert.strictEqual(svg.style.getPropertyPriority('transform'), '');
  assert.strictEqual(svg.style.getPropertyPriority('width'), 'important', '其他屬性維持 important');

  var bare = makeWindow();
  var e = bare.document.createElement('div');
  e.animate = undefined;
  assert.strictEqual(bare.bmtAnimate(e, [{ transform: 'none' }, { transform: 'none' }], 100), null);
});
