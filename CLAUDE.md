# 專案：瀏覽器書籤工具集

開發瀏覽器書籤（bookmarklet），點擊後在目前頁面執行一段 JS。既有書籤會陸續從 Claude Projects 移轉過來。

## Workflow（每個功能／每一輪都照這個順序）

1. **釐清需求**：先確認需求是否明確，有模糊地帶就提問，**一次只問一題**，盡量給選項。以下項目要事先確認：
   - selector 行為
   - 邊界情況：內容缺漏、按鈕 disabled、重複點擊
   - 終止條件
2. **規劃做法**：把規劃提給使用者，確認後才能實作。
3. **實作**：撰寫可讀的 `source.js`，並用 jsdom 補上測試。
4. **Code review**：實作完成後，用 subagent 做 code review，並修正問題。
5. **更新文件**：包括書籤的 `README.md`（版本紀錄）、根目錄 `README.md` 的書籤清單，以及規格有變動時的 `shared/README.md`。
6. **最後才建置**：確認開發完成後，才執行 `npm run build -- <name>` 產生 `bookmarklet.txt`。開發中不要產生，以節省 token。

回覆使用繁體中文，保持精簡。

## 目錄結構

```
bookmarks/<name>/     每個書籤一個資料夾（名稱用 kebab-case）
  README.md           功能、目的、使用情境、回饋訊息、限制、安裝、版本紀錄
  source.js           可讀原始碼（ES5 IIFE，開頭註明 @name、@version）
  bookmarklet.txt     建置產物：一行 javascript: 網址，使用者直接複製
bookmarks/_template/  新書籤範本（複製後改名使用）
shared/               共用元件，規格見 shared/README.md
scripts/build.js      展開 @include → 驗證 ES5（acorn）→ Terser → 結尾加 void 0 → 將 % 跳脫成 %25
test/                 node:test + jsdom
```

## 撰寫規範

- **ES5**：建置時會用 acorn 驗證，不符合 ES5 就建置失敗。不使用 `let`、`const`、箭頭函式、template literal、`async`。Promise 只能用 `.then`，而且要先確認 API 存在。
- 整支書籤包在 IIFE 內，`@include` 也寫在 IIFE 內部，不要建立全域變數。
- 書籤結尾不需要自己加 `void 0`，建置時會自動加上。原因是 Terser 可能拆掉 IIFE，最後的值若變成字串，瀏覽器會用它取代整個頁面。
- 注入頁面的 id／class／屬性一律使用 `__bmt_` 前綴。
- **toast 回饋**：完成（成功、失敗、錯誤）時都要顯示 toast；有等待或讀秒時，用 `toast(msg, 'info', 0)` 持續更新文字。訊息使用繁體中文。
- **複製**：一律使用共用的 `copyText()`，它會先試 clipboard API，失敗再 fallback 到 `execCommand('copy')`。
- 不要用 `innerHTML` 寫入內容，改用 `textContent`／`createElement`。啟用 Trusted Types 的網站（例如 Google 系列）會直接拋錯。
- 網站 HTML 可能改版。懷疑壞掉時，先拿實際 HTML 驗證 selector。
- canvas／overlay 的尺寸在開啟時量一次就好，避免 layout thrash。

## 版本管理

使用者自己複製 `bookmarklet.txt` 安裝，**所以無法得知他手上是哪個版本**。

- `source.js` 的 `@version` 採 semver。任何行為變更都要升版，並在書籤 README 的「版本紀錄」加一列 `| vX.Y.Z | ... |`。建置時會檢查這一列是否存在，缺少時會發出警告。
- 書籤 README 要建議使用者用「`名稱 vX.Y.Z`」當書籤名稱，方便對照版本。
- 修改 `shared/` 元件時，所有用到它的書籤都要升版並重新建置。
- 新舊版本可能同時存在於使用者的瀏覽器中。更改 DOM id 或全域狀態時，要考慮與舊版的相容性（參考 toast 清除 `__lm_md_toast__` 的做法）。

## 指令

```
npm test                    執行測試
npm run build -- <name>     建置指定書籤（可一次指定多個）
```
