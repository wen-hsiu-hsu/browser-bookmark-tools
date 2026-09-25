'use strict';

var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var JSDOM = require('jsdom').JSDOM;
var build = require('../scripts/build.js');

var SRC = fs.readFileSync(path.join(__dirname, '../bookmarks/fm-learning-md/source.js'), 'utf8');
function fixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures/fm-learning', name + '.html'), 'utf8');
}

/** 建置後在指定 HTML 上執行；clipboard 以 stub 取代，回傳 { win, copied }。 */
async function run(html) {
  var url = await build.toBookmarklet(SRC);
  var win = new JSDOM('<!doctype html><body>' + html + '</body>', { runScripts: 'outside-only' }).window;
  var res = { win: win, copied: null };
  Object.defineProperty(win.navigator, 'clipboard', {
    value: { writeText: function (t) { res.copied = t; return Promise.resolve(); } }
  });
  win.eval(decodeURIComponent(url.slice('javascript:'.length)));
  await new Promise(function (r) { setImmediate(r); });
  return res;
}

function toast(win) {
  var el = win.document.getElementById('__bmt_toast__');
  return el && { text: el.textContent, error: el.style.background === 'rgb(220, 38, 38)' };
}

test('Flashcard：行內 code 轉反引號', async function () {
  var r = await run(fixture('flashcard-basic'));
  assert.strictEqual(
    r.copied,
    '### When `instructions(input)` is executed where `instructions` contains a multiplyBy2 function and `input` is 1, what happens with execution contexts?\n' +
      '\n' +
      "A brand new execution context is created for the multiplyBy2 function. It's added to the call stack with a local memory containing input = 1. The function executes (1 * 2 = 2), returns 2, and then the execution context is popped off the call stack."
  );
  assert.deepStrictEqual(toast(r.win), { text: '已複製', error: false });
});

test('Flashcard：code block 前只有一個換行（符合原始期望輸出）', async function () {
  var r = await run(fixture('flashcard-code'));
  assert.strictEqual(
    r.copied,
    '### In the following code, what happens to the counter variable when newFunc is called twice?\n' +
      '```javascript\n' +
      'function outer() {\n' +
      '  let counter = 0;\n' +
      '  function addOne() {\n' +
      '    counter++;\n' +
      '  }\n' +
      '  return addOne;\n' +
      '}\n' +
      'const newFunc = outer();\n' +
      'newFunc();\n' +
      'newFunc();\n' +
      '```\n' +
      '\n' +
      "The counter variable is stored in the closure attached to newFunc. On the first call, counter is incremented from 0 to 1. On the second call, counter is incremented from 1 to 2. The counter persists between calls because it's stored in the backpack/closure."
  );
});

test('Quiz（舊版 class）：答對 → is-correct', async function () {
  var r = await run(fixture('quiz-correct-class'));
  assert.strictEqual(
    r.copied,
    '<details>\n' +
      '<summary>In the `copyArrayAndManipulate(instructions)` function, what is the `instructions` parameter?</summary>\n' +
      'A function passed as an argument\n' +
      '</details>'
  );
});

test('Quiz（舊版 class）：答錯 → 取 is-missed，不取 is-incorrect', async function () {
  var r = await run(fixture('quiz-missed-class'));
  assert.strictEqual(
    r.copied,
    '<details>\n<summary>What does a "once" function accomplish using closure?</summary>\n' +
      'It limits how many times a function can be called\n</details>'
  );
});

test('Quiz（新版 data-state）', async function () {
  var r = await run(fixture('quiz-data-state'));
  assert.strictEqual(
    r.copied,
    '<details>\n<summary>When testing DOM interactions that involve framework re-renders, what approach helps ensure the DOM has updated before making assertions?</summary>\n' +
      'Wrap interactions in act() to wait for reconciliation\n</details>'
  );
});

