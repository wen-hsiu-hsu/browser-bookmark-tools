# FM 逐字稿複製

> 建議書籤名稱：`FM 逐字稿複製 v1.0.0`

## 功能

- 抓取 Frontend Masters 課程頁 Transcripts 面板中的逐字稿，每一行是一個 `a.line`。
- 每一行內部的換行和連續空白縮成一個空格，並去掉頭尾空白；空白行略過。
- 各行之間用**一個空格**連接成單一段落。`.line.break` 看起來是新段落的開頭，但不另外分段。
- 把結果複製到剪貼簿（共用元件 `copyText()`：先試 clipboard API，失敗再 fallback 到 `execCommand`）。

## 目的

把課程逐字稿整理成純文字，方便貼到筆記、翻譯工具或 AI 對話中。

## 使用情境

1. 在 Frontend Masters 課程影片頁打開 Transcripts 面板。
2. 點擊書籤，看到 `已複製` 的提示後，到其他頁面貼上。

## Selector

| 用途 | Selector | 說明 |
|---|---|---|
| 逐字稿行 | `.transcripts a.line, [data-transcript-content] a.line` | 以 class 為主，data 屬性為備援。網站只改掉其中一個名稱時仍抓得到；兩者同時存在時不會重複，並維持頁面上的順序。 |

## 回饋訊息

| 訊息 | 類型 | 觸發時機 |
|---|---|---|
| `已複製` | success | 複製成功 |
| `找不到逐字稿內容，請先開啟 Transcripts` | error | 找不到任何行，或所有行都是空的 |
| `複製失敗` | error | clipboard API 與 fallback 都失敗 |

## 限制

- 只支援 Frontend Masters 的 FMPlayer2 頁面結構。網站改版後如果 class 和 data 屬性都變了，就會顯示「找不到逐字稿內容」。
- 如果 Transcripts 面板沒打開時逐字稿不在 DOM 中，需要先打開面板。
- 如果逐字稿日後被放進 iframe 或 Shadow DOM，書籤會抓不到。
- 不保留段落結構和時間戳。

## 延伸開發

要做類似的「抓取 → 整理 → 複製」書籤時，可以複製這個資料夾開始修改：通常只要改 selector 和文字整理規則，toast 和複製流程直接沿用。

## 安裝

1. 複製同資料夾 `bookmarklet.txt` 的整行內容（以 `javascript:` 開頭）。
2. 瀏覽器新增書籤，名稱填 `FM 逐字稿複製 v1.0.0`，網址貼上剛剛複製的內容。

> Firefox 在網址欄直接貼上 `javascript:` 時會把前綴移除。請在「新增書籤」對話框的網址欄貼上。

## 版本紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| v1.0.0 | 2026-09-25 | 從 Claude Projects 移轉而來，取代舊版（沒有版本號）。改動：行之間改用空格連接（舊版直接相連，會出現 `alot`、`code.I think` 這類黏字）；新增 `[data-transcript-content]` 備援 selector；找不到逐字稿時提示先開啟 Transcripts；移除外層 try/catch；toast 改用新版共用元件。 |
