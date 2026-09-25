'use strict';

var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var JSDOM = require('jsdom').JSDOM;
var build = require('../scripts/build.js');

var SRC = fs.readFileSync(path.join(__dirname, '../bookmarks/fm-flashcard-batch/source.js'), 'utf8');
var CODE;

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

function flush() {
  return new Promise(function (r) { setImmediate(r); });
}

/** 卡片 HTML（結構取自實際頁面）。 */
function cardHtml(c) {
  function side(cls, html) {
    return html == null
      ? ''
      : '<div class="' + cls + '"><div class="LM-Flashcard-content"><div class="LM-Flashcard-content-wrapper">' +
          '<div class="LM-Flashcard-text"><div>' + html + '\n</div></div></div></div></div>';
  }
  return (
    '<div class="LM-Flashcard"><button type="button" class="LM-Flashcard-card" data-revealed="">' +
    side('LM-Flashcard-front', c.front) + '\n\n' + side('LM-Flashcard-back', c.back) + '</button></div>'
  );
}

/**
 * 模擬整副卡片。opts：
 *   start      起始索引
 *   delay      點擊後多久換卡（ms）
 *   backDelay  背面比正面晚多久更新（模擬分批渲染）
 *   lastNext   最後一張的 Next：'disabled'（預設）| 'missing' | 'noop'
 *   infinite   Next 永遠可以點，產生無限張卡
 *   prevBroken Previous 點了沒反應
 */
async function run(cards, opts, clipboardOk) {
  opts = opts || {};
  if (!CODE) CODE = decodeURIComponent((await build.toBookmarklet(SRC)).slice('javascript:'.length));
  var win = new JSDOM(
    '<!doctype html><body><div class="LearningMode-main"><div class="LearningMode-content" data-step-type="flashcard"></div>' +
      '<div class="LearningMode-actions"><div class="LM-Content-Actions">' +
      '<button type="button" class="LM-Content-Actions-btn LM-Content-Actions-prev-btn"><span>Previous</span></button>' +
      '<button type="button" class="LM-Content-Actions-btn LM-Content-Actions-next-btn"><span>Next</span></button>' +
      '</div></div></div></body>',
    { runScripts: 'outside-only' }
  ).window;
  var d = win.document;
  var tick = fakeTimers(win);
  var res = { win: win, tick: tick, copied: [], nextClicks: 0 };
  var i = opts.start || 0;
  var box = d.querySelector('.LearningMode-content');
  var prevBtn = d.querySelector('.LM-Content-Actions-prev-btn');
  var nextBtn = d.querySelector('.LM-Content-Actions-next-btn');

  function card(k) {
    return opts.infinite ? { front: '<p>Q' + k + '</p>', back: '<p>A' + k + '</p>' } : cards[k];
  }
  function last() {
    return !opts.infinite && i === cards.length - 1;
  }
  function render() {
    var c = card(i);
    if (c.quiz) {
      box.innerHTML = '<div class="LM-Quiz"><div class="LM-Quiz-question">quiz step</div></div>';
    } else if (opts.reuse && box.querySelector('.LM-Flashcard')) {
      // 模擬 React：保留節點，只更新內容
      box.querySelector('.LM-Flashcard-front .LM-Flashcard-text').firstChild.innerHTML = c.front;
      box.querySelector('.LM-Flashcard-back .LM-Flashcard-text').firstChild.innerHTML = c.back;
    } else if (opts.backDelay) {
      var old = box.querySelector('.LM-Flashcard-back');
      box.innerHTML = cardHtml({ front: c.front, back: null });
      if (old) box.querySelector('.LM-Flashcard-card').appendChild(old);
      win.setTimeout(function () {
        var o = box.querySelector('.LM-Flashcard-back');
        if (o) o.parentNode.removeChild(o);
        var tmp = d.createElement('div');
        tmp.innerHTML = cardHtml({ front: '', back: c.back });
        box.querySelector('.LM-Flashcard-card').appendChild(tmp.querySelector('.LM-Flashcard-back'));
      }, opts.backDelay);
    } else {
      box.innerHTML = cardHtml(c);
    }
    prevBtn.disabled = i === 0;
    nextBtn.disabled = last() && (opts.lastNext || 'disabled') === 'disabled';
    if (last() && opts.lastNext === 'missing') nextBtn.style.display = 'none';
  }
  box.innerHTML = card(i).quiz ? '<div class="LM-Quiz"></div>' : cardHtml(card(i));
  prevBtn.disabled = i === 0;
  nextBtn.disabled = last() && (opts.lastNext || 'disabled') === 'disabled';
  if (last() && opts.lastNext === 'missing') nextBtn.parentNode.removeChild(nextBtn);

  prevBtn.addEventListener('click', function () {
    if (opts.prevBroken) return;
    win.setTimeout(function () { i--; render(); }, opts.delay || 200);
  });
  nextBtn.addEventListener('click', function () {
    res.nextClicks++;
    if (last()) return; // noop
    win.setTimeout(function () {
      i++;
      render();
      if (last() && opts.lastNext === 'missing') nextBtn.parentNode.removeChild(nextBtn);
    }, opts.delay || 200);
  });

  Object.defineProperty(win.navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: function (t) {
        res.copied.push(t);
        return clipboardOk === false ? Promise.reject(new Error('expired')) : Promise.resolve();
      }
    }
  });
  win.document.execCommand = function () { return false; };
  win.eval(CODE);
  res.again = function () { win.eval(CODE); };
  res.toast = function () {
    var el = d.getElementById('__bmt_toast__');
    return el && { text: el.textContent, bg: el.style.background };
  };
  res.done = async function (ms) {
    tick(ms || 60000);
    await flush();
  };
  return res;
}

