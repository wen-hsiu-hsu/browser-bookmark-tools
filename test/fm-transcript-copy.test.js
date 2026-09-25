'use strict';

var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var JSDOM = require('jsdom').JSDOM;
var build = require('../scripts/build.js');

var SRC = fs.readFileSync(path.join(__dirname, '../bookmarks/fm-transcript-copy/source.js'), 'utf8');
var FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures/fm-transcript.html'), 'utf8');

/** 以可手動推進的假計時器取代 win.setTimeout，回傳 tick(ms)。 */
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

function flush() {
  return new Promise(function (r) { setImmediate(r); });
}

/**
 * 建置後在指定 HTML 上執行；clipboard 以 stub 取代，回傳 { win, copied, tick }。
 * setup(win) 會在執行書籤前呼叫，用來掛按鈕行為。
 */
async function run(html, clipboardOk, setup) {
  var url = await build.toBookmarklet(SRC);
  var win = new JSDOM('<!doctype html><body>' + html + '</body>', { runScripts: 'outside-only' }).window;
  var res = { win: win, copied: null, tick: fakeTimers(win) };
  if (setup) setup(win);
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
  await flush();
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

// ---- v1.1.0：找不到逐字稿時自動點擊 Transcripts 按鈕 ----

var BTN =
  '<button class="FMPlayer2-RibbonButton" data-fmp-tooltip="Transcripts (R)" data-fmp-tooltip-desktop-pos="right"></button>';
var OTHER_BTN = '<button class="FMPlayer2-RibbonButton" data-fmp-tooltip="Notes (N)"></button>';

/** 讓 Transcripts 按鈕在被點擊 delay 毫秒後插入逐字稿；回傳點擊次數計數器。 */
function mountOnClick(delay) {
  var clicks = { n: 0, other: 0 };
  return {
    clicks: clicks,
    setup: function (win) {
      var d = win.document;
      d.querySelector('[data-fmp-tooltip^="Notes"]').addEventListener('click', function () {
        clicks.other++;
      });
      d.querySelector('[data-fmp-tooltip^="Transcripts"]').addEventListener('click', function () {
        clicks.n++;
        win.setTimeout(function () {
          var box = d.createElement('div');
          box.className = 'transcripts';
          box.setAttribute('data-transcript-content', '');
          var a = d.createElement('a');
          a.className = 'line';
          a.textContent = 'hello\nworld';
          box.appendChild(a);
          d.body.appendChild(box);
        }, delay);
      });
    }
  };
}

test('找不到逐字稿 → 點 Transcripts 按鈕、等待期間顯示 info，載入後複製', async function () {
  var m = mountOnClick(500);
  var r = await run(OTHER_BTN + BTN, true, m.setup);
  assert.strictEqual(m.clicks.n, 1);
  assert.strictEqual(m.clicks.other, 0);
  assert.deepStrictEqual(toast(r.win), { text: '正在開啟 Transcripts…', bg: 'rgb(37, 99, 235)' });
  r.tick(10000); // info toast 不會自動消失
  await flush();
  assert.strictEqual(r.copied, 'hello world');
  assert.deepStrictEqual(toast(r.win), { text: '已複製', bg: 'rgb(22, 163, 74)' });
  assert.strictEqual(m.clicks.n, 1); // 只點一次
});

test('等待期間 info toast 持續顯示，不會自動消失', async function () {
  var m = mountOnClick(2900);
  var r = await run(OTHER_BTN + BTN, true, m.setup);
  r.tick(2800);
  assert.deepStrictEqual(toast(r.win), { text: '正在開啟 Transcripts…', bg: 'rgb(37, 99, 235)' });
  assert.strictEqual(r.copied, null);
  r.tick(200);
  await flush();
  assert.strictEqual(r.copied, 'hello world');
});

test('點擊後 3 秒內仍抓不到 → 逾時 error，只點一次', async function () {
  var m = mountOnClick(5000);
  var r = await run(OTHER_BTN + BTN, true, m.setup);
  r.tick(3100);
  await flush();
  assert.strictEqual(r.copied, null);
  assert.deepStrictEqual(toast(r.win), {
    text: '已開啟 Transcripts 但抓不到逐字稿，請稍後再試',
    bg: 'rgb(220, 38, 38)'
  });
  assert.strictEqual(m.clicks.n, 1);
});

test('已有逐字稿時不點按鈕', async function () {
  var m = mountOnClick(0);
  var r = await run(OTHER_BTN + BTN + '<div class="transcripts"><a class="line">x</a></div>', true, m.setup);
  assert.strictEqual(m.clicks.n, 0);
  assert.strictEqual(r.copied, 'x');
});

test('沒有 Transcripts 按鈕（只有其他 RibbonButton）→ 直接提示 error', async function () {
  var clicks = 0;
  var r = await run(OTHER_BTN, true, function (win) {
    win.document.querySelector('button').addEventListener('click', function () { clicks++; });
  });
  assert.strictEqual(clicks, 0);
  assert.deepStrictEqual(toast(r.win), {
    text: '找不到逐字稿內容，請先開啟 Transcripts',
    bg: 'rgb(220, 38, 38)'
  });
});

test('逾時邊界：t=3000 出現仍會複製，t=3100 出現則逾時', async function () {
  var m = mountOnClick(3000);
  var r = await run(OTHER_BTN + BTN, true, m.setup);
  r.tick(3000);
  await flush();
  assert.strictEqual(r.copied, 'hello world');

  m = mountOnClick(3100);
  r = await run(OTHER_BTN + BTN, true, m.setup);
  r.tick(5000);
  await flush();
  assert.strictEqual(r.copied, null);
  assert.strictEqual(toast(r.win).text, '已開啟 Transcripts 但抓不到逐字稿，請稍後再試');
});

test('等待中再次點擊書籤：不會再點按鈕（避免把面板關掉）', async function () {
  var m = mountOnClick(500);
  var r = await run(OTHER_BTN + BTN, true, m.setup);
  var url = await build.toBookmarklet(SRC);
  r.win.eval(decodeURIComponent(url.slice('javascript:'.length)));
  assert.strictEqual(m.clicks.n, 1);
  r.tick(1000);
  await flush();
  assert.strictEqual(r.copied, 'hello world');
  assert.strictEqual(r.win.document.documentElement.hasAttribute('data-__bmt_fm_opening'), false);
});

test('面板已開啟（.active）但尚未載入：不點按鈕，直接等待', async function () {
  var clicks = 0;
  var r = await run(
    BTN + '<div class="FMPlayer2-Component FMPlayer2-Transcripts active"><div class="transcripts"></div></div>',
    true,
    function (win) {
      var d = win.document;
      d.querySelector('button').addEventListener('click', function () { clicks++; });
      win.setTimeout(function () {
        var a = d.createElement('a');
        a.className = 'line';
        a.textContent = 'late';
        d.querySelector('.transcripts').appendChild(a);
      }, 300);
    }
  );
  assert.strictEqual(clicks, 0);
  assert.strictEqual(toast(r.win).text, '正在開啟 Transcripts…');
  r.tick(1000);
  await flush();
  assert.strictEqual(r.copied, 'late');
});

test('分批渲染：等內容穩定後才複製完整內容', async function () {
  var r = await run(OTHER_BTN + BTN, true, function (win) {
    var d = win.document;
    d.querySelector('[data-fmp-tooltip^="Transcripts"]').addEventListener('click', function () {
      var box = d.createElement('div');
      box.className = 'transcripts';
      d.body.appendChild(box);
      [100, 150, 250].forEach(function (ms, i) {
        win.setTimeout(function () {
          var a = d.createElement('a');
          a.className = 'line';
          a.textContent = 'L' + i;
          box.appendChild(a);
        }, ms);
      });
    });
  });
  r.tick(1000);
  await flush();
  assert.strictEqual(r.copied, 'L0 L1 L2');
});

test('自動開啟後複製失敗 → 複製失敗', async function () {
  var m = mountOnClick(200);
  var r = await run(OTHER_BTN + BTN, false, m.setup);
  r.tick(1000);
  await flush();
  assert.deepStrictEqual(toast(r.win), { text: '複製失敗', bg: 'rgb(220, 38, 38)' });
});
