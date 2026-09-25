'use strict';

var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var JSDOM = require('jsdom').JSDOM;
var build = require('../scripts/build.js');

var SRC = fs.readFileSync(path.join(__dirname, '../bookmarks/web-whiteboard/source.js'), 'utf8');
var codePromise = build.toBookmarklet(SRC).then(function (url) {
  return decodeURIComponent(url.slice('javascript:'.length));
});

function wait(ms) {
  return new Promise(function (r) {
    setTimeout(r, ms);
  });
}

/** 記錄繪圖指令的假 2D context（jsdom 沒有 canvas 實作）。 */
function fakeCtx() {
  var ops = [];
  var ctx = { ops: ops };
  ['setTransform', 'clearRect', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'arc', 'fill'].forEach(function (m) {
    ctx[m] = function () {
      ops.push([m].concat([].slice.call(arguments)));
    };
  });
  return ctx;
}

/** 開一個頁面並執行書籤，回傳測試用的工具。 */
async function open(html) {
  var code = await codePromise;
  var win = new JSDOM('<!doctype html><body>' + (html || '<p>page</p>') + '</body>', {
    runScripts: 'outside-only',
    pretendToBeVisual: true
  }).window;
  var ctx = fakeCtx();
  win.HTMLCanvasElement.prototype.getContext = function () {
    return ctx;
  };
  win.eval(code);
  var d = win.document;
  var t = {
    win: win,
    d: d,
    ctx: ctx,
    code: code,
    run: function () {
      win.eval(code);
    },
    canvas: function () {
      return d.getElementById('__bmt_wb_canvas__');
    },
    bar: function () {
      return d.getElementById('__bmt_wb_toolbar__');
    },
    btn: function (label) {
      return d.querySelector('#__bmt_wb_toolbar__ [aria-label="' + label + '"]');
    },
    click: function (label) {
      t.btn(label).click();
    },
    toast: function () {
      var el = d.getElementById('__bmt_toast__');
      return el && el.textContent;
    },
    toastBg: function () {
      return d.getElementById('__bmt_toast__').style.background;
    },
    mouse: function (target, type, x, y, extra) {
      var init = {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: 0,
        buttons: type === 'mouseup' ? 0 : 1
      };
      for (var k in extra || {}) init[k] = extra[k];
      var e = new win.MouseEvent(type, init);
      target.dispatchEvent(e);
      return e;
    },
    /** 在畫布上從第一點拖到最後一點。 */
    drag: function (points) {
      t.mouse(t.canvas(), 'mousedown', points[0][0], points[0][1]);
      for (var i = 1; i < points.length; i++) t.mouse(d, 'mousemove', points[i][0], points[i][1]);
      t.mouse(d, 'mouseup', points[points.length - 1][0], points[points.length - 1][1]);
    },
    key: function (target, key, mods) {
      var init = { key: key, bubbles: true, cancelable: true };
      for (var k in mods || {}) init[k] = mods[k];
      var e = new win.KeyboardEvent('keydown', init);
      target.dispatchEvent(e);
      return e;
    },
    scrollTo: async function (x, y) {
      Object.defineProperty(win, 'pageXOffset', { value: x, configurable: true, writable: true });
      Object.defineProperty(win, 'pageYOffset', { value: y, configurable: true, writable: true });
      win.dispatchEvent(new win.Event('scroll'));
      await wait(50);
    },
    /** 上一次清除畫布之後畫出的圖形：筆畫為點陣列，圓點為 {dot:[x,y]}。 */
    shapes: function () {
      var ops = ctx.ops;
      var start = 0;
      for (var i = ops.length - 1; i >= 0; i--) {
        if (ops[i][0] === 'clearRect') {
          start = i + 1;
          break;
        }
      }
      var out = [];
      var cur = null;
      for (var j = start; j < ops.length; j++) {
        var o = ops[j];
        if (o[0] === 'beginPath') cur = [];
        else if (o[0] === 'moveTo' || o[0] === 'lineTo') cur.push([o[1], o[2]]);
        else if (o[0] === 'stroke') out.push(cur);
        else if (o[0] === 'arc') out.push({ dot: [o[1], o[2]] });
      }
      return out;
    },
    /** 捲動事件會觸發完整重畫，用它取得目前所有可見的筆畫。 */
    visible: async function () {
      await t.scrollTo(win.pageXOffset || 0, win.pageYOffset || 0);
      return t.shapes();
    },
    notes: function () {
      return d.querySelectorAll('.__bmt_wb_note__');
    }
  };
  return t;
}

