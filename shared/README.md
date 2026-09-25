# 共用元件

書籤在執行時無法 `import` 或載入外部 script，因為很多網站的 CSP 會擋。所以共用元件都在**建置時**展開，直接合併進每個書籤：

```js
(function () {
  /* @include toast */
  /* @include clipboard */
  // ...
})();
```

- `@include` 必須寫在書籤的 IIFE **內部**，元件才不會汙染頁面的全域變數。
- `@include` 註解必須**獨占一行**。寫在 `//` 註解或字串裡的不會被展開。
- 共用元件也可以 `@include` 其他元件，會遞迴展開；同一個元件只會展開一次。
- 沒用到的函式會被 Terser 移除，不會增加書籤長度。
- 所有注入頁面的 id／屬性一律使用 `__bmt_` 前綴。
- 共用元件修改後，**已安裝的書籤不會自動更新**。每個用到該元件的書籤都要升版並重新建置。

---

## toast

`toast(msg: string, type?: 'success' | 'error' | 'info', duration?: number): void`

### 定位
| 屬性 | 值 |
|---|---|
| 位置 | 視窗頂部置中 |
| `position` | `fixed` |
| `top` | `20px` |
| `left` | `50%` |
| `transform` | `translateX(-50%)` |
| `z-index` | `2147483647`（32-bit int 最大值） |

### 外觀
| 屬性 | 值 |
|---|---|
| `background`（success，預設） | `#16a34a`（綠） |
| `background`（error） | `#dc2626`（紅） |
| `background`（info） | `#2563eb`（藍） |
| `color` | `#fff` |
| `padding` | `10px 16px` |
| `border-radius` | `6px` |
| `box-shadow` | `0 4px 12px rgba(0,0,0,.2)` |
| `font` | `14px/1.4 -apple-system, BlinkMacSystemFont, sans-serif` |
| `max-width` | `320px` |
| `text-align` | `center` |

### 行為
| 項目 | 規格 |
|---|---|
| 互動 | `pointer-events:none`，完全不擋使用者操作 |
| 進場動畫 | `opacity` 0 → 1，`transition:opacity .2s`（只在新建時播放） |
| 停留時間 | `duration` 參數，預設 2500ms；`0` = 不自動消失 |
| 退場動畫 | `opacity` 1 → 0，耗時 300ms，結束後移除元素 |
| 去重 | 固定 `id="__bmt_toast__"`。已存在時直接更新文字、顏色並重設計時器，不重建 |
| 舊版相容 | 每次呼叫都會移除舊版書籤的 `#__lm_md_toast__`。反方向做不到：舊版書籤不會清掉新版的 toast，兩者可能短暫重疊 |
| 計時器 | 存放在元素本身（`__bmtStay`、`__bmtFade`），每次呼叫都會清除，舊計時器不會誤刪新 toast |
| 樣式隔離 | inline 樣式開頭先設 `all:initial`，避免頁面 CSS（繼承的字型、字距或 `div` 選擇器等）影響 toast |
| 安全 | 以 `textContent` 寫入，不解析 HTML |

### 類型
| type | 用途 |
|---|---|
| `'success'`（或其他值／省略） | 成功 |
| `'error'` | 錯誤、警告 |
| `'info'` | 進行中、等待、讀秒 |

### 讀秒範例
```js
var n = 3;
toast(n + ' 秒後開始', 'info', 0);        // 不自動消失
var timer = setInterval(function () {
  if (--n > 0) return toast(n + ' 秒後開始', 'info', 0); // 原地更新文字
  clearInterval(timer);
  toast('完成');                          // 以 success／error 結束，2500ms 後消失
}, 1000);
```

---

## clipboard

`copyText(text: string, cb: (ok: boolean) => void): void`

1. 優先使用 `navigator.clipboard.writeText()`。
2. API 不存在、同步拋錯或 Promise 被拒絕時，改用隱藏 `<textarea>` 加上 `document.execCommand('copy')`，完成後還原原本的焦點。
3. `cb` 只會被呼叫一次，參數表示是否成功。

Clipboard API 常見的失敗原因**不是 CSP**，而是以下幾種情況：非安全環境（http）、頁面沒有焦點、iframe 被 Permissions-Policy 限制。`execCommand('copy')` 已被標為 deprecated，但各主流瀏覽器目前仍支援。

---

## lm-md

Frontend Masters Learning Mode 專用：`toMd(el)` 把元素轉成 Markdown。

- `<pre>` 轉成 ```` ```javascript ```` fenced code block，前後剛好各一個換行；連續的 code block 之間空一行。
- 行內 `<code>` 轉成反引號；內容本身含反引號時，改用雙反引號包住。
- 區塊元素（`p`、`div`、`li`、`br`、`h1`–`h6` 等）之間以一個換行分隔；其他標籤只取文字。
- 另外提供 `codeOf(pre)`、`fence(pre)`、`BLOCK`。

使用者：`fm-learning-md`、`fm-flashcard-batch`。修改轉換規則時，兩個書籤都要升版。

---

## copy-prompt

`copyOrPrompt(text: string, okMsg: string, label: string): void`，另外提供 `removeCopyPrompt()`。會自動 include `toast` 和 `clipboard`。

1. 先移除上一次留下、沒被點的按鈕。
2. 用 `copyText()` 直接複製；成功就顯示 `toast(okMsg)`。
3. 失敗時移除目前的 toast，改在同一個位置顯示可點擊的按鈕 `#__bmt_copy_btn__`：
   - 按鈕文字是 `label`，樣式跟 info toast 相同（藍色 `#2563eb`），但可以點。
4. 點擊按鈕時再複製一次，這次點擊就是新的使用者操作：
   - 成功：移除按鈕，並顯示 `okMsg`。
   - 失敗：保留按鈕讓使用者再試，並顯示 `複製失敗`。

適用情境：批次作業跑太久，超過瀏覽器允許寫入剪貼簿的時限（使用者點擊後 Firefox 約 5 秒，Safari 更嚴格）。
