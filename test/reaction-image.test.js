'use strict';

var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var JSDOM = require('jsdom').JSDOM;
var build = require('../scripts/build.js');

var SRC = fs.readFileSync(path.join(__dirname, '../bookmarks/reaction-image/source.js'), 'utf8');
var CODE;

/**
 * 建立頁面並執行書籤。prompts：依序回應 prompt() 的值。
 * jsdom 不會真的載入圖片，用 loadImg / failImg 手動觸發 load / error。
 */
async function setup(opts) {
  opts = opts || {};
  if (!CODE) CODE = decodeURIComponent((await build.toBookmarklet(SRC)).slice('javascript:'.length));
  var win = new JSDOM('<!doctype html><body><input id="field"></body>', {
    url: 'https://example.com/',
    runScripts: 'outside-only'
  }).window;
  var p = {
    win: win,
    d: win.document,
    prompts: (opts.prompts || []).slice(),
    asked: [],
    listeners: 0
  };
  // jsdom 沒有版面配置：依 left/top 與圖片大小模擬容器的位置（預設在右下角，距邊 20px）
  var rectOf = win.HTMLElement.prototype.getBoundingClientRect;
  win.HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.id !== '__bmt_reaction__') return rectOf.call(this);
    var img = this.querySelector('img');
    var sz = (img && this.parentNode && parseFloat(img.style.width || img.style.maxWidth)) || 0;
    var l = this.style.left && this.style.left !== 'auto' ? parseFloat(this.style.left) : win.innerWidth - 20 - sz;
    var t = this.style.top && this.style.top !== 'auto' ? parseFloat(this.style.top) : win.innerHeight - 20 - sz;
    return { left: l, top: t, width: sz, height: sz, right: l + sz, bottom: t + sz };
  };
  if (opts.storage) win.localStorage.setItem('__bmt_reaction', JSON.stringify(opts.storage));
  if (opts.noStorage) {
    Object.defineProperty(win, 'localStorage', { get: function () { throw new Error('SecurityError'); } });
  }
  win.prompt = function (msg) {
    p.asked.push(msg);
    return p.prompts.length ? p.prompts.shift() : null;
  };
  var add = win.addEventListener;
  win.addEventListener = function (type) {
    if (type === 'keydown') p.listeners++;
    return add.apply(this, arguments);
  };
  p.click = function () { win.eval(CODE); };
  p.box = function () { return p.d.getElementById('__bmt_reaction__'); };
  p.img = function () { var b = p.box(); return b && b.querySelector('img'); };
  p.loadImg = function () { p.img().dispatchEvent(new win.Event('load')); };
  p.failImg = function () { p.img().dispatchEvent(new win.Event('error')); };
  p.key = function (n, mods) {
    mods = mods || { altKey: true, shiftKey: true };
    var e = new win.KeyboardEvent('keydown', {
      code: 'Digit' + n, altKey: !!mods.altKey, shiftKey: !!mods.shiftKey, ctrlKey: !!mods.ctrlKey,
      metaKey: !!mods.metaKey, repeat: !!mods.repeat, bubbles: true, cancelable: true
    });
    (mods.target || p.d.body).dispatchEvent(e);
    return e;
  };
  p.stored = function () { return JSON.parse(win.localStorage.getItem('__bmt_reaction')); };
  p.toast = function () { var t = p.d.getElementById('__bmt_toast__'); return t && t.textContent; };
  p.click();
  return p;
}

test('首次使用：詢問第 1 張網址，載入成功後顯示並記住', async function () {
  var p = await setup({ prompts: ['https://img/a.gif'] });
  assert.strictEqual(p.asked.length, 1);
  assert.ok(p.asked[0].indexOf('第 1 張') >= 0);
  assert.strictEqual(p.toast(), '快捷鍵已啟用：Alt+Shift+1~9');
  assert.strictEqual(p.img().getAttribute('src'), 'https://img/a.gif');
  assert.strictEqual(p.box().style.opacity, '0'); // 載入前不顯示
  p.loadImg();
  assert.strictEqual(p.box().style.opacity, '1');
  assert.deepStrictEqual(p.stored(), { urls: { 1: 'https://img/a.gif' }, last: 1 });
});

