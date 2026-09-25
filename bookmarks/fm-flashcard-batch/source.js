/**
 * @name    FM 學習卡批次複製
 * @version 1.0.0
 * @desc    Frontend Masters Learning Mode：從第一張開始逐張擷取 Flashcard，合併成 Markdown 後一次複製
 *
 * 建置：npm run build -- fm-flashcard-batch
 */
(function () {
  /* @include toast */
  /* @include lm-md */
  /* @include copy-prompt */

  var d = document;
  var root = d.documentElement;
  var MAX = 100; // 安全上限：回到第一張、擷取各最多 100 次
  var WAIT_MS = 3000; // 點擊後等待卡片更新的上限
  var POLL_MS = 100;
  var FLAG = 'data-__bmt_fm_batch'; // 執行中標記（時間戳，每一步更新）

  function q(sel) {
    return d.querySelector(sel);
  }

  /** 可點擊的按鈕；不存在或 disabled 時回傳 null。 */
  function button(sel) {
    var b = q(sel);
    return b && !b.disabled ? b : null;
  }

  /** 目前卡片的快照：正反面的節點與文字。 */
  function snap() {
    var f = q('.LM-Flashcard-front .LM-Flashcard-text');
    var b = q('.LM-Flashcard-back .LM-Flashcard-text');
    return { f: f, b: b, ft: f ? f.textContent : '', bt: b ? b.textContent : '' };
  }

  function sideChanged(a, b, side) {
    return a[side] !== b[side] || a[side + 't'] !== b[side + 't'];
  }

  function same(a, b) {
    return !sideChanged(a, b, 'f') && !sideChanged(a, b, 'b');
  }

  /**
   * 點擊按鈕，等待換成另一張卡：正面與背面（節點或文字）都已改變，且連續兩次檢查結果相同，
   * 避免擷取到「新正面 + 舊背面」。逾時時只要有任一面改變就視為已換卡
   * （例如相鄰兩張的背面剛好相同且節點被重用）。
   * cb(true) = 已換卡；cb(false) = 逾時仍未變化。
   */
  function advance(btn, cb) {
    var before = snap();
    var last = null;
    var t0 = Date.now(); // 以實際經過時間計算逾時（背景分頁的計時器可能被延遲）
    btn.click();
    (function poll() {
      beat();
      var cur = snap();
      var both = sideChanged(cur, before, 'f') && sideChanged(cur, before, 'b');
      if (both && last && same(cur, last)) return cb(true);
      if (Date.now() - t0 >= WAIT_MS) return cb(!same(cur, before));
      last = cur;
      setTimeout(poll, POLL_MS);
    })();
  }

  function beat() {
    root.setAttribute(FLAG, Date.now());
  }

  function stop() {
    root.removeAttribute(FLAG);
  }

  if (!q('.LM-Flashcard')) {
    toast('找不到 flashcard 內容', 'error');
    return;
  }
  if (Date.now() - (+root.getAttribute(FLAG) || 0) < WAIT_MS + 1000) {
    toast('批次複製執行中', 'info', 0); // 不自動消失：下一次進度更新會覆蓋它
    return;
  }
  removeCopyPrompt();

  var steps = 0;
  var cards = [];
  var skipped = 0;

  // 1. 回到第一張：一直點 Previous，直到它不存在或 disabled
  function rewind() {
    beat();
    var prev = button('.LM-Content-Actions-prev-btn');
    if (!prev) return collect();
    if (++steps > MAX) return fail();
    toast('回到第一張…', 'info', 0);
    advance(prev, function (ok) {
      if (!ok) return fail();
      if (q('.LM-Flashcard')) return rewind();
      // Previous 離開了 flashcard（進到前一個學習步驟）：點一次 Next 回到第一張卡
      var next = button('.LM-Content-Actions-next-btn');
      if (!next) return fail();
      advance(next, function (ok2) {
        if (ok2 && q('.LM-Flashcard')) collect();
        else fail();
      });
    });
  }

  function fail() {
    stop();
    toast('無法回到第一張', 'error');
  }

  // 2. 逐張擷取，直到 Next 不存在或 disabled
  function collect() {
    beat();
    // Next 離開了 flashcard（進到下一個學習步驟）：視為結束
    if (!q('.LM-Flashcard')) return finish('');
    toast('複製中… 第 ' + (cards.length + skipped + 1) + ' 張', 'info', 0);
    var s = snap();
    var front = s.f && toMd(s.f);
    var back = s.b && toMd(s.b);
    if (front && back) cards.push('### ' + front + '\n\n' + back);
    else skipped++;

    if (cards.length + skipped >= MAX) return finish('（達上限中止）');
    var next = button('.LM-Content-Actions-next-btn');
    if (!next) return finish('');
    advance(next, function (ok) {
      if (ok) collect();
      else finish('（逾時中止）');
    });
  }

  // 3. 合併並複製；複製失敗時顯示「點此複製」按鈕
  function finish(note) {
    stop();
    if (!cards.length) {
      toast('找不到 flashcard 內容', 'error');
      return;
    }
    copyOrPrompt(
      cards.join('\n\n'),
      '已複製 ' + cards.length + ' 題' + (skipped ? '，略過 ' + skipped + ' 張' : '') + note,
      '已擷取 ' + cards.length + ' 題，點此複製'
    );
  }

  rewind();
})();