test('Quiz（新版 data-state="missed"）', async function () {
  var r = await run(
    fixture('quiz-data-state')
      .replace('data-state="correct"', 'data-state="idle"')
      .replace('data-answer-id="a3" data-state="idle"', 'data-answer-id="a3" data-state="missed"')
  );
  assert.ok(r.copied.indexOf('\nAdd fixed setTimeout delays between actions\n') > 0);
});

test('Quiz 未作答 → 尚未送出答案', async function () {
  var r = await run(fixture('quiz-data-state').replace('data-state="correct"', 'data-state="idle"'));
  assert.strictEqual(r.copied, null);
  assert.deepStrictEqual(toast(r.win), { text: '尚未送出答案', error: true });
});

test('Quiz 多個正解 → 清單', async function () {
  var r = await run(
    '<div class="LM-Quiz"><div class="LM-Quiz-question"><p>Q?</p></div>' +
      '<button class="LM-Quiz-option is-correct"><div class="LM-Quiz-option-text">A</div></button>' +
      '<button class="LM-Quiz-option is-incorrect"><div class="LM-Quiz-option-text">B</div></button>' +
      '<button class="LM-Quiz-option" data-state="missed"><div class="LM-Quiz-option-text">C</div></button></div>'
  );
  assert.strictEqual(r.copied, '<details>\n<summary>Q?</summary>\n- A\n- C\n</details>');
});

test('Quiz 題目含 code block → 移到 </summary> 後，前後空行', async function () {
  var r = await run(
    '<div class="LM-Quiz"><div class="LM-Quiz-question"><div><p>What does <code>f</code> log?</p>\n' +
      '<pre><code>console.log(1);\n</code></pre>\n<p>Pick one.</p></div></div>' +
      '<button class="LM-Quiz-option" data-state="correct"><div class="LM-Quiz-option-text">1</div></button></div>'
  );
  assert.strictEqual(
    r.copied,
    '<details>\n<summary>What does `f` log? Pick one.</summary>\n\n' +
      '```javascript\nconsole.log(1);\n```\n\n1\n</details>'
  );
});

test('Quiz 與 Flashcard 同時存在時以 Quiz 為準', async function () {
  var r = await run(fixture('quiz-data-state') + fixture('flashcard-basic'));
  assert.ok(r.copied.indexOf('<details>') === 0);
});

test('Flashcard 缺背面 → 找不到 flashcard 內容', async function () {
  var r = await run('<div class="LM-Flashcard"><div class="LM-Flashcard-front"><div class="LM-Flashcard-text">Q</div></div></div>');
  assert.strictEqual(r.copied, null);
  assert.deepStrictEqual(toast(r.win), { text: '找不到 flashcard 內容', error: true });
});

test('Quiz 缺題目 → 找不到題目內容', async function () {
  var r = await run('<div class="LM-Quiz"><button class="LM-Quiz-option is-correct"><div class="LM-Quiz-option-text">A</div></button></div>');
  assert.strictEqual(r.copied, null);
  assert.deepStrictEqual(toast(r.win), { text: '找不到題目內容', error: true });
});

test('都沒有 → 找不到 Quiz 或 Flashcard', async function () {
  var r = await run('<p>x</p>');
  assert.deepStrictEqual(toast(r.win), { text: '找不到 Quiz 或 Flashcard', error: true });
});

// ---- code review 補充 ----

test('建置結果不含控制字元', async function () {
  var url = await build.toBookmarklet(SRC);
  assert.ok(!/[\x00-\x1f\x7f]/.test(url));
});

test('相鄰段落沒有空白時不會黏在一起', async function () {
  var r = await run(
    '<div class="LM-Flashcard"><div class="LM-Flashcard-front"><div class="LM-Flashcard-text"><p>Q1</p><p>Q2</p></div></div>' +
      '<div class="LM-Flashcard-back"><div class="LM-Flashcard-text"><ul><li>x</li><li>y</li></ul></div></div></div>'
  );
  assert.strictEqual(r.copied, '### Q1\nQ2\n\nx\ny');
});