test('開啟：建立畫布、便利貼層、工具列，預設互動模式', async function () {
  var t = await open();
  assert.ok(t.canvas());
  assert.ok(t.d.getElementById('__bmt_wb_notes__'));
  assert.ok(t.bar());
  assert.strictEqual(t.canvas().parentNode, t.d.documentElement);
  assert.strictEqual(t.canvas().style.position, 'fixed');
  assert.strictEqual(t.canvas().style.pointerEvents, 'none');
  assert.strictEqual(t.toast(), '白板已開啟');
  assert.strictEqual(t.d.querySelectorAll('style').length, 0, '不使用 <style>，避免被 CSP 擋');
});

test('畫布依 devicePixelRatio 放大', async function () {
  var code = await codePromise;
  var win = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', pretendToBeVisual: true }).window;
  win.HTMLCanvasElement.prototype.getContext = function () {
    return fakeCtx();
  };
  win.devicePixelRatio = 2;
  win.eval(code);
  var c = win.document.getElementById('__bmt_wb_canvas__');
  assert.strictEqual(c.width, win.innerWidth * 2);
  assert.strictEqual(c.style.width, win.innerWidth + 'px');
});

test('重複點擊：只顯示提示，不重複建立', async function () {
  var t = await open();
  t.run();
  assert.strictEqual(t.d.querySelectorAll('#__bmt_wb_toolbar__').length, 1);
  assert.strictEqual(t.d.querySelectorAll('canvas').length, 1);
  assert.strictEqual(t.toast(), '白板已開啟');
  assert.strictEqual(t.toastBg(), 'rgb(37, 99, 235)');
});

test('舊版白板開著時不建立新版', async function () {
  var t = await open('<div id="__lm_wb_layer__"></div>');
  assert.strictEqual(t.bar(), null);
  assert.strictEqual(t.toast(), '舊版白板仍開著，請先關閉');
});

test('選工具自動切到畫圖模式；模式鈕、Esc 切回互動模式', async function () {
  var t = await open();
  t.click('筆');
  assert.strictEqual(t.canvas().style.pointerEvents, 'auto');
  assert.strictEqual(t.toast(), '已切換至畫圖模式');
  t.key(t.d.body, 'Escape');
  assert.strictEqual(t.canvas().style.pointerEvents, 'none');
  assert.strictEqual(t.toast(), '已切換至互動模式');
  t.click('切換模式');
  assert.strictEqual(t.canvas().style.pointerEvents, 'auto');
  t.click('切換模式');
  assert.strictEqual(t.canvas().style.pointerEvents, 'none');
});

test('互動模式下點畫布不會畫圖', async function () {
  var t = await open();
  t.drag([[10, 10], [50, 50]]);
  assert.deepStrictEqual(await t.visible(), []);
});

test('畫筆：記錄文件座標，捲動後以捲動量重畫', async function () {
  var t = await open();
  t.click('紅');
  t.click('粗');
  t.click('筆');
  await t.scrollTo(0, 100);
  var down = t.mouse(t.canvas(), 'mousedown', 10, 20);
  assert.ok(down.defaultPrevented, 'mousedown 需 preventDefault，避免反白頁面文字');
  t.mouse(t.d, 'mousemove', 30, 40);
  t.mouse(t.d, 'mouseup', 30, 40);
  var shapes = await t.visible();
  assert.deepStrictEqual(shapes, [[[10, 120], [30, 140]]]);
  var tf = t.ctx.ops.filter(function (o) {
    return o[0] === 'setTransform';
  });
  assert.strictEqual(tf[tf.length - 1][6], -100);
  // 捲到筆畫外就不畫
  await t.scrollTo(0, 5000);
  assert.deepStrictEqual(t.shapes(), []);
});

test('只點一下會畫出圓點', async function () {
  var t = await open();
  t.click('筆');
  t.drag([[15, 25]]);
  assert.deepStrictEqual(await t.visible(), [{ dot: [15, 25] }]);
});

