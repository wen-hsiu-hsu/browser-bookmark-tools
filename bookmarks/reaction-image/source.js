/**
 * @name    反應圖
 * @version 1.0.0
 * @desc    在頁面右下角顯示自訂的反應圖；Alt+Shift+1~9 切換 9 張已設定的圖片
 *
 * 建置：npm run build -- reaction-image
 *
 * 所有狀態都放在 DOM（目前顯示的圖片、監聽標記）與 localStorage（各欄位網址），
 * 不依賴某次執行的閉包，所以重複點書籤或由快捷鍵觸發都會得到一致的結果。
 */
(function () {
  /* @include toast */

  var d = document;
  var root = d.documentElement;
  var KEY = '__bmt_reaction'; // localStorage：{ urls: { 1: '...', ... }, last: 1 }
  var ID = '__bmt_reaction__'; // 目前顯示中的圖片容器
  var FLAG = 'data-__bmt_reaction'; // 已監聽快捷鍵的標記

  // ---- 儲存（網站禁止 localStorage 時照樣能顯示，只是不會記住） ----
  function load() {
    var s;
    try {
      s = JSON.parse(localStorage.getItem(KEY));
    } catch (e) {}
    s = s && typeof s === 'object' ? s : {};
    s.urls = s.urls || {};
    return s;
  }

  function remember(slot, url) {
    var s = load();
    s.urls[slot] = url;
    s.last = slot;
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch (e) {}
  }

  function ask(slot) {
    var url = prompt('輸入第 ' + slot + ' 張圖片的網址（快捷鍵 Alt+Shift+' + slot + '）', '');
    url = url && url.replace(/^\s+|\s+$/g, '');
    return url || null;
  }

  // ---- 顯示 / 關閉 ----
  function current() {
    return d.getElementById(ID);
  }

  function close() {
    var el = current();
    if (!el) return;
    el.removeAttribute('id'); // 淡出期間就視為已關閉
    el.style.opacity = '0';
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 300);
  }

  /**
   * 在右下角顯示圖片；載入成功才記住網址。
   * 載入失敗時再詢問一次網址；第二次仍失敗，多半是網站 CSP 禁止外部圖片，停止詢問。
   */
  function show(slot, url, retried) {
    var old = current();
    if (old && old.parentNode) old.parentNode.removeChild(old);

    var box = d.createElement('div');
    box.id = ID;
    box.setAttribute('data-slot', slot);
    box.style.cssText =
      'all:initial;display:block;position:fixed;right:20px;bottom:20px;z-index:2147483646;' +
      'line-height:0;cursor:pointer;opacity:0;transition:opacity .2s';
    var img = d.createElement('img');
    img.alt = '';
    img.style.cssText =
      'all:initial;display:block;max-width:240px;max-height:240px;' +
      'border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.2)';
    var btn = d.createElement('button');
    btn.type = 'button';
    btn.textContent = '更換';
    btn.style.cssText =
      'all:initial;display:none;position:absolute;top:6px;left:6px;cursor:pointer;' +
      'background:rgba(0,0,0,.6);color:#fff;padding:4px 8px;border-radius:4px;' +
      'font:12px/1.4 -apple-system,BlinkMacSystemFont,sans-serif';

    box.onmouseenter = function () {
      btn.style.display = 'block';
    };
    box.onmouseleave = function () {
      btn.style.display = 'none';
    };
    box.onclick = close;
    btn.onclick = function (e) {
      e.stopPropagation();
      var u = ask(slot);
      if (u) show(slot, u, false);
    };
    img.onload = function () {
      remember(slot, url);
      box.style.opacity = '1';
    };
    img.onerror = function () {
      if (box.parentNode) box.parentNode.removeChild(box);
      if (retried) {
        toast('此網站可能禁止載入外部圖片', 'error');
        return;
      }
      toast('圖片載入失敗', 'error');
      var u = ask(slot);
      if (u) show(slot, u, true);
    };

    box.appendChild(img);
    box.appendChild(btn);
    (d.body || root).appendChild(box);
    img.src = url;
  }

  /** 顯示第 slot 張；沒設定過就先詢問網址。 */
  function open(slot) {
    var url = load().urls[slot] || ask(slot);
    if (url) show(slot, url, false);
  }

  // ---- 快捷鍵：Alt+Shift+1~9（每個頁面只監聽一次，重新整理後失效） ----
  if (!root.hasAttribute(FLAG)) {
    root.setAttribute(FLAG, '');
    window.addEventListener(
      'keydown',
      function (e) {
        // 用 e.code 判斷實體按鍵：Mac 的 Option+Shift+數字會產生特殊字元，e.key 不可靠
        var m = /^Digit([1-9])$/.exec(e.code || '');
        if (!m || !e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return;
        e.preventDefault();
        e.stopPropagation();
        var slot = +m[1];
        var cur = current();
        if (cur && +cur.getAttribute('data-slot') === slot) close(); // 同一張再按一次 = 關閉
        else open(slot);
      },
      true
    );
    toast('快捷鍵已啟用：Alt+Shift+1~9', 'info');
  }

  open(load().last || 1);
})();
