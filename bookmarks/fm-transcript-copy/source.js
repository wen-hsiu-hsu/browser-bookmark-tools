/**
 * @name    FM 逐字稿複製
 * @version 1.1.0
 * @desc    Frontend Masters 課程頁：把 Transcripts 面板的逐字稿整理成純文字並複製
 *
 * 建置：npm run build -- fm-transcript-copy
 */
(function () {
  /* @include toast */
  /* @include clipboard */

  var d = document;
  var WAIT_MS = 3000; // 上限不能太長：Firefox/Safari 的剪貼簿需在使用者點擊後短時間內寫入
  var POLL_MS = 100;

  /** 抓取並整理逐字稿；找不到回傳空字串。 */
  function grab() {
    // class 為主、data 屬性為備援；兩者重疊時 querySelectorAll 不會重複，且維持文件順序
    var lines = d.querySelectorAll('.transcripts a.line, [data-transcript-content] a.line');
    // 行內的換行、連續空白折疊成一個空格；行與行之間以空格連接
    var parts = [];
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].textContent.replace(/\s+/g, ' ').replace(/^ | $/g, '');
      if (t) parts.push(t);
    }
    return parts.join(' ');
  }

  function copy(text) {
    copyText(text, function (ok) {
      toast(ok ? '已複製' : '複製失敗', ok ? 'success' : 'error');
    });
  }

  var text = grab();
  if (text) return copy(text);

  // 面板已開啟（只是還沒載入）或上一次執行仍在等待中時不點按鈕：按鈕是開關式，再點會關掉面板
  var root = d.documentElement;
  var FLAG = 'data-__bmt_fm_opening';
  var busy = Date.now() - (+root.getAttribute(FLAG) || 0) < WAIT_MS;
  if (!busy && !d.querySelector('.FMPlayer2-Transcripts.active')) {
    var btn = d.querySelector('.FMPlayer2-RibbonButton[data-fmp-tooltip^="Transcripts"]');
    if (!btn) {
      toast('找不到逐字稿內容，請先開啟 Transcripts', 'error');
      return;
    }
    btn.click();
  }
  root.setAttribute(FLAG, Date.now());
  toast('正在開啟 Transcripts…', 'info', 0);

  // 輪詢到內容「連續兩次相同」才複製，避免面板分批渲染時只抓到前幾行
  var waited = 0;
  var last = '';
  (function poll() {
    var t = grab();
    var timeout = (waited += POLL_MS) > WAIT_MS;
    if (t && (t === last || timeout)) {
      root.removeAttribute(FLAG);
      return copy(t);
    }
    if (timeout) {
      root.removeAttribute(FLAG);
      toast('已開啟 Transcripts 但抓不到逐字稿，請稍後再試', 'error');
      return;
    }
    last = t;
    setTimeout(poll, POLL_MS);
  })();
})();