var DECK = [
  { front: '<p>What is the purpose of not using Shadow DOM for repeated web components?</p>', back: '<p>To share the document and CSS across the page.</p>' },
  { front: '<p>Why import a web component\'s JS file?</p>', back: '<p>To execute <code>customElements.define()</code>.</p>' },
  { front: '<p>What does this log?</p>\n<pre tabindex="-1"><code>console.log(1);\n</code></pre>', back: '<p>1</p>' },
  { front: '<p>Last question?</p>', back: '<p>Last answer.</p>' }
];
var EXPECTED =
  '### What is the purpose of not using Shadow DOM for repeated web components?\n\nTo share the document and CSS across the page.\n\n' +
  "### Why import a web component's JS file?\n\nTo execute `customElements.define()`.\n\n" +
  '### What does this log?\n```javascript\nconsole.log(1);\n```\n\n1\n\n' +
  '### Last question?\n\nLast answer.';

var GREEN = 'rgb(22, 163, 74)';
var RED = 'rgb(220, 38, 38)';
var BLUE = 'rgb(37, 99, 235)';

test('從中間開始：先回到第一張，再依序擷取全部卡片並一次複製', async function () {
  var r = await run(DECK, { start: 2 });
  assert.deepStrictEqual(r.toast(), { text: '回到第一張…', bg: BLUE });
  await r.done();
  assert.deepStrictEqual(r.copied, [EXPECTED]);
  assert.deepStrictEqual(r.toast(), { text: '已複製 4 題', bg: GREEN });
  assert.strictEqual(r.win.document.documentElement.hasAttribute('data-__bmt_fm_batch'), false);
});

test('擷取過程中顯示進度', async function () {
  var r = await run(DECK);
  assert.deepStrictEqual(r.toast(), { text: '複製中… 第 1 張', bg: BLUE });
  r.tick(450);
  assert.deepStrictEqual(r.toast(), { text: '複製中… 第 2 張', bg: BLUE });
});

test('最後一張的 Next 被移除也能正常結束', async function () {
  var r = await run(DECK, { lastNext: 'missing' });
  await r.done();
  assert.deepStrictEqual(r.copied, [EXPECTED]);
});

test('缺背面的卡片略過並繼續', async function () {
  var deck = DECK.slice();
  deck[1] = { front: '<p>No back</p>', back: null };
  var r = await run(deck);
  await r.done();
  assert.strictEqual(r.copied[0].indexOf('No back'), -1);
  assert.strictEqual(r.copied[0].split('### ').length - 1, 3);
  assert.strictEqual(r.toast().text, '已複製 3 題，略過 1 張');
});

test('最後一張 Next 點了沒反應 → 逾時中止，但內容完整', async function () {
  var r = await run(DECK, { lastNext: 'noop' });
  await r.done();
  assert.deepStrictEqual(r.copied, [EXPECTED]);
  assert.strictEqual(r.toast().text, '已複製 4 題（逾時中止）');
});

test('無限張卡 → 達 100 張上限中止', async function () {
  var r = await run(null, { infinite: true });
  await r.done(200000);
  assert.strictEqual(r.copied[0].split('### ').length - 1, 100);
  assert.strictEqual(r.nextClicks, 99);
  assert.strictEqual(r.toast().text, '已複製 100 題（達上限中止）');
});

test('背面比正面晚更新：擷取到的正反面屬於同一張', async function () {
  var r = await run(DECK, { backDelay: 150 });
  await r.done();
  assert.deepStrictEqual(r.copied, [EXPECTED]);
});