test('按取消 → 不顯示也不記住', async function () {
  var p = await setup({ prompts: [null] });
  assert.strictEqual(p.box(), null);
  assert.strictEqual(p.win.localStorage.getItem('__bmt_reaction'), null);
});

test('已記住：直接顯示最後使用的那一張，不詢問', async function () {
  var p = await setup({ storage: { urls: { 1: 'https://img/a.gif', 3: 'https://img/c.gif' }, last: 3 } });
  assert.strictEqual(p.asked.length, 0);
  assert.strictEqual(p.img().getAttribute('src'), 'https://img/c.gif');
  assert.strictEqual(p.box().getAttribute('data-slot'), '3');
});

test('Alt+Shift+N 切換到已設定的圖片', async function () {
  var p = await setup({ storage: { urls: { 1: 'https://img/a.gif', 2: 'https://img/b.gif' }, last: 1 } });
  var e = p.key(2);
  assert.ok(e.defaultPrevented);
  assert.strictEqual(p.img().getAttribute('src'), 'https://img/b.gif');
  assert.strictEqual(p.d.querySelectorAll('img').length, 1);
  p.loadImg();
  assert.strictEqual(p.stored().last, 2);
});

test('Alt+Shift+N 的欄位還沒設定 → 詢問網址並存到該欄位', async function () {
  var p = await setup({ storage: { urls: { 1: 'https://img/a.gif' }, last: 1 }, prompts: ['https://img/e.gif'] });
  p.key(5);
  assert.ok(p.asked[0].indexOf('第 5 張') >= 0);
  p.loadImg();
  assert.deepStrictEqual(p.stored().urls, { 1: 'https://img/a.gif', 5: 'https://img/e.gif' });
});

test('同一張的快捷鍵再按一次 → 關閉；再按 → 重新顯示', async function () {
  var p = await setup({ storage: { urls: { 1: 'https://img/a.gif' }, last: 1 } });
  p.key(1);
  assert.strictEqual(p.box(), null);
  p.key(1);
  assert.ok(p.box());
});

test('沒按齊修飾鍵（只有 Alt、或多按 Ctrl）→ 不觸發', async function () {
  var p = await setup({ storage: { urls: { 1: 'https://img/a.gif', 2: 'https://img/b.gif' }, last: 1 } });
  assert.strictEqual(p.key(2, { altKey: true }).defaultPrevented, false);
  assert.strictEqual(p.key(2, { altKey: true, shiftKey: true, ctrlKey: true }).defaultPrevented, false);
  assert.strictEqual(p.key(2, { altKey: true, shiftKey: true, metaKey: true }).defaultPrevented, false);
  assert.strictEqual(p.box().getAttribute('data-slot'), '1');
});

test('游標在輸入框中也能觸發', async function () {
  var p = await setup({ storage: { urls: { 1: 'https://img/a.gif', 2: 'https://img/b.gif' }, last: 1 } });
  p.key(2, { altKey: true, shiftKey: true, target: p.d.getElementById('field') });
  assert.strictEqual(p.box().getAttribute('data-slot'), '2');
});

test('點圖片關閉；關閉後快捷鍵仍有效', async function () {
  var p = await setup({ storage: { urls: { 1: 'https://img/a.gif' }, last: 1 } });
  p.box().click();
  assert.strictEqual(p.box(), null);
  p.key(1);
  assert.ok(p.box());
});

test('重複點書籤：不會重複監聽，也不會疊出第二張圖', async function () {
  var p = await setup({ storage: { urls: { 1: 'https://img/a.gif' }, last: 1 } });
  p.click();
  p.click();
  assert.strictEqual(p.listeners, 1);
  assert.strictEqual(p.d.querySelectorAll('img').length, 1);
});

