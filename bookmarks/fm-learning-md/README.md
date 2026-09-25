# FM 學習卡轉 Markdown

> 建議書籤名稱：`FM 學習卡轉 Markdown v1.0.0`

## 功能

把 Frontend Masters Learning Mode 目前顯示的 Quiz 或 Flashcard 轉成 Markdown，並複製到剪貼簿。

- 先找 `.LM-Quiz`，找不到再找 `.LM-Flashcard`。
- 轉換規則：
  - `<pre>` 轉成 fenced code block，語言固定為 `javascript`。
  - 行內 `<code>` 轉成反引號；內容本身含反引號時，改用雙反引號包住。
  - 區塊元素（`p`、`li`、`div` 等）之間以一個換行分隔。
  - 其他標籤只取文字。

### Quiz 輸出

```
<details>
<summary>題目（單行）</summary>
正解
</details>
```

- 正解的判斷方式，新舊兩種標記都支援：
  - 舊版 class：`is-correct` 表示使用者答對，`is-missed` 表示使用者答錯時沒選到的正解。
  - 新版屬性：`data-state="correct"` 和 `data-state="missed"`。
  - 使用者選錯的選項（`is-incorrect`、`data-state="incorrect"`）不會被當成正解。
- 有多個正解時，改用清單（`- A`、`- C`）；如果正解本身有多行（例如含 code block），改成以空行分隔。
- 題目含 code block 時，code block 會移到 `</summary>` 之後、答案之前，前後各空一行。`<summary>` 只能放單行文字，而且 `</summary>` 後面要先空一行，裡面的 Markdown 才會被渲染。
- 題目只有程式碼、沒有文字時，summary 會顯示 `（程式碼題）`。

### Flashcard 輸出

````
### 正面
```javascript
（正面的 code block，緊接在題目下一行）
```

背面
````

## 目的

把學習過程中的題目整理成 Markdown 筆記：Quiz 用 `<details>` 折疊答案，方便日後自我測驗。

## 使用情境

1. 在 Frontend Masters 課程的 Learning Mode 畫面：
   - Quiz：必須先送出答案。
   - Flashcard：不用翻面，正反兩面本來就都在頁面上。
2. 點擊書籤，看到 `已複製` 後貼到筆記。

## Selector

| 用途 | Selector |
|---|---|
| Quiz 題目 | `.LM-Quiz .LM-Quiz-question` |
| Quiz 正解 | `.LM-Quiz-option.is-correct`、`.is-missed`、`[data-state="correct"]`、`[data-state="missed"]`，再取其中的 `.LM-Quiz-option-text` |
| Flashcard | `.LM-Flashcard-front .LM-Flashcard-text`、`.LM-Flashcard-back .LM-Flashcard-text` |

## 回饋訊息

| 訊息 | 類型 | 觸發時機 |
|---|---|---|
| `已複製` | success | 複製成功 |
| `複製失敗` | error | clipboard API 與 fallback 都失敗 |
| `尚未送出答案` | error | Quiz 找不到任何正解標記 |
| `找不到題目內容` | error | Quiz 缺少題目 |
| `找不到 flashcard 內容` | error | Flashcard 缺少正面或背面 |
| `找不到 Quiz 或 Flashcard` | error | 頁面上兩種都沒有 |

## 限制

- code block 的語言一律標成 `javascript`。
- 多段落之間只用一個換行分隔，Markdown 會把它們顯示成同一段。Flashcard 正面如果有多段，只有第一段會在 `###` 標題裡。
- Flashcard 正面如果「以 code block 開頭」，標題行會壞掉（`### ```javascript`）。
- 頁面上同時有 Quiz 和 Flashcard 時，以 Quiz 為準。
- 輸出含有 HTML（`<details>`）。它和裡面的 Markdown 能不能正確顯示，取決於你貼上的平台。

## 安裝

1. 複製同資料夾 `bookmarklet.txt` 的整行內容（以 `javascript:` 開頭）。
2. 瀏覽器新增書籤，名稱填 `FM 學習卡轉 Markdown v1.0.0`，網址貼上剛剛複製的內容。

## 版本紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| v1.0.0 | 2026-09-25 | 從 Claude Projects 移轉而來，取代舊版（沒有版本號）。改動如下：<br>• 修正 Flashcard 題目與 code block 之間多出的空行<br>• 多個正解改為全部列出<br>• Quiz 題目的 code block 移到 `</summary>` 之後<br>• 相鄰段落沒有空白時不再黏在一起<br>• 行內 code 含反引號時改用雙反引號<br>• Quiz 缺少題目時提示 `找不到題目內容`<br>• 改寫成 ES5，toast 和複製改用新版共用元件 |
