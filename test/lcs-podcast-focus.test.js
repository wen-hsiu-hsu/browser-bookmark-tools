'use strict';

var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var JSDOM = require('jsdom').JSDOM;
var build = require('../scripts/build.js');

var SRC = fs.readFileSync(path.join(__dirname, '../bookmarks/lcs-podcast-focus/source.js'), 'utf8');

/** 建置後在指定 HTML 上執行，回傳 window。 */
async function run(html) {
  var url = await build.toBookmarklet(SRC);
  var win = new JSDOM('<!doctype html><body>' + html + '</body>', { runScripts: 'outside-only' }).window;
  win.eval(decodeURIComponent(url.slice('javascript:'.length)));
  return win;
}

function toastText(win) {
  var el = win.document.getElementById('__bmt_toast__');
  return el && el.textContent;
}

var NAV = '<div class="v2-section sticky-nav">nav</div>';
var PLAYER =
  '<div id="podcast_player_container" class="w-layout-blockcontainer podcast-player-container w-container" style="top:80px"></div>';

test('移除導覽列並將播放器 top 設為 0px（!important）', async function () {
  var win = await run(NAV + NAV + PLAYER);
  var d = win.document;
  assert.strictEqual(d.querySelectorAll('.sticky-nav').length, 0);
  var p = d.getElementById('podcast_player_container');
  assert.strictEqual(p.style.top, '0px');
  assert.strictEqual(p.style.getPropertyPriority('top'), 'important');
  assert.strictEqual(toastText(win), '移除 sticky-nav ×2・播放器 top → 0px');
  assert.strictEqual(d.getElementById('__bmt_toast__').style.background, 'rgb(22, 163, 74)');
});

test('只有 v2-section 或只有 sticky-nav 的元素不會被刪', async function () {
  var win = await run('<div class="v2-section"></div><div class="sticky-nav"></div>' + PLAYER);
  assert.strictEqual(win.document.querySelectorAll('.v2-section, .sticky-nav').length, 2);
  assert.strictEqual(toastText(win), '播放器 top → 0px');
});

test('id 不存在時以 class 找播放器', async function () {
  var win = await run(NAV + '<div class="podcast-player-container"></div>');
  assert.strictEqual(win.document.querySelector('.podcast-player-container').style.top, '0px');
  assert.strictEqual(toastText(win), '移除 sticky-nav ×1・播放器 top → 0px');
});

test('id 與 class 同時存在時以 id 為準', async function () {
  var win = await run('<div id="decoy" class="podcast-player-container"></div>' + PLAYER);
  assert.strictEqual(win.document.getElementById('podcast_player_container').style.top, '0px');
  assert.strictEqual(win.document.getElementById('decoy').style.top, '');
});

test('只有導覽列時只回報移除（仍為 success）', async function () {
  var win = await run(NAV);
  assert.strictEqual(toastText(win), '移除 sticky-nav ×1');
  assert.strictEqual(win.document.getElementById('__bmt_toast__').style.background, 'rgb(22, 163, 74)');
});

test('兩者都找不到 → error', async function () {
  var win = await run('<p>other</p>');
  assert.strictEqual(toastText(win), '找不到目標元素');
  assert.strictEqual(win.document.getElementById('__bmt_toast__').style.background, 'rgb(220, 38, 38)');
});

test('重複執行：第二次只重設播放器', async function () {
  var url = await build.toBookmarklet(SRC);
  var code = decodeURIComponent(url.slice('javascript:'.length));
  var win = new JSDOM('<!doctype html><body>' + NAV + PLAYER + '</body>', { runScripts: 'outside-only' }).window;
  win.eval(code);
  win.eval(code);
  assert.strictEqual(win.document.querySelectorAll('#__bmt_toast__').length, 1);
  assert.strictEqual(toastText(win), '播放器 top → 0px');
});
