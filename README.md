# browser-bookmark-tools

瀏覽器書籤（bookmarklet）工具集。點擊書籤即可在目前頁面執行一段 JS。

## 書籤清單

| 書籤 | 目前版本 | 說明 |
|---|---|---|
| [FM 逐字稿複製](bookmarks/fm-transcript-copy/) | v1.1.0 | Frontend Masters 課程頁：把逐字稿整理成純文字並複製（面板沒開時會自動打開） |
| [LCS Podcast 專注模式](bookmarks/lcs-podcast-focus/) | v1.0.0 | LearnCraft Spanish podcast 頁：移除導覽列、播放器貼齊頂端 |

## 安裝書籤

1. 進入 `bookmarks/<書籤>/` 資料夾，打開 `bookmarklet.txt`，複製整行內容（以 `javascript:` 開頭）。
2. 在瀏覽器新增書籤：
   - **名稱**：填入該書籤 README 建議的名稱，裡面包含版本號，例如 `書籤名稱 v1.0.0`。
   - **網址**：貼上剛剛複製的內容。
3. 更新書籤時，比對書籤名稱上的版本和 README 的「版本紀錄」，再重新複製貼上。

> 少數網站或瀏覽器政策（例如 CSP、企業管理政策）可能阻擋書籤執行，這類情況書籤無法運作。

## 開發

需要 Node.js 18 以上版本。

```
npm install
npm test
npm run build -- <書籤資料夾名>
```

開發規範與 workflow 請見 [CLAUDE.md](CLAUDE.md)，共用元件（toast、clipboard）規格請見 [shared/README.md](shared/README.md)。
