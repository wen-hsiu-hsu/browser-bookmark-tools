/**
 * @name    書籤名稱
 * @version 1.0.0
 * @desc    一句話說明這個書籤做什麼
 *
 * 可讀原始碼（ES5）。共用元件以 @include 註解引入，建置時展開。
 * 建置：npm run build -- <資料夾名>
 */
(function () {
  /* @include toast */
  /* @include clipboard */

  var text = document.title;
  if (!text) {
    toast('找不到標題', 'error');
    return;
  }
  copyText(text, function (ok) {
    toast(ok ? '已複製' : '複製失敗', ok ? 'success' : 'error');
  });
})();
