'use strict';

var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var JSDOM = require('jsdom').JSDOM;
var build = require('../scripts/build.js');

var SRC = fs.readFileSync(path.join(__dirname, '../bookmarks/lcs-tools/source.js'), 'utf8');
var CODE;
var ID = '__bmt_lcs_tools__';

var NAV = '<div class="v2-section sticky-nav">nav</div>';
var CONTROLS =
  '<div class="fbx-controls-primary">' +
  '<button aria-label="Change speed" class="fbx-button fbx-speed-button"><span>1x</span></button>' +
  '<button class="fbx-button fbx-time-shift-button fbx-backward fbx-has-icon fbx-has-label">' +
  '<span class="fbx-icon"><svg viewBox="0 0 7 7"><path d="M0 0"></path></svg></span><span>15s</span></button>' +
  '<button class="fbx-button fbx-time-shift-button fbx-forward fbx-has-icon fbx-has-label">' +
  '<span>30s</span><span class="fbx-icon"><svg viewBox="0 0 7 7"><path d="M0 0"></path></svg></span></button>' +
  '<div class="fbx-volume-control"></div></div>';
var PLAYER = '<div id="podcast_player_container" style="top:80px"><audio></audio>' + CONTROLS + '</div>';
var WORDS = '<p><strong><em>hola</em></strong> hello</p><p><a href="#x"><strong><em style="filter:grayscale(1)">adiós</em></strong></a></p>';

// MutationObserver 的檢查以 100ms 合併，等它跑完
function flush() {
  return new Promise(function (r) { setTimeout(r, 150); });
}

