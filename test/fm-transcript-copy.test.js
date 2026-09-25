'use strict';

var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var JSDOM = require('jsdom').JSDOM;
var build = require('../scripts/build.js');

var SRC = fs.readFileSync(path.join(__dirname, '../bookmarks/fm-transcript-copy/source.js'), 'utf8');
var FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures/fm-transcript.html'), 'utf8');

/** 建置後在指定 HTML 上執行；clipboard 以 stub 取代，回傳 { win, copied }。 */
async function run(html, clipboardOk) {
  var url = await build.toBookmarklet(SRC);
  var win = new JSDOM('<!doctype html><body>' + html + '</body>', { runScripts: 'outside-only' }).window;
  var res = { win: win, copied: null };
  Object.defineProperty(win.navigator, 'clipboard', {
    value: {
      writeText: function (t) {
        res.copied = t;
        return clipboardOk === false ? Promise.reject(new Error('blocked')) : Promise.resolve();
      }
    }
  });
  win.document.execCommand = function () { return false; };
  win.eval(decodeURIComponent(url.slice('javascript:'.length)));
  await new Promise(function (r) { setImmediate(r); });
  return res;
}

function toast(win) {
  var el = win.document.getElementById('__bmt_toast__');
  return el && { text: el.textContent, bg: el.style.background };
}

test('範例頁面：行內換行變空格、行間以空格連接', async function () {
  var r = await run(FIXTURE);
  assert.strictEqual(
    r.copied,
    ">> Will Sentance: People, this code may look fairly alright, but it actually involves and requires a " +
      "lot of precision and is a real gotcha of code. " +
      "I think partly because if you come from other languages, you can't do these things. " +
      "But you can in JavaScript. Okay, so we're going to define a function called create function. " +
      "We're not going to go inside it, we're just going to save it. You don't go inside a function till " +
      "you run it, which we're going to do in the next line. " +
      "how do we know we're " +
      "calling it, there we go, there's a question."
  );
  assert.deepStrictEqual(toast(r.win), { text: '已複製', bg: 'rgb(22, 163, 74)' });
});

test('不包含標題、按鈕等非逐字稿文字', async function () {
  var r = await run(FIXTURE);
  assert.ok(r.copied.indexOf('Transcripts') < 0);
  assert.ok(r.copied.indexOf('Track current time') < 0);
});

test('只有 data-transcript-content（class 改名）仍可抓取', async function () {
  var r = await run('<div data-transcript-content><a class="line">a</a><a class="line">b</a></div>');
  assert.strictEqual(r.copied, 'a b');
});

test('只有 .transcripts（data 屬性被拿掉）仍可抓取', async function () {
  var r = await run('<div class="transcripts"><a class="line">a</a></div>');
  assert.strictEqual(r.copied, 'a');
});

test('兩個 selector 對到巢狀的不同容器時不重複', async function () {
  var r = await run(
    '<div data-transcript-content><div class="transcripts"><a class="line">a</a><a class="line">b</a></div></div>'
  );
  assert.strictEqual(r.copied, 'a b');
});

test('空白行略過，不產生多餘空格', async function () {
  var r = await run('<div class="transcripts"><a class="line">a</a><a class="line">  \n </a><a class="line"> b </a></div>');
  assert.strictEqual(r.copied, 'a b');
});

test('找不到逐字稿 → error，不複製', async function () {
  var r = await run('<p>no transcript</p>');
  assert.strictEqual(r.copied, null);
  assert.deepStrictEqual(toast(r.win), {
    text: '找不到逐字稿內容，請先開啟 Transcripts',
    bg: 'rgb(220, 38, 38)'
  });
});

test('clipboard 與 fallback 都失敗 → 複製失敗', async function () {
  var r = await run(FIXTURE, false);
  assert.deepStrictEqual(toast(r.win), { text: '複製失敗', bg: 'rgb(220, 38, 38)' });
});