test('在視窗外放開滑鼠：下一次移動時結束筆畫', async function () {
  var t = await open();
  t.click('筆');
  t.mouse(t.canvas(), 'mousedown', 0, 0);
  t.mouse(t.d, 'mousemove', 10, 10);
  t.mouse(t.d, 'mousemove', 20, 20, { buttons: 0 });
  t.mouse(t.d, 'mousemove', 30, 30, { buttons: 0 });
  assert.deepStrictEqual(await t.visible(), [[[0, 0], [10, 10]]]);
  t.click('復原');
  assert.deepStrictEqual(await t.visible(), [], '已被記錄成一筆可復原的動作');
});

test('橡皮擦整條刪除筆畫，可復原／重做', async function () {
  var t = await open();
  t.click('筆');
  t.drag([[0, 0], [100, 0]]);
  t.drag([[0, 50], [100, 50]]);
  t.click('橡皮擦');
  t.drag([[50, 3]]);
  assert.deepStrictEqual(await t.visible(), [[[0, 50], [100, 50]]]);
  t.click('復原');
  assert.strictEqual(t.toast(), '已復原');
  assert.deepStrictEqual(await t.visible(), [[[0, 0], [100, 0]], [[0, 50], [100, 50]]], '回到原本的順序');
  t.click('重做');
  assert.strictEqual(t.toast(), '已重做');
  assert.strictEqual((await t.visible()).length, 1);
});

test('點擊重疊處只刪最上層那條', async function () {
  var t = await open();
  t.click('筆');
  t.drag([[0, 0], [100, 0]]);
  t.drag([[0, 2], [100, 2]]);
  t.click('橡皮擦');
  t.drag([[50, 1]]);
  assert.deepStrictEqual(await t.visible(), [[[0, 0], [100, 0]]]);
});

test('橡皮擦滑過多條筆畫會全部刪除，不會刪到便利貼', async function () {
  var t = await open();
  t.click('筆');
  t.drag([[0, 0], [0, 100]]);
  t.drag([[50, 0], [50, 100]]);
  t.click('便利貼');
  t.drag([[200, 200]]);
  t.click('橡皮擦');
  t.drag([[-10, 50], [60, 50], [250, 250]]);
  assert.deepStrictEqual(await t.visible(), []);
  assert.strictEqual(t.notes().length, 1);
});

test('清除全部只清筆畫，可復原；沒有筆畫時提示', async function () {
  var t = await open();
  t.click('清除全部');
  assert.strictEqual(t.toast(), '目前沒有筆畫');
  assert.strictEqual(t.toastBg(), 'rgb(220, 38, 38)');
  t.click('筆');
  t.drag([[0, 0], [10, 10]]);
  t.drag([[20, 20], [30, 30]]);
  t.click('便利貼');
  t.drag([[100, 100]]);
  t.click('清除全部');
  assert.strictEqual(t.toast(), '已清除所有筆畫');
  assert.deepStrictEqual(await t.visible(), []);
  assert.strictEqual(t.notes().length, 1);
  t.click('復原');
  assert.strictEqual((await t.visible()).length, 2);
});

test('沒有可復原／重做時提示；新動作會清空重做堆疊', async function () {
  var t = await open();
  t.click('復原');
  assert.strictEqual(t.toast(), '沒有可復原的動作');
  t.click('重做');
  assert.strictEqual(t.toast(), '沒有可重做的動作');
  t.click('筆');
  t.drag([[0, 0], [10, 10]]);
  t.click('復原');
  t.drag([[20, 20], [30, 30]]);
  t.click('重做');
  assert.strictEqual(t.toast(), '沒有可重做的動作');
});

test('便利貼：以文件座標新增，黑色改用白底，新增後可復原', async function () {
  var t = await open();
  await t.scrollTo(0, 300);
  t.click('便利貼');
  t.drag([[40, 50]]);
  var n = t.notes()[0];
  assert.strictEqual(n.style.left, '40px');
  assert.strictEqual(n.style.top, '350px');
  assert.strictEqual(n.style.width, '160px');
  assert.strictEqual(n.style.height, '120px');
  assert.strictEqual(n.style.background, 'rgb(255, 255, 255)');
  assert.strictEqual(t.d.activeElement, n.querySelector('textarea'));
  t.click('藍');
  t.drag([[0, 0]]);
  assert.strictEqual(t.notes()[1].style.background, 'rgb(37, 99, 235)');
  t.click('復原');
  assert.strictEqual(t.notes().length, 1);
});

