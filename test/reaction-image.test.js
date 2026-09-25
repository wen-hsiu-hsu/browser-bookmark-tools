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
      bubbles: true, cancelable: true
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
