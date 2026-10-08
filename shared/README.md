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
- 共用元件修改後，**已安裝的書籤不會自動更新**。每個用到該元件的書籤都要升版並重新建置。例外：已停止維護的書籤（`fm-learning-md`、`fm-flashcard-batch`）不跟著升版與重建，保留原本的 `bookmarklet.txt`。
- 注入頁面的 UI 一律使用 [theme](#theme) 的 tokens，不在書籤或元件內寫死色值。

---

## theme

`/* @include theme */`。提供 design tokens 與樣式隔離工具，toast、copy-prompt、panel 會自動 include。

| 函式 | 說明 |
|---|---|
| `bmtTheme() → T` | 回傳 tokens。第一次呼叫時判斷亮／暗並快取，同一次書籤執行只判斷一次 |
| `bmtCss(el, text)` | 以 `all:initial;box-sizing:border-box;` 開頭設定整串樣式，每條都加 `!important`。同一屬性出現多次時保留最後一個 |
| `bmtSet(el, prop, value)` | 事後修改單一樣式（`prop` 用 kebab-case），同樣加 `!important` |
| `bmtIcon(shapes, size, color, fill?) → svg` | 線條 SVG icon，`shapes` 是 `[[tag, attrs], ...]`（viewBox 24×24）；`fill` 為 true 時改為實心 |
| `bmtAnimate(node, frames, ms) → Animation \| null` | 無限循環的 Web Animations；不支援 `el.animate` 時不動畫，回傳 `null`。動畫一律用它，不要直接呼叫 `el.animate`（原因見下） |

- **主題判斷**：`matchMedia('(prefers-color-scheme: light)')` 成立時用亮色，否則用暗色（包括 API 不存在、不支援這個 media feature、拋錯）。UI 開著時切換系統主題不會跟著變，重新點書籤才會套用。
- **`!important`**：inline 樣式會輸給頁面樣式表裡的 `!important`，所以全部加上。用 `bmtCss` 設定過的元素，之後一律用 `bmtSet` 修改；直接寫 `el.style.x = v` 會把 `!important` 拿掉。
- **動畫**：CSS cascade 中 important 宣告的優先權高於動畫，`all:initial!important` 會讓 `transform` 等屬性也變成 important，動畫完全不會動。`bmtAnimate` 會先把被動畫的屬性改回一般優先權。transition 的優先權高於 important，不受影響。
- **不注入 `<style>`**：嚴格的 CSP 會擋 inline `<style>`，tokens 是 JS 物件，不是 CSS 變數。

### 色彩 tokens

| token | 亮 | 暗 | 用途 |
|---|---|---|---|
| `bg` | `#ffffff` | `#1c1f24` | 面板、工具列、toast 底色 |
| `bg2` | `#f3f4f6` | `#262a31` | 次層底色（預留） |
| `fg` | `#1c1f24` | `#e6e8eb` | 文字、控制鈕 icon |
| `muted` | `#6b7280` | `#8b929c` | 拖曳點、頁尾說明、沒有內容的項目 |
| `kbd` | `#4b5563` | `#b4bac3` | 快捷鍵文字 |
| `hover` | `rgba(0,0,0,.05)` | `rgba(255,255,255,.07)` | 按鈕 hover、執行中的指令 |
| `active` | `rgba(0,0,0,.09)` | `rgba(255,255,255,.12)` | 還原鈕等常駐的淺底色 |
| `border` | `rgba(0,0,0,.08)` | `rgba(255,255,255,.08)` | 標題列分隔線、進度條軌道 |
| `borderStrong` | `rgba(0,0,0,.16)` | `rgba(255,255,255,.18)` | 分隔線、kbd 外框、色票內框、還原鈕 hover |
| `scrim` | `rgba(255,255,255,.88)` | `rgba(28,31,36,.85)` | 疊在圖片上的按鈕 |
| `accent` | `#2563eb` | `#7cb7ff` | 指令 icon、進度條、焦點外框、選取外環 |
| `fill`／`onFill` | `#2563eb`／`#ffffff` | 同左 | 選取中、可點的實心按鈕（copy-prompt） |
| `success` | `#16a34a` | `#4ade80` | toast 狀態色條與 icon |
| `error` | `#dc2626` | `#f87171` | 同上 |
| `info` | `#2563eb` | `#7cb7ff` | 同上 |
| `shadow` | `0 0 0 1px rgba(0,0,0,.06),0 8px 24px rgba(15,23,42,.14)` | `0 0 0 1px rgba(255,255,255,.06),0 8px 24px rgba(0,0,0,.28)` | 浮動元件。1px 外圈讓亮色元件放在白色網站上也看得出邊緣 |

### 其他 tokens

| token | 值 | 用途 |
|---|---|---|
| `dark` | `true`／`false` | 目前是否為暗色 |
| `font` | `14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif` | 內文；小字用 13／12／11px |
| `mono` | `ui-monospace,SFMono-Regular,Menlo,monospace` | kbd |
| `radiusSm`／`radiusMd`／`radiusPill` | `6px`／`10px`／`999px` | 按鈕／容器（面板、工具列、toast）／膠囊 |
| `disabledOpacity` | `.4` | 停用的按鈕 |
| `focusRing` | `2px solid <accent>` | 鍵盤焦點外框，搭配 `outline-offset:-2px`；支援 `:focus-visible` 時只在鍵盤焦點顯示 |
| `zWhiteboard`／`zPanel`／`zToast` | `2147483000`／`2147483646`／`2147483647` | 白板 < 面板類（含 reaction-image）< toast |
| `fadeIn`／`fadeOut` | `200`／`300`（ms） | 淡入／淡出 |
| `spin`／`progress` | `900`／`1200`（ms） | 轉圈一圈／進度條跑一趟；不支援 Web Animations 時不動畫 |

尺寸慣例（尚未做成 token）：控制鈕 28px、工具列按鈕 32px、縮小欄指令鈕 36px、指令列與膠囊高 44px。

### 新增 token 的流程

遇到 tokens 沒有涵蓋的設計元素（新的顏色、狀態、尺寸）時：

1. 先確認現有 token 能不能用（例如「淺底色」先考慮 `hover`／`active`）。
2. 不能用時，在 `shared/theme.js` 新增 token，**亮、暗兩個值都要給**，並在本節的表格加一列，寫明用途。
3. 書籤和元件裡只引用 token，不寫死色值。
4. 修改 theme 等同修改共用元件：用到的書籤都要升版並重新建置。

**內容色例外**：使用者選的畫筆顏色、便利貼顏色這類「內容」，不跟主題變，可以寫死，但要在該行加上 `/* @design-literal */` 標記。

### 建置檢查

`npm run build` 會掃描書籤的 `source.js` 和它 include 的 shared 元件（`theme.js` 除外）。遇到寫死的 `#hex`、`rgb(`、`rgba(` 就發出警告，但不讓建置失敗。註解行和標了 `@design-literal` 的行不檢查。

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
| `z-index` | `zToast`（`2147483647`，32-bit int 最大值） |

### 外觀
| 屬性 | 值 |
|---|---|
| 結構 | `display:flex`：左邊 18px icon，右邊文字（`<span>`） |
| `background` | `bg` |
| `color` | `fg` |
| 狀態色條 | `border-left:4px solid`，顏色為 `success`／`error`／`info` |
| icon | success：圓圈打勾；error：圓圈打叉；info：圓圈驚嘆號；info 且 `duration` 為 0：轉圈（`spin` ms 一圈）。顏色同狀態色條 |
| `padding` | `10px 14px 10px 12px` |
| `border-radius` | `radiusMd`（10px） |
| `box-shadow` | `shadow` |
| `font` | `font` |
| `max-width` | `320px`，文字可換行 |

### 行為
| 項目 | 規格 |
|---|---|
| 互動 | `pointer-events:none`，完全不擋使用者操作 |
| 進場動畫 | `opacity` 0 → 1，`transition:opacity 200ms`（只在新建時播放） |
| 停留時間 | `duration` 參數，預設 2500ms；`0` = 不自動消失 |
| 退場動畫 | `opacity` 1 → 0，耗時 300ms，結束後移除元素 |
| 去重 | 固定 `id="__bmt_toast__"`。已存在時直接更新文字、類型與色條，不重建；只有類型或轉圈狀態改變時才換 icon，讀秒時轉圈不會跳回起點 |
| 類型 | 記在 `data-__bmt_type`（`success`／`error`／`info`）。底色不代表類型，其他元件要判斷類型時讀這個屬性 |
| 舊版相容 | 每次呼叫都會移除舊版書籤的 `#__lm_md_toast__`。同 id 的 toast 若是舊版共用元件建立的（沒有 icon 結構），或被舊版改寫過文字，就移除後以新樣式重建。反方向做不到：舊版書籤會把新版 toast 改成實底色，但文字顏色沿用主題 `fg`（亮色主題下對比不足），直到下一次新版呼叫時重建 |
| 計時器 | 存放在元素本身（`__bmtStay`、`__bmtFade`），每次呼叫都會清除，舊計時器不會誤刪新 toast |
| 樣式隔離 | `bmtCss`：`all:initial` 加上每條 `!important`，避免頁面 CSS（繼承的字型、字距、`div` 選擇器或 `!important` 規則）影響 toast |
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

使用者：`fm-tools`、`fm-learning-md`、`fm-flashcard-batch`（後兩者已停止維護）。修改轉換規則時，`fm-tools` 要升版。

---

## copy-prompt

`copyOrPrompt(text: string, okMsg: string, label: string): void`，另外提供 `removeCopyPrompt()`。會自動 include `toast` 和 `clipboard`。

1. 先移除上一次留下、沒被點的按鈕。
2. 用 `copyText()` 直接複製；成功就顯示 `toast(okMsg)`。
3. 失敗時移除目前的 toast，改在同一個位置顯示可點擊的按鈕 `#__bmt_copy_btn__`：
   - 按鈕左邊是複製 icon，文字是 `label`。
   - 底色用實心 `fill`、文字用 `onFill`，與不可點的 toast（主題底色）做出區別；圓角、陰影、字型與 toast 相同。
4. 點擊按鈕時再複製一次，這次點擊就是新的使用者操作：
   - 成功：移除按鈕，並顯示 `okMsg`。
   - 失敗：保留按鈕讓使用者再試，並顯示 `複製失敗`。

適用情境：批次作業跑太久，超過瀏覽器允許寫入剪貼簿的時限（使用者點擊後 Firefox 約 5 秒，Safari 更嚴格）。

---

## panel

`createPanel(opts) → api`：浮動指令面板，會自動 include `toast`（及 `theme`）。使用者：`fm-tools`。

### 參數
| 欄位 | 說明 |
|---|---|
| `id` | 面板 id，需以 `__bmt_` 開頭 |
| `title` | 展開時的標題，也作為 `aria-label` |
| `mini` | 最小化膠囊上的短名稱 |
| `footer` | 底部說明文字 |
| `version` | 寫入 `data-__bmt_ver`，讓新版書籤辨認舊版面板 |
| `commands` | `[{ id, key: '1'~'9', label, icon: [[tag, attrs], ...], run: function (ctx) }]` |

`run(ctx)`：`ctx.progress(text)` 更新進度文字；`ctx.done()` 結束指令（重複呼叫無效）。**每條路徑最後都必須呼叫 `done()`**。

`api`：`expand()`（最小化時還原到最小化前的模式；其他模式只夾回視窗內）、`close()`（執行中無效）、`busy()`。面板元素上也掛著 `__bmtPanel = api`，重複點書籤時可以拿到。

### 外觀
| 項目 | 規格 |
|---|---|
| 配色 | 全部來自 theme tokens，依系統亮／暗切換（建立時判斷一次） |
| 位置 | `position:fixed`，以右上角定位（`right`／`top`）。建立時量一次高度，換算成距離視窗右下角 16px 的位置。`z-index:zPanel`（toast 在它上面） |
| 展開 | 寬 264px，底色 `bg`，圓角 10px；標題列有〔縮小〕〔最小化〕〔關閉〕；按鈕高 44px，左側 20px 線條 icon，右側 `<kbd>⌥⇧N</kbd>` |
| 縮小 | 寬 44px 的直排欄：拖曳點、進度條、36px 指令 icon 鈕（`data-__bmt_ccmd`，名稱與快捷鍵放在 `title`）、分隔線，以及〔展開〕〔最小化〕〔關閉〕。不顯示任何文字 |
| 最小化 | 高 44px 的膠囊：拖曳點、短名稱、〔還原〕鈕 |
| 控制鈕 icon | `fg`，直接寫入 SVG。SVG 帶 `all:initial` 會把 `color` 重設成黑色，所以不使用 `currentColor` |
| cursor | root 為 `default`；`el()` 與 SVG 預設 `cursor:inherit`，按鈕內的文字和 icon 顯示 pointer，拖曳區內顯示 move |
| 強調色 | `accent`（指令 icon、外框、進度條、進度文字）；hover 用 `hover`，停用用 `disabledOpacity` |
| 樣式隔離 | 每個元素都用 `bmtCss` 設定（`all:initial` 加每條 `!important`），之後一律用 `bmtSet` 修改；SVG 的尺寸和 fill／stroke 也寫在 inline 樣式中，避免被頁面的 `svg{...}` 規則影響 |
| 不注入 `<style>` | 嚴格的 CSP 會擋 inline `<style>`。hover 底色和鍵盤焦點外框都用事件切換 inline 樣式；支援 `:focus-visible` 時，滑鼠點擊不顯示外框 |

### 行為
| 項目 | 規格 |
|---|---|
| 模式切換 | 展開、縮小、最小化三種模式可以互相直達；膠囊的〔還原〕回到最小化前的模式。切換時右上角不動；會清掉被隱藏按鈕的 hover 底色與外框。焦點原本在面板內（鍵盤操作）時，焦點會移到新模式的對應控制鈕 |
| 拖曳 | 在標題列、膠囊或縮小欄的拖曳點上按住左鍵拖曳（從按鈕上開始不算）。拖曳開始時量一次尺寸，整個面板限制在視窗內，位置存成 `right`／`top`。移動時沒按著左鍵，或視窗 blur，就結束拖曳 |
| 夾回視窗 | 切換模式、`expand()`、視窗 `resize` 時，量一次尺寸並把面板夾回視窗內。視窗大小在標準模式用 `clientWidth`／`clientHeight`，quirks mode 改用 `innerWidth`／`innerHeight` |
| 快捷鍵 | `window` capture 階段的 keydown。用 `e.code` 比對 `Digit1`～`Digit9`，條件是 Alt＋Shift、沒有 Ctrl／Meta、焦點不在輸入框。沒有對應指令的數字不攔截。長按連發（`e.repeat`）不觸發 |
| 執行中 | 外框亮起（`0 0 0 2px` 強調色）；標題下出現 3px 進度條；指令 icon 換成轉圈並顯示進度（縮小模式只寫進該按鈕的 `title`）；其他按鈕與 ✕ 停用；root 加上 `aria-busy="true"` |
| 執行中再觸發 | 顯示 `指令執行中` 1.5 秒，之後恢復原本持續顯示的 info toast（以 `data-__bmt_type` 判斷）。新舊版混用時（例如 v1.1.0 面板遇到新版 toast）判斷不到類型，提示結束後不會恢復進度訊息，只會淡出 |
| 看門狗 | 執行中超過 15 秒沒有呼叫 `progress()`／`done()`，就自動解除，並顯示 `指令沒有回應，已解除執行中狀態` |
| 同步錯誤 | `run()` 同步拋錯時解除執行中，並顯示 `執行失敗：<訊息>` |
| 關閉 | 移除面板並解除 keydown／resize 監聽 |
| 面板被頁面移除 | 下一次按鍵時發現 root 已不在文件中，就自動解除監聽 |
| 動畫 | 使用 Web Animations API（`el.animate`）；不支援時不動畫，其他狀態不受影響 |