test('便利貼：拖曳移動、縮放有最小尺寸（皆不進 undo）', async function () {
  var t = await open();
  t.click('便利貼');
  t.drag([[100, 100]]);
  t.key(t.d.body, 'Escape');
  var n = t.notes()[0];
  var hdr = n.querySelector('.__bmt_wb_note_hdr__');
  t.mouse(hdr, 'mousedown', 110, 105);
  t.mouse(t.d, 'mousemove', 160, 125);
  t.mouse(t.d, 'mouseup', 160, 125);
  assert.strictEqual(n.style.left, '150px');
  assert.strictEqual(n.style.top, '120px');
  var grip = n.querySelector('.__bmt_wb_note_resize__');
  t.mouse(grip, 'mousedown', 300, 300);
  t.mouse(t.d, 'mousemove', 340, 310);
  assert.strictEqual(n.style.width, '200px');
  assert.strictEqual(n.style.height, '130px');
  t.mouse(t.d, 'mousemove', 0, 0);
  t.mouse(t.d, 'mouseup', 0, 0);
  assert.strictEqual(n.style.width, '80px');
  assert.strictEqual(n.style.height, '60px');
  // 放開後再移動不影響
  t.mouse(t.d, 'mousemove', 500, 500);
  assert.strictEqual(n.style.width, '80px');
  // undo 只會復原新增，不會復原拖曳／縮放
  t.click('復原');
  assert.strictEqual(t.notes().length, 0);
});

test('便利貼：× 刪除後復原，文字與位置保留', async function () {
  var t = await open();
  t.click('便利貼');
  t.drag([[10, 10]]);
  t.drag([[300, 300]]);
  var ta = t.notes()[0].querySelector('textarea');
  ta.value = '筆記';
  ta.dispatchEvent(new t.win.Event('input', { bubbles: true }));
  t.notes()[0].querySelector('.__bmt_wb_note_close__').click();
  assert.strictEqual(t.notes().length, 1);
  t.click('復原');
  var notes = t.notes();
  assert.strictEqual(notes.length, 2);
  var restored = [].filter.call(notes, function (n) {
    return n.style.left === '10px';
  })[0];
  assert.strictEqual(restored.querySelector('textarea').value, '筆記');
  t.click('重做');
  assert.strictEqual(t.notes().length, 1);
});

test('快捷鍵：只在畫圖模式生效，焦點在輸入框時不攔截', async function () {
  var t = await open();
  t.click('筆');
  t.drag([[0, 0], [10, 10]]);
  t.key(t.d.body, 'Escape');
  var e = t.key(t.d.body, 'z', { ctrlKey: true });
  assert.ok(!e.defaultPrevented, '互動模式不攔截');
  assert.strictEqual((await t.visible()).length, 1);

  t.click('切換模式');
  e = t.key(t.d.body, 'z', { ctrlKey: true });
  assert.ok(e.defaultPrevented);
  assert.strictEqual((await t.visible()).length, 0);
  t.key(t.d.body, 'Z', { metaKey: true, shiftKey: true });
  assert.strictEqual((await t.visible()).length, 1);
  t.key(t.d.body, 'z', { ctrlKey: true });
  t.key(t.d.body, 'y', { ctrlKey: true });
  assert.strictEqual((await t.visible()).length, 1);

  t.click('便利貼');
  t.drag([[50, 50]]);
  var ta = t.notes()[0].querySelector('textarea');
  e = t.key(ta, 'z', { ctrlKey: true });
  assert.ok(!e.defaultPrevented, '便利貼裡的 Ctrl+Z 交給輸入框自己處理');
  assert.strictEqual(t.notes().length, 1);
  t.key(ta, 'Escape');
  assert.strictEqual(t.canvas().style.pointerEvents, 'auto', '便利貼裡按 Esc 不切模式');
});

test('便利貼的按鍵不會傳到頁面', async function () {
  var t = await open();
  var got = [];
  t.d.addEventListener('keydown', function (e) {
    got.push(e.key);
  });
  t.click('便利貼');
  t.drag([[50, 50]]);
  t.key(t.notes()[0].querySelector('textarea'), 'k');
  t.key(t.d.body, 's');
  assert.deepStrictEqual(got, ['s']);
});

