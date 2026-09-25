# LCS Podcast 專注模式

> 建議書籤名稱：`LCS Podcast 專注模式 v1.0.0`

## 功能

- 從 DOM 刪除頂部導覽列：所有同時具備 `v2-section` 和 `sticky-nav` 兩個 class 的元素。
- 把播放器貼齊畫面頂端，將 `top` 設為 `0px`（`!important`）。
  - 先用 `#podcast_player_container` 找，找不到再用 `.podcast-player-container`。
  - 播放器本來就是 `position:fixed`，書籤只改它的 `top`。

## 目的

在 [LearnCraft Spanish](https://www.learncraftspanish.com/) 的 podcast 頁面上，移除導覽列、把播放器移到最上方，讓閱讀逐字稿的可視空間最大化。

## 使用情境

1. 打開任一 podcast 頁面，例如 `https://www.learncraftspanish.com/podcast/necesitar-and-mirar`。
2. 點擊書籤。導覽列會消失，播放器移到畫面頂端。
3. 想還原時，重新整理頁面即可。

## 回饋訊息

| 訊息 | 類型 | 觸發時機 |
|---|---|---|
| `移除 sticky-nav ×N・播放器 top → 0px` | success | 導覽列和播放器都有處理 |
| `播放器 top → 0px` | success | 只找到播放器，例如再次點擊時導覽列已經被刪除 |
| `移除 sticky-nav ×N` | success | 只找到導覽列 |
| `找不到目標元素` | error | 兩者都找不到，例如不在 podcast 頁面，或網站改版了 |

## 限制

- 只針對 LearnCraft Spanish 的頁面結構。網站改版後如果 class 或 id 變了，就會顯示 `找不到目標元素`。
- 效果是單向的，沒有還原功能，要恢復請重新整理頁面。
- 如果網站之後用 JS 重新產生導覽列，或重設播放器位置（例如切換頁面但沒有重新載入），需要再點一次書籤。
- 如果導覽列有巢狀重複（一個 sticky-nav 包在另一個裡面），toast 顯示的數量可能會多算，但不影響移除結果。

## 安裝

1. 複製同資料夾 `bookmarklet.txt` 的整行內容（以 `javascript:` 開頭）。
2. 瀏覽器新增書籤，名稱填 `LCS Podcast 專注模式 v1.0.0`，網址貼上剛剛複製的內容。

## 版本紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| v1.0.0 | 2026-09-25 | 從 Claude Projects 移轉而來，取代舊版（沒有版本號）。改動：播放器 selector 以 id 為主、class 為備援；`top` 加上 `!important`；toast 改用新版共用元件。 |