async function setup(html) {
  if (!CODE) CODE = decodeURIComponent((await build.toBookmarklet(SRC)).slice('javascript:'.length));
  var win = new JSDOM('<!doctype html><body>' + html + '<input id="inp"></body>', {
    runScripts: 'outside-only', url: 'https://www.learncraftspanish.com/podcast/x'
  }).window;
  var d = win.document;
  var audio = d.querySelector('audio');
  if (audio) {
    var t = 0;
    Object.defineProperty(audio, 'currentTime', { get: function () { return t; }, set: function (v) { t = v; } });
    Object.defineProperty(audio, 'duration', { configurable: true, value: 100 });
  }
  return {
    win: win, d: d, audio: audio,
    run: function () { win.eval(CODE); },
    toast: function () { var el = d.getElementById('__bmt_toast__'); return el && el.textContent; },
    toastType: function () { return d.getElementById('__bmt_toast__').getAttribute('data-__bmt_type'); },
    btn: function (id) { return d.querySelector('#' + ID + ' [data-__bmt_cmd="' + id + '"]'); },
    labels: function () {
      var bs = d.querySelectorAll('.fbx-controls-primary > button');
      return Array.prototype.map.call(bs, function (b) { return b.textContent; });
    },
    key: function (code) {
      win.dispatchEvent(new win.KeyboardEvent('keydown', { code: code, altKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    },
    click: function (el) {
      var e = new win.MouseEvent('click', { bubbles: true, cancelable: true });
      el.dispatchEvent(e);
      return e;
    }
  };
}

test('開啟時：建立面板、套用專注模式、模糊、插入 ±5s 按鈕', async function () {
  var r = await setup(NAV + PLAYER + WORDS);
  r.run();
  assert.ok(r.d.getElementById(ID));
  assert.strictEqual(r.d.querySelectorAll('.sticky-nav').length, 0);
  var p = r.d.getElementById('podcast_player_container');
  assert.strictEqual(p.style.top, '0px');
  assert.strictEqual(p.style.getPropertyPriority('top'), 'important');
  var ems = r.d.querySelectorAll('strong em');
  assert.strictEqual(ems[0].style.filter, 'blur(10px)');
  assert.strictEqual(ems[0].getAttribute('data-__bmt_blur'), '1');
  assert.deepStrictEqual(r.labels(), ['1x', '5s', '15s', '30s', '5s']);
  assert.strictEqual(r.toast(), '移除 sticky-nav ×1・播放器 top → 0px・模糊 2 處・已加入 ±5s 按鈕');
  assert.strictEqual(r.toastType(), 'success');
});

test('±5s 按鈕沿用原生 class、圖示，並加上 __bmt_ 標記與 aria-label', async function () {
  var r = await setup(PLAYER);
  r.run();
  var seeks = r.d.querySelectorAll('.__bmt_lcs_seek');
  assert.strictEqual(seeks.length, 2);
  assert.ok(seeks[0].classList.contains('fbx-backward'));
  assert.ok(seeks[1].classList.contains('fbx-forward'));
  assert.ok(seeks[0].querySelector('.fbx-icon svg'));
  assert.strictEqual(seeks[0].getAttribute('aria-label'), '倒轉 5 秒');
  assert.strictEqual(seeks[1].getAttribute('aria-label'), '快進 5 秒');
});

test('播放器 ±5s 按鈕：移動位置並限制在 0～duration', async function () {
  var r = await setup(PLAYER);
  r.run();
  var seeks = r.d.querySelectorAll('.__bmt_lcs_seek');
  r.audio.currentTime = 3;
  r.click(seeks[0]);
  assert.strictEqual(r.audio.currentTime, 0);
  r.click(seeks[1]);
  assert.strictEqual(r.audio.currentTime, 5);
  r.audio.currentTime = 98;
  r.click(seeks[1]);
  assert.strictEqual(r.audio.currentTime, 100);
});

test('duration 未知（NaN）時只限制下限', async function () {
  var r = await setup(PLAYER);
  Object.defineProperty(r.audio, 'duration', { value: NaN });
  r.run();
  r.audio.currentTime = 200;
  r.btn('fwd').click();
  assert.strictEqual(r.audio.currentTime, 205);
});

test('面板指令 ⌥⇧3／⌥⇧4：倒轉／快進並以 toast 顯示新位置', async function () {
  var r = await setup(PLAYER);
  r.run();
  r.audio.currentTime = 70;
  r.key('Digit4');
  assert.strictEqual(r.audio.currentTime, 75);
  assert.strictEqual(r.toast(), '+5s → 01:15');
  r.key('Digit3');
  r.key('Digit3');
  assert.strictEqual(r.audio.currentTime, 65);
  assert.strictEqual(r.toast(), '−5s → 01:05');
});

test('找不到 audio → error', async function () {
  var r = await setup('<p>x</p>');
  r.run();
  r.btn('back').click();
  assert.strictEqual(r.toast(), '找不到音訊');
  assert.strictEqual(r.toastType(), 'error');
});

test('點模糊字：顯示並還原原本的 inline filter；再點一下重新模糊', async function () {
  var r = await setup(WORDS);
  r.run();
  var em = r.d.querySelectorAll('strong em')[1];
  r.click(em);
  assert.strictEqual(em.style.filter, 'grayscale(1)');
  assert.strictEqual(em.getAttribute('data-__bmt_blur'), '0');
  assert.strictEqual(em.style.cursor, 'pointer');
  r.click(em);
  assert.strictEqual(em.style.filter, 'blur(10px)');
  var first = r.d.querySelector('strong em');
  r.click(first);
  assert.strictEqual(first.style.filter, '');
});

test('連結內的模糊字：點擊不跳轉；未處理的元素不攔截', async function () {
  var r = await setup(WORDS + '<a id="other" href="#y">y</a>');
  r.run();
  assert.ok(r.click(r.d.querySelectorAll('strong em')[1]).defaultPrevented);
  assert.ok(!r.click(r.d.getElementById('other')).defaultPrevented);
});

test('⌥⇧2 重新模糊：已顯示的字和新出現的字都模糊', async function () {
  var r = await setup(WORDS);
  r.run();
  var em = r.d.querySelector('strong em');
  r.click(em);
  var p = r.d.createElement('p');
  p.innerHTML = '<strong><em>nuevo</em></strong>';
  r.d.body.appendChild(p);
  r.key('Digit2');
  assert.strictEqual(em.style.filter, 'blur(10px)');
  assert.strictEqual(p.querySelector('em').style.filter, 'blur(10px)');
  assert.strictEqual(r.toast(), '已模糊 3 處');
  // 新出現的字也能點擊切換
  r.click(p.querySelector('em'));
  assert.strictEqual(p.querySelector('em').style.filter, '');
});

test('⌥⇧2 找不到 strong em → error', async function () {
  var r = await setup('<p>x</p>');
  r.run();
  r.key('Digit2');
  assert.strictEqual(r.toast(), '找不到 strong em');
  assert.strictEqual(r.toastType(), 'error');
});

test('⌥⇧1 專注模式：和原書籤相同的訊息', async function () {
  var r = await setup(PLAYER);
  r.run();
  r.d.body.insertAdjacentHTML('afterbegin', NAV);
  r.key('Digit1');
  assert.strictEqual(r.toast(), '移除 sticky-nav ×1・播放器 top → 0px');
  r.d.getElementById('podcast_player_container').remove();
  r.key('Digit1');
  assert.strictEqual(r.toast(), '找不到目標元素');
  assert.strictEqual(r.toastType(), 'error');
});

test('什麼都找不到：開啟 toast 為 error 並列出缺少項目', async function () {
  var r = await setup('<p>x</p>');
  r.run();
  assert.strictEqual(r.toast(), '找不到導覽列與播放器・找不到 strong em・找不到播放器按鈕');
  assert.strictEqual(r.toastType(), 'error');
});

test('播放器重繪後自動補回 ±5s 按鈕，且不重複', async function () {
  var r = await setup(PLAYER);
  r.run();
  var c = r.d.querySelector('.fbx-controls-primary');
  var parent = c.parentNode;
  parent.removeChild(c);
  parent.insertAdjacentHTML('beforeend', CONTROLS);
  await flush();
  assert.deepStrictEqual(r.labels(), ['1x', '5s', '15s', '30s', '5s']);
  await flush();
  assert.strictEqual(r.d.querySelectorAll('.__bmt_lcs_seek').length, 2);
});

test('播放器晚於書籤出現：出現後補上按鈕', async function () {
  var r = await setup('<div id="podcast_player_container"></div>');
  r.run();
  assert.strictEqual(r.toast().indexOf('找不到播放器按鈕') >= 0, true);
  r.d.getElementById('podcast_player_container').insertAdjacentHTML('beforeend', CONTROLS);
  await flush();
  assert.deepStrictEqual(r.labels(), ['1x', '5s', '15s', '30s', '5s']);
});

test('關閉面板：移除 ±5s 按鈕並停止監看；模糊字仍可點擊切換', async function () {
  var r = await setup(PLAYER + WORDS);
  r.run();
  r.d.querySelector('#' + ID + ' [aria-label="關閉"]').click();
  await flush();
  assert.strictEqual(r.d.getElementById(ID), null);
  assert.strictEqual(r.d.querySelectorAll('.__bmt_lcs_seek').length, 0);
  // 之後播放器重繪也不再補回
  var c = r.d.querySelector('.fbx-controls-primary');
  c.parentNode.insertAdjacentHTML('beforeend', CONTROLS);
  c.remove();
  await flush();
  assert.strictEqual(r.d.querySelectorAll('.__bmt_lcs_seek').length, 0);
  var em = r.d.querySelector('strong em');
  r.click(em);
  assert.strictEqual(em.style.filter, '');
});

test('重複點書籤（同版本）：不建立第二個面板、不重複插按鈕、不重新模糊', async function () {
  var r = await setup(PLAYER + WORDS);
  r.run();
  var em = r.d.querySelector('strong em');
  r.click(em); // 顯示
  r.run();
  await flush();
  assert.strictEqual(r.d.querySelectorAll('#' + ID).length, 1);
  assert.strictEqual(r.d.querySelectorAll('.__bmt_lcs_seek').length, 2);
  assert.strictEqual(em.style.filter, '', '同版本再點只還原面板，不重新模糊');
});

test('舊版面板閒置時換成新版：按鈕不會被舊版清理刪掉；點擊只切換一次且用新版的切換函式', async function () {
  var r = await setup(PLAYER + WORDS);
  r.run();
  r.d.getElementById(ID).setAttribute('data-__bmt_ver', '0.9.0');
  var oldToggle = r.d.documentElement.__bmtLcsToggle;
  r.run();
  await flush();
  assert.strictEqual(r.d.getElementById(ID).getAttribute('data-__bmt_ver'), '1.0.0');
  assert.deepStrictEqual(r.labels(), ['1x', '5s', '15s', '30s', '5s']);
  assert.notStrictEqual(r.d.documentElement.__bmtLcsToggle, oldToggle);
  var em = r.d.querySelector('strong em');
  r.click(em);
  assert.strictEqual(em.style.filter, '', '點一下只切換一次');
});

test('舊版面板執行中時不替換', async function () {
  var r = await setup(PLAYER);
  r.run();
  var panel = r.d.getElementById(ID);
  panel.setAttribute('data-__bmt_ver', '0.9.0');
  panel.__bmtPanel.busy = function () { return true; };
  r.run();
  assert.strictEqual(r.d.getElementById(ID), panel);
  assert.strictEqual(r.toast(), '舊版面板執行中，請稍後再點一次');
});

test('關閉面板後再點書籤：重建面板，按鈕不重複', async function () {
  var r = await setup(PLAYER);
  r.run();
  r.d.querySelector('#' + ID + ' [aria-label="關閉"]').click();
  r.run();
  await flush();
  assert.ok(r.d.getElementById(ID));
  assert.deepStrictEqual(r.labels(), ['1x', '5s', '15s', '30s', '5s']);
});

test('複製原生鈕時去掉 id、title、on* 屬性與停用狀態', async function () {
  var r = await setup('<div id="podcast_player_container"><audio></audio><div class="fbx-controls-primary">' +
    '<button id="b15" title="Rewind 15" onclick="window.__hit=(window.__hit||0)+1" disabled aria-disabled="true" ' +
    'class="fbx-button fbx-time-shift-button fbx-backward fbx-is-disabled"><span>15s</span></button>' +
    '<button class="fbx-time-shift-button fbx-forward">30s</button></div></div>');
  r.run();
  var b = r.d.querySelector('.__bmt_lcs_seek.fbx-backward');
  ['id', 'title', 'onclick', 'disabled', 'aria-disabled'].forEach(function (a) {
    assert.strictEqual(b.hasAttribute(a), false, a);
  });
  assert.ok(!/disabled/.test(b.className));
  assert.ok(b.classList.contains('fbx-button'));
  r.audio.currentTime = 50;
  r.click(b);
  assert.strictEqual(r.audio.currentTime, 45);
  assert.strictEqual(r.win.__hit, undefined);
  // 文字直接放在 button 內也會改成 5s
  assert.strictEqual(r.d.querySelector('.__bmt_lcs_seek.fbx-forward').textContent, '5s');
});

test('點 ±5s 時播放器的委派（capture 與 bubble）都收不到', async function () {
  var r = await setup(PLAYER);
  r.run();
  var hits = 0;
  var c = r.d.querySelector('.fbx-controls-primary');
  c.addEventListener('click', function () { hits++; }, true);
  c.addEventListener('click', function () { hits++; });
  r.d.addEventListener('click', function () { hits++; }, true);
  r.click(r.d.querySelector('.__bmt_lcs_seek'));
  assert.strictEqual(hits, 0);
  r.click(r.d.querySelector('.fbx-forward:not(.__bmt_lcs_seek)'));
  assert.strictEqual(hits, 3, '原生鈕不受影響');
});

test('播放器 ±5s 按鈕找不到 audio → error toast', async function () {
  var r = await setup(PLAYER);
  r.run();
  r.audio.remove();
  r.click(r.d.querySelector('.__bmt_lcs_seek'));
  assert.strictEqual(r.toast(), '找不到音訊');
});

test('修飾鍵點擊與選取文字時不切換模糊', async function () {
  var r = await setup(WORDS);
  r.run();
  var em = r.d.querySelectorAll('strong em')[1];
  var e = new r.win.MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true });
  em.dispatchEvent(e);
  assert.ok(!e.defaultPrevented, '⌘＋點擊照常開連結');
  assert.strictEqual(em.style.filter, 'blur(10px)');
  var range = r.d.createRange();
  range.selectNodeContents(em);
  r.win.getSelection().addRange(range);
  r.click(em);
  assert.strictEqual(em.style.filter, 'blur(10px)');
});

test('原本的 filter 帶 !important：顯示時連同優先權一起還原', async function () {
  var r = await setup('<strong><em style="filter:grayscale(1) !important">x</em></strong>');
  r.run();
  var em = r.d.querySelector('em');
  r.click(em);
  assert.strictEqual(em.style.filter, 'grayscale(1)');
  assert.strictEqual(em.style.getPropertyPriority('filter'), 'important');
});

test('框架一直移除按鈕：補回超過上限就停止並提示', async function () {
  var r = await setup(PLAYER);
  r.run();
  for (var i = 0; i < 7; i++) {
    var seeks = r.d.querySelectorAll('.__bmt_lcs_seek');
    for (var j = 0; j < seeks.length; j++) seeks[j].remove();
    await flush();
  }
  assert.strictEqual(r.toast(), '播放器按鈕一直被移除，已停止補回');
  assert.strictEqual(r.d.querySelectorAll('.__bmt_lcs_seek').length, 0);
});