test('工具列：拖到邊緣吸附，左右兩邊改直向', async function () {
  var t = await open();
  var bar = t.bar();
  var rect = { left: 400, top: 700, width: 300, height: 48 };
  bar.getBoundingClientRect = function () {
    return rect;
  };
  var grip = bar.querySelector('[aria-label="移動工具列"]');
  // 以滑鼠放開的位置決定吸附的邊
  function dragTo(x, y) {
    t.mouse(grip, 'mousedown', rect.left + 5, rect.top + 5);
    t.mouse(t.d, 'mousemove', x, y);
    t.mouse(t.d, 'mouseup', x, y);
  }
  assert.strictEqual(bar.style.flexDirection, 'row');
  assert.strictEqual(bar.style.bottom, '16px');
  assert.strictEqual(bar.style.width, 'max-content', '橫向用 max-content，不會只剩半個視窗寬而提早折行');
  assert.strictEqual(bar.style.margin, '0px auto');

  dragTo(20, 300); // 橫向工具列很寬，但放開處靠左 → 吸左邊
  assert.strictEqual(bar.style.left, '16px');
  assert.strictEqual(bar.style.right, 'auto');
  assert.strictEqual(bar.style.top, '0px');
  assert.strictEqual(bar.style.bottom, '0px');
  assert.strictEqual(bar.style.margin, 'auto 0px');
  assert.strictEqual(bar.style.flexDirection, 'column');
  assert.strictEqual(bar.style.overflowY, 'auto');
  assert.strictEqual(bar.style.justifyContent, 'flex-start', '直向捲動時上方不會被裁掉');

  dragTo(1000, 100);
  assert.strictEqual(bar.style.right, '16px');
  assert.strictEqual(bar.style.left, 'auto');
  assert.strictEqual(bar.style.flexDirection, 'column');

  dragTo(400, 10);
  assert.strictEqual(bar.style.top, '16px');
  assert.strictEqual(bar.style.bottom, 'auto');
  assert.strictEqual(bar.style.flexDirection, 'row');
  assert.strictEqual(bar.style.getPropertyPriority('top'), 'important');
  assert.strictEqual(t.d.getElementById('__bmt_wb_bubble__').style.top, '16px', '最小化圓鈕跟著同一邊');
});

test('工具列：最小化與展開', async function () {
  var t = await open();
  var bubble = t.d.getElementById('__bmt_wb_bubble__');
  assert.strictEqual(bubble.style.display, 'none');
  t.click('最小化');
  assert.strictEqual(t.bar().style.display, 'none');
  assert.strictEqual(bubble.style.display, 'flex');
  bubble.click();
  assert.strictEqual(t.bar().style.display, 'flex');
  assert.strictEqual(bubble.style.display, 'none');
});

test('工具列按鈕使用 SVG 圖示與 title 提示；樣式加 !important', async function () {
  var t = await open();
  var b = t.btn('橡皮擦');
  assert.ok(b.querySelector('svg path'));
  assert.strictEqual(b.querySelector('svg').style.color, 'inherit', 'all:initial 後要讓圖示繼承按鈕的白色');
  assert.strictEqual(b.style.getPropertyPriority('background'), 'important');
  assert.ok(b.title);
  assert.strictEqual(b.textContent, '');
});

test('關閉：空白直接關；有內容時取消不關、確認才關', async function () {
  var t = await open();
  var asked = 0;
  var answer = false;
  t.win.confirm = function () {
    asked++;
    return answer;
  };
  t.click('筆');
  t.drag([[0, 0], [10, 10]]);
  t.click('關閉白板');
  assert.strictEqual(asked, 1);
  assert.ok(t.bar(), '取消時不關閉');
  answer = true;
  t.click('關閉白板');
  assert.strictEqual(t.bar(), null);
  assert.strictEqual(t.canvas(), null);
  assert.strictEqual(t.d.getElementById('__bmt_wb_notes__'), null);
  assert.strictEqual(t.d.getElementById('__bmt_wb_bubble__'), null);
  assert.strictEqual(t.toast(), '已關閉白板');

  // 事件監聽已移除：快捷鍵不再攔截
  var e = t.key(t.d.body, 'z', { ctrlKey: true });
  assert.ok(!e.defaultPrevented);

  // 可以重新開啟，且為全新狀態；空白時直接關
  t.run();
  assert.ok(t.bar());
  assert.deepStrictEqual(await t.visible(), []);
  t.click('關閉白板');
  assert.strictEqual(asked, 2);
  assert.strictEqual(t.bar(), null);
});