test('連續 code block 之間空一行；code 內容（含空行、縮排）原樣保留', async function () {
  var r = await run(
    '<div class="LM-Flashcard"><div class="LM-Flashcard-front"><div class="LM-Flashcard-text"><p>Q</p>' +
      '<pre><code>a();\n\n\n  b();\n</code></pre><pre><code>c();</code></pre><p>after</p></div></div>' +
      '<div class="LM-Flashcard-back"><div class="LM-Flashcard-text">A</div></div></div>'
  );
  assert.strictEqual(
    r.copied,
    '### Q\n```javascript\na();\n\n\n  b();\n```\n\n```javascript\nc();\n```\nafter\n\nA'
  );
});

test('行內 code 含反引號 → 雙反引號', async function () {
  var r = await run(
    '<div class="LM-Flashcard"><div class="LM-Flashcard-front"><div class="LM-Flashcard-text">Use <code>a`b</code></div></div>' +
      '<div class="LM-Flashcard-back"><div class="LM-Flashcard-text">ok</div></div></div>'
  );
  assert.strictEqual(r.copied, '### Use `` a`b ``\n\nok');
});

test('Quiz 答案含 code block → </summary> 後空行', async function () {
  var r = await run(
    '<div class="LM-Quiz"><div class="LM-Quiz-question"><p>Q?</p></div>' +
      '<button class="LM-Quiz-option is-correct"><div class="LM-Quiz-option-text">see<pre><code>x()</code></pre></div></button></div>'
  );
  assert.strictEqual(r.copied, '<details>\n<summary>Q?</summary>\n\nsee\n```javascript\nx()\n```\n</details>');
});

test('Quiz 多個正解且含多行 → 以空行分隔，不用清單', async function () {
  var r = await run(
    '<div class="LM-Quiz"><div class="LM-Quiz-question"><p>Q?</p></div>' +
      '<button class="LM-Quiz-option is-correct"><div class="LM-Quiz-option-text"><pre><code>a()</code></pre></div></button>' +
      '<button class="LM-Quiz-option is-missed"><div class="LM-Quiz-option-text">b</div></button></div>'
  );
  assert.strictEqual(r.copied, '<details>\n<summary>Q?</summary>\n\n```javascript\na()\n```\n\nb\n</details>');
});

test('Quiz 題目只有程式碼 → 以（程式碼題）當 summary', async function () {
  var r = await run(
    '<div class="LM-Quiz"><div class="LM-Quiz-question"><pre><code>f()</code></pre></div>' +
      '<button class="LM-Quiz-option is-correct"><div class="LM-Quiz-option-text">1</div></button></div>'
  );
  assert.strictEqual(r.copied, '<details>\n<summary>（程式碼題）</summary>\n\n```javascript\nf()\n```\n\n1\n</details>');
});

test('Flashcard 缺正面 → 找不到 flashcard 內容', async function () {
  var r = await run('<div class="LM-Flashcard"><div class="LM-Flashcard-back"><div class="LM-Flashcard-text">A</div></div></div>');
  assert.deepStrictEqual(toast(r.win), { text: '找不到 flashcard 內容', error: true });
});

test('複製失敗 → 複製失敗', async function () {
  var url = await build.toBookmarklet(SRC);
  var win = new JSDOM('<!doctype html><body>' + fixture('flashcard-basic') + '</body>', { runScripts: 'outside-only' }).window;
  Object.defineProperty(win.navigator, 'clipboard', {
    value: { writeText: function () { return Promise.reject(new Error('blocked')); } }
  });
  win.document.execCommand = function () { return false; };
  win.eval(decodeURIComponent(url.slice('javascript:'.length)));
  await new Promise(function (r) { setImmediate(r); });
  assert.deepStrictEqual(toast(win), { text: '複製失敗', error: true });
});