test('滑鼠移入出現「更換」；點更換換成新網址並記住，不會關閉圖片', async function () {
  var p = await setup({ storage: { urls: { 2: 'https://img/b.gif' }, last: 2 }, prompts: ['https://img/new.gif'] });
  var btn = p.box().querySelector('button');
  assert.strictEqual(btn.style.display, 'none');
  p.box().dispatchEvent(new p.win.Event('mouseenter'));
  assert.strictEqual(btn.style.display, 'block');
  btn.click();
  assert.ok(p.box());
  assert.strictEqual(p.img().getAttribute('src'), 'https://img/new.gif');
  p.loadImg();
  assert.strictEqual(p.stored().urls[2], 'https://img/new.gif');
});

test('載入失敗 → 提示並重新詢問；新網址成功後記住', async function () {
  var p = await setup({ storage: { urls: { 1: 'https://img/dead.gif' }, last: 1 }, prompts: ['https://img/ok.gif'] });
  p.failImg();
  assert.strictEqual(p.toast(), '圖片載入失敗');
  assert.strictEqual(p.asked.length, 1);
  p.loadImg();
  assert.strictEqual(p.stored().urls[1], 'https://img/ok.gif');
});

test('連續兩次載入失敗 → 提示可能被網站禁止，不再詢問，也不記住', async function () {
  var p = await setup({ prompts: ['https://img/x.gif', 'https://img/y.gif', 'https://img/z.gif'] });
  p.failImg();
  p.failImg();
  assert.strictEqual(p.toast(), '此網站可能禁止載入外部圖片');
  assert.strictEqual(p.asked.length, 2);
  assert.strictEqual(p.box(), null);
  assert.strictEqual(p.win.localStorage.getItem('__bmt_reaction'), null);
});

test('網站禁止 localStorage → 仍可顯示（只是不記住）', async function () {
  var p = await setup({ noStorage: true, prompts: ['https://img/a.gif'] });
  p.loadImg();
  assert.strictEqual(p.box().style.opacity, '1');
});

test('切換到別張後，舊圖才載入失敗 → 不詢問、不影響目前這張', async function () {
  var p = await setup({ storage: { urls: { 1: 'https://img/slow.gif', 2: 'https://img/b.gif' }, last: 1 } });
  var oldImg = p.img();
  p.key(2);
  oldImg.dispatchEvent(new p.win.Event('error'));
  assert.strictEqual(p.asked.length, 0);
  assert.strictEqual(p.box().getAttribute('data-slot'), '2');
});

test('切換到別張後，舊圖才載入成功 → 不改動 last', async function () {
  var p = await setup({ storage: { urls: { 1: 'https://img/a.gif', 2: 'https://img/b.gif' }, last: 1 } });
  var oldImg = p.img();
  p.key(2);
  p.loadImg();
  oldImg.dispatchEvent(new p.win.Event('load'));
  assert.strictEqual(p.stored().last, 2);
});

test('關閉（淡出中）後舊圖才載入成功 → 不會重新出現', async function () {
  var p = await setup({ storage: { urls: { 1: 'https://img/a.gif' }, last: 1 } });
  var box = p.box();
  var img = p.img();
  box.click();
  img.dispatchEvent(new p.win.Event('load'));
  assert.strictEqual(box.style.opacity, '0');
});

test('長按自動連發（repeat）→ 忽略，不會來回開關', async function () {
  var p = await setup({ storage: { urls: { 1: 'https://img/a.gif' }, last: 1 } });
  p.key(1);
  var e = p.key(1, { altKey: true, shiftKey: true, repeat: true });
  assert.ok(e.defaultPrevented);
  assert.strictEqual(p.box(), null);
});

