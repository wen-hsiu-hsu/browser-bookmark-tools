/**
 * @name    LCS Podcast 專注模式
 * @version 1.0.0
 * @desc    LearnCraft Spanish podcast 頁：移除頂部導覽列，播放器貼齊畫面頂端
 *
 * 建置：npm run build -- lcs-podcast-focus
 */
(function () {
  /* @include toast */

  var d = document;

  // 1. 刪除 sticky 導覽列（同時具備兩個 class 的元素）
  var navs = d.querySelectorAll('.v2-section.sticky-nav');
  for (var i = 0; i < navs.length; i++) {
    if (navs[i].parentNode) navs[i].parentNode.removeChild(navs[i]);
  }

  // 2. 播放器（原本就是 position:fixed）貼齊頂端；id 優先，class 備援
  var player =
    d.getElementById('podcast_player_container') ||
    d.querySelector('.podcast-player-container');
  if (player) player.style.setProperty('top', '0px', 'important');

  // 3. 回饋
  if (!navs.length && !player) {
    toast('找不到目標元素', 'error');
    return;
  }
  var parts = [];
  if (navs.length) parts.push('移除 sticky-nav ×' + navs.length);
  if (player) parts.push('播放器 top → 0px');
  toast(parts.join('・'), 'success');
})();