test('拖曳便利貼途中關閉白板，拖曳監聽會一起移除', async function () {
  var t = await open();
  t.win.confirm = function () {
    return true;
  };
  t.click('便利貼');
  t.drag([[100, 100]]);
  var n = t.notes()[0];
  t.mouse(n.querySelector('.__bmt_wb_note_hdr__'), 'mousedown', 100, 100);
  t.click('關閉白板');
  t.mouse(t.d, 'mousemove', 300, 300);
  assert.strictEqual(n.style.left, '100px');
});

test('在便利貼輸入後到畫布畫圖，Ctrl+Z 復原的是筆畫', async function () {
  var t = await open();
  t.click('便利貼');
  t.drag([[300, 300]]);
  var ta = t.notes()[0].querySelector('textarea');
  assert.strictEqual(t.d.activeElement, ta);
  t.click('筆');
  t.drag([[0, 0], [10, 10]]);
  assert.notStrictEqual(t.d.activeElement, ta, '畫布 mousedown 會移開便利貼的焦點');
  var e = t.key(t.d.activeElement || t.d.body, 'z', { ctrlKey: true });
  assert.ok(e.defaultPrevented);
  assert.deepStrictEqual(await t.visible(), []);
  assert.strictEqual(t.notes().length, 1);
});

test('Esc 只在切換模式時攔下', async function () {
  var t = await open();
  var e = t.key(t.d.body, 'Escape');
  assert.ok(!e.defaultPrevented, '互動模式下 Esc 交給頁面');
  t.click('筆');
  e = t.key(t.d.body, 'Escape');
  assert.ok(e.defaultPrevented);
});

test('視窗 resize 時重新量畫布尺寸', async function () {
  var t = await open();
  Object.defineProperty(t.win, 'innerWidth', { value: 500, configurable: true });
  t.win.dispatchEvent(new t.win.Event('resize'));
  assert.strictEqual(t.canvas().width, 500);
  assert.strictEqual(t.canvas().style.width, '500px');
});

test('一次擦掉多條後逐步復原，順序正確', async function () {
  var t = await open();
  t.click('筆');
  t.drag([[0, 0], [0, 100]]);
  t.drag([[50, 0], [50, 100]]);
  t.drag([[100, 0], [100, 100]]);
  t.click('橡皮擦');
  t.drag([[-10, 50], [110, 50]]);
  assert.deepStrictEqual(await t.visible(), []);
  t.click('復原');
  t.click('復原');
  t.click('復原');
  assert.deepStrictEqual(await t.visible(), [
    [[0, 0], [0, 100]],
    [[50, 0], [50, 100]],
    [[100, 0], [100, 100]]
  ]);
});

test('畫到一半關閉白板，不留殘筆也不再回應滑鼠', async function () {
  var t = await open();
  t.win.confirm = function () {
    return true;
  };
  t.click('筆');
  t.drag([[0, 0], [10, 10]]);
  t.mouse(t.canvas(), 'mousedown', 20, 20);
  t.mouse(t.d, 'mousemove', 30, 30);
  t.click('關閉白板');
  var n = t.ctx.ops.length;
  t.mouse(t.d, 'mousemove', 40, 40);
  t.mouse(t.d, 'mouseup', 40, 40);
  assert.strictEqual(t.ctx.ops.length, n);
  t.run();
  assert.deepStrictEqual(await t.visible(), []);
});

test('白板元件上的點擊不傳到頁面', async function () {
  var t = await open();
  var got = [];
  t.d.addEventListener('mousedown', function () {
    got.push('mousedown');
  });
  t.d.addEventListener('click', function () {
    got.push('click');
  });
  t.click('筆');
  t.mouse(t.btn('橡皮擦'), 'mousedown', 0, 0);
  assert.deepStrictEqual(got, []);
});