test('標記被頁面移除、監聽器裝了兩次 → 一次按鍵仍只處理一次', async function () {
  var p = await setup({ storage: { urls: { 1: 'https://img/a.gif', 2: 'https://img/b.gif' }, last: 1 } });
  p.d.documentElement.removeAttribute('data-__bmt_reaction');
  p.click();
  assert.strictEqual(p.listeners, 2);
  p.key(2);
  assert.strictEqual(p.box().getAttribute('data-slot'), '2');
});

test('localStorage 內容損壞 → 當作沒有設定，並能正常存回', async function () {
  var bad = ['"str"', '[1]', '{"urls":"abc"}', '{"urls":5}', '{"last":"x"}', '{"urls":{"1":42},"last":1}', 'not json'];
  for (var i = 0; i < bad.length; i++) {
    if (!CODE) CODE = decodeURIComponent((await build.toBookmarklet(SRC)).slice('javascript:'.length));
    var win = new JSDOM('<!doctype html><body></body>', { url: 'https://example.com/', runScripts: 'outside-only' }).window;
    win.localStorage.setItem('__bmt_reaction', bad[i]);
    var asked = [];
    win.prompt = function (m) { asked.push(m); return 'https://img/a.gif'; };
    win.eval(CODE);
    assert.ok(asked.length === 1 && asked[0].indexOf('第 1 張') >= 0, bad[i]);
    win.document.querySelector('#__bmt_reaction__ img').dispatchEvent(new win.Event('load'));
    var s = JSON.parse(win.localStorage.getItem('__bmt_reaction'));
    assert.strictEqual(s.urls[1], 'https://img/a.gif', bad[i]);
    assert.strictEqual(s.last, 1, bad[i]);
  }
});

// ---- v1.1.0：拖曳、滾輪縮放、欄位提示列 ----

function mouse(p, type, target, x, y, buttons) {
  target.dispatchEvent(
    new p.win.MouseEvent(type, {
      clientX: x, clientY: y, button: 0, buttons: buttons == null ? 1 : buttons, bubbles: true, cancelable: true
    })
  );
}

function drag(p, x0, y0, x1, y1) {
  mouse(p, 'mousedown', p.img(), x0, y0);
  mouse(p, 'mousemove', p.d, x1, y1);
  mouse(p, 'mouseup', p.d, x1, y1);
  p.img().click(); // 瀏覽器在 mouseup 之後會觸發 click
}

function wheel(p, deltaY, x, y, deltaMode) {
  var e = new p.win.WheelEvent('wheel', {
    deltaY: deltaY, deltaMode: deltaMode || 0, clientX: x || 0, clientY: y || 0, bubbles: true, cancelable: true
  });
  p.box().dispatchEvent(e);
  return e;
}

var TWO = { urls: { 1: 'https://img/a.gif', 2: 'https://img/b.gif' }, last: 1 };

test('圖片關閉瀏覽器原生拖曳', async function () {
  var p = await setup({ storage: TWO });
  assert.strictEqual(p.img().draggable, false);
});

test('拖曳：放開後停在新位置，而且不會關閉', async function () {
  var p = await setup({ storage: TWO });
  drag(p, 100, 100, 0, 0); // 從右下角（764, 508）往左上移 100px
  assert.ok(p.box(), '拖曳後不應關閉');
  assert.strictEqual(p.box().style.left, '664px');
  assert.strictEqual(p.box().style.top, '408px');
  assert.strictEqual(p.box().style.right, 'auto');
});

test('拖曳被擋在畫面邊緣、放開在圖片外（沒有 click）→ 下一次點擊仍能關閉', async function () {
  var p = await setup({ storage: TWO });
  mouse(p, 'mousedown', p.img(), 100, 100);
  mouse(p, 'mousemove', p.d, 5000, 100);
  mouse(p, 'mouseup', p.d, 5000, 100);
  await new Promise(function (r) { setTimeout(r, 5); });
  p.img().click();
  assert.strictEqual(p.box(), null);
});