test('複製失敗 → 顯示「點此複製」按鈕，點擊後複製成功並移除按鈕', async function () {
  var r = await run(DECK, {}, false);
  await r.done();
  var d = r.win.document;
  var btn = d.getElementById('__bmt_copy_btn__');
  assert.ok(btn);
  assert.strictEqual(btn.textContent, '已擷取 4 題，點此複製');
  assert.strictEqual(d.getElementById('__bmt_toast__'), null);
  Object.defineProperty(r.win.navigator, 'clipboard', {
    value: { writeText: function (t) { r.copied.push('OK:' + t); return Promise.resolve(); } }
  });
  btn.click();
  await flush();
  assert.strictEqual(r.copied[r.copied.length - 1], 'OK:' + EXPECTED);
  assert.strictEqual(d.getElementById('__bmt_copy_btn__'), null);
  assert.deepStrictEqual(r.toast(), { text: '已複製 4 題', bg: GREEN });
});

test('Previous 點了沒反應 → 無法回到第一張', async function () {
  var r = await run(DECK, { start: 1, prevBroken: true });
  await r.done(3500);
  assert.deepStrictEqual(r.copied, []);
  assert.deepStrictEqual(r.toast(), { text: '無法回到第一張', bg: RED });
  assert.strictEqual(r.win.document.documentElement.hasAttribute('data-__bmt_fm_batch'), false);
});

test('執行中再點一次 → 提示執行中，不重跑', async function () {
  var r = await run(DECK);
  r.tick(100);
  r.again();
  assert.deepStrictEqual(r.toast(), { text: '批次複製執行中', bg: BLUE });
  await r.done();
  assert.deepStrictEqual(r.copied, [EXPECTED]);
});

test('沒有 flashcard → 找不到 flashcard 內容', async function () {
  if (!CODE) CODE = decodeURIComponent((await build.toBookmarklet(SRC)).slice('javascript:'.length));
  var win = new JSDOM('<!doctype html><body><div class="LM-Quiz"></div></body>', { runScripts: 'outside-only' }).window;
  win.eval(CODE);
  var el = win.document.getElementById('__bmt_toast__');
  assert.strictEqual(el.textContent, '找不到 flashcard 內容');
  assert.strictEqual(el.style.background, RED);
});

test('Next 進到非 flashcard 步驟（例如 Quiz）→ 視為結束，不計入略過', async function () {
  var r = await run(DECK.concat([{ quiz: true }]));
  await r.done();
  assert.deepStrictEqual(r.copied, [EXPECTED]);
  assert.strictEqual(r.toast().text, '已複製 4 題');
});

test('Previous 退到非 flashcard 步驟 → 點一次 Next 回到第一張再開始', async function () {
  var r = await run([{ quiz: true }].concat(DECK), { start: 3 });
  await r.done();
  assert.deepStrictEqual(r.copied, [EXPECTED]);
  assert.strictEqual(r.toast().text, '已複製 4 題');
});

test('React 式更新（節點不變、只換內容）也能偵測換卡', async function () {
  var r = await run(DECK, { start: 2, reuse: true });
  await r.done();
  assert.deepStrictEqual(r.copied, [EXPECTED]);
});

test('上次留下的「點此複製」按鈕在重新執行時移除', async function () {
  var r = await run(DECK, {}, false);
  await r.done();
  assert.ok(r.win.document.getElementById('__bmt_copy_btn__'));
  r.again();
  assert.strictEqual(r.win.document.getElementById('__bmt_copy_btn__'), null);
});

test('點按鈕後複製仍失敗 → 保留按鈕可再試', async function () {
  var r = await run(DECK, {}, false);
  await r.done();
  var btn = r.win.document.getElementById('__bmt_copy_btn__');
  btn.click();
  await flush();
  assert.strictEqual(r.win.document.getElementById('__bmt_copy_btn__'), btn);
  assert.deepStrictEqual(r.toast(), { text: '複製失敗', bg: RED });
});

test('等待換卡期間持續更新執行中標記，不會被誤判為已結束', async function () {
  var r = await run(DECK, { lastNext: 'noop' });
  r.tick(600); // 走到最後一張，開始等 Next（不會有反應）
  r.tick(2500);
  var flag = +r.win.document.documentElement.getAttribute('data-__bmt_fm_batch');
  assert.ok(r.win.Date.now() - flag <= 100);
  r.again();
  assert.strictEqual(r.toast().text, '批次複製執行中');
});

test('殘留的過期標記（例如上次執行中途出錯）不會擋住新的執行', async function () {
  if (!CODE) CODE = decodeURIComponent((await build.toBookmarklet(SRC)).slice('javascript:'.length));
  var r = await run(DECK, {}); // 先正常跑完一次
  await r.done();
  r.win.document.documentElement.setAttribute('data-__bmt_fm_batch', r.win.Date.now() - 5000);
  r.copied.length = 0;
  r.again();
  assert.notStrictEqual(r.toast().text, '批次複製執行中');
});
