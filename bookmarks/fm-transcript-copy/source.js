/**
 * @name    FM 逐字稿複製
 * @version 1.0.0
 * @desc    Frontend Masters 課程頁：把 Transcripts 面板的逐字稿整理成純文字並複製
 *
 * 建置：npm run build -- fm-transcript-copy
 */
(function () {
  /* @include toast */
  /* @include clipboard */

  // class 為主、data 屬性為備援；兩者重疊時 querySelectorAll 不會重複，且維持文件順序
  var lines = document.querySelectorAll(
    '.transcripts a.line, [data-transcript-content] a.line'
  );

  // 行內的換行、連續空白折疊成一個空格；行與行之間以空格連接
  var parts = [];
  for (var i = 0; i < lines.length; i++) {
    var t = lines[i].textContent.replace(/\s+/g, ' ').replace(/^ | $/g, '');
    if (t) parts.push(t);
  }

  if (!parts.length) {
    toast('找不到逐字稿內容，請先開啟 Transcripts', 'error');
    return;
  }

  copyText(parts.join(' '), function (ok) {
    toast(ok ? '已複製' : '複製失敗', ok ? 'success' : 'error');
  });
})();