test('拖曳中滑鼠已放開（例如在 iframe 上放開）→ 之後移動不再帶著圖片', async function () {
  var p = await setup({ storage: TWO });
  mouse(p, 'mousedown', p.img(), 100, 100);
  mouse(p, 'mousemove', p.d, 0, 0);
  mouse(p, 'mousemove', p.d, -50, -50, 0); // buttons = 0：已放開
  mouse(p, 'mousemove', p.d, -300, -300);
  assert.strictEqual(p.box().style.left, '664px');
});

test('只移動一點點（< 4px）仍算點擊 → 關閉', async function () {
  var p = await setup({ storage: TWO });
  drag(p, 100, 100, 102, 101);
  assert.strictEqual(p.box(), null);
});

test('拖曳範圍限制在畫面內', async function () {
  var p = await setup({ storage: TWO });
  drag(p, 100, 100, 99999, -99999);
  assert.strictEqual(p.box().style.left, p.win.innerWidth - 40 + 'px'); // 右邊只露出 40px
  assert.strictEqual(p.box().style.top, 40 - 240 + 'px'); // 上面只露出 40px
});

test('滾輪：往上放大、往下縮小，頁面不捲動', async function () {
  var p = await setup({ storage: TWO });
  assert.strictEqual(p.img().style.maxWidth, '240px');
  assert.ok(wheel(p, -100).defaultPrevented);
  assert.strictEqual(p.img().style.maxWidth, '264px');
  wheel(p, 100);
  wheel(p, 100);
  assert.strictEqual(p.img().style.maxHeight, '218px');
});

test('縮放範圍：最小 60px、最大畫面高度', async function () {
  var p = await setup({ storage: TWO });
  for (var i = 0; i < 50; i++) wheel(p, 100);
  assert.strictEqual(p.img().style.maxWidth, '60px');
  for (i = 0; i < 80; i++) wheel(p, -100);
  assert.strictEqual(p.img().style.maxWidth, p.win.innerHeight + 'px');
});

test('切換到別張時沿用目前的位置與大小', async function () {
  var p = await setup({ storage: TWO });
  drag(p, 100, 100, 0, 0);
  wheel(p, -100, 700, 500);
  var left = p.box().style.left;
  var top = p.box().style.top;
  p.key(2);
  assert.strictEqual(p.box().getAttribute('data-slot'), '2');
  assert.strictEqual(p.box().style.left, left);
  assert.strictEqual(p.box().style.top, top);
  assert.strictEqual(p.img().style.maxWidth, '264px');
});

test('滾輪以游標位置為中心縮放', async function () {
  var p = await setup({ storage: TWO });
  wheel(p, -100, 884, 628); // 圖片中心
  assert.strictEqual(p.box().style.left, '752px');
  assert.strictEqual(p.box().style.top, '496px');
});

test('觸控板細微滑動：縮放量與滑動量成正比，不會一滑就到上下限', async function () {
  var p = await setup({ storage: TWO });
  for (var i = 0; i < 20; i++) wheel(p, 2, 884, 628);
  var w = parseFloat(p.img().style.maxWidth);
  assert.ok(w > 225 && w < 235, String(w));
});

test('以「行」為單位的滾輪（deltaMode=1）一格約 10%', async function () {
  var p = await setup({ storage: TWO });
  wheel(p, -3, 884, 628, 1);
  var w = parseFloat(p.img().style.maxWidth);
  assert.ok(w > 260 && w < 275, String(w));
});

test('拖到邊緣後縮小，圖片仍至少留 40px 在畫面內', async function () {
  var p = await setup({ storage: TWO });
  drag(p, 100, 100, -99999, 100);
  for (var i = 0; i < 5; i++) wheel(p, 100, 0, 300);
  var r = p.box().getBoundingClientRect();
  assert.ok(r.right >= 40, JSON.stringify(r));
});

test('圖片載入後依原始比例設定寬高（小圖也能放大）', async function () {
  var p = await setup({ storage: TWO });
  Object.defineProperty(p.img(), 'naturalWidth', { value: 100 });
  Object.defineProperty(p.img(), 'naturalHeight', { value: 50 });
  p.loadImg();
  assert.strictEqual(p.img().style.width, '240px');
  assert.strictEqual(p.img().style.height, '120px');
  wheel(p, -100, 884, 628);
  assert.strictEqual(p.img().style.width, '264px');
});

test('從提示列換圖：游標還在原處，新圖直接顯示提示列', async function () {
  var p = await setup({ storage: TWO });
  p.box().dispatchEvent(new p.win.Event('mouseenter'));
  bar(p)[1].click();
  assert.strictEqual(bar(p)[0].parentNode.style.display, 'block');
});

test('空欄位設定網址並載入成功後，提示列上該數字變亮', async function () {
  var p = await setup({ storage: TWO, prompts: ['https://img/g.gif'] });
  bar(p)[6].click();
  p.loadImg();
  assert.strictEqual(bar(p)[6].style.color, 'rgb(255, 255, 255)');
});

test('位置與大小不寫入 localStorage（重新整理後回到預設）', async function () {
  var p = await setup({ storage: TWO });
  drag(p, 100, 100, 300, 400);
  wheel(p, -100);
  p.loadImg();
  assert.deepStrictEqual(Object.keys(p.stored()).sort(), ['last', 'urls']);
});

function bar(p) {
  return p.box().querySelectorAll('button[data-slot]');
}

test('欄位提示列：滑鼠移入才出現，有圖的數字較亮，目前這張加框', async function () {
  var p = await setup({ storage: { urls: { 1: 'https://img/a.gif', 3: 'https://img/c.gif' }, last: 3 } });
  var btns = bar(p);
  assert.strictEqual(btns.length, 9);
  assert.strictEqual(btns[0].parentNode.style.display, 'none');
  p.box().dispatchEvent(new p.win.Event('mouseenter'));
  assert.strictEqual(btns[0].parentNode.style.display, 'block');
  assert.strictEqual(btns[0].style.color, 'rgb(255, 255, 255)'); // 1 有圖
  assert.notStrictEqual(btns[1].style.color, 'rgb(255, 255, 255)'); // 2 沒圖
  assert.strictEqual(btns[2].style.color, 'rgb(255, 255, 255)'); // 3 有圖
  assert.ok(btns[2].style.boxShadow.indexOf('inset') >= 0); // 3 是目前這張
  assert.strictEqual(btns[0].style.boxShadow, 'none');
});

test('點提示列的數字：有圖 → 切換；沒圖 → 詢問網址；都不會關閉', async function () {
  var p = await setup({ storage: TWO, prompts: ['https://img/g.gif'] });
  bar(p)[1].click();
  assert.strictEqual(p.box().getAttribute('data-slot'), '2');
  bar(p)[6].click();
  assert.ok(p.asked[0].indexOf('第 7 張') >= 0);
  assert.strictEqual(p.box().getAttribute('data-slot'), '7');
});

test('點提示列上目前這張的數字 → 不做任何事', async function () {
  var p = await setup({ storage: TWO });
  var box = p.box();
  bar(p)[0].click();
  assert.strictEqual(p.box(), box);
});

test('在按鈕上按下滑鼠不會開始拖曳', async function () {
  var p = await setup({ storage: TWO });
  var btn = bar(p)[1];
  mouse(p, 'mousedown', btn, 100, 100);
  mouse(p, 'mousemove', p.d, 0, 0);
  mouse(p, 'mouseup', p.d, 0, 0);
  assert.strictEqual(p.box().style.left, '');
});

test('拖到部分超出畫面後換圖：位置不會被改掉（尺寸未知時不修正）', async function () {
  var p = await setup({ storage: TWO });
  drag(p, 100, 100, -99999, 100); // left = 40 - 240 = -200
  p.key(2);
  assert.strictEqual(p.box().style.left, '-200px');
});
