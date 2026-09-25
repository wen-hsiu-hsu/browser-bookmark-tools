/**
 * @name    反應圖
 * @version 1.1.0
 * @desc    在頁面角落顯示自訂的反應圖（可拖曳、滾輪縮放）；Alt+Shift+1~9 切換 9 張已設定的圖片
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
  var VIEW = 'data-__bmt_reaction_view'; // 本次頁面的位置與大小 {x, y, size}；重新整理後回到預設
  var SIZE = 240; // 預設最長邊
  var MIN = 60;

  // ---- 儲存（網站禁止 localStorage 時照樣能顯示，只是不會記住） ----
  function isObj(v) {
    return !!v && typeof v === 'object' && !(v instanceof Array);
  }

  /** 讀取設定；內容損壞（非物件、欄位型別錯誤）時改用安全的預設值。 */
  function load() {
    var s;
    try {
      s = JSON.parse(localStorage.getItem(KEY));
    } catch (e) {}
    s = isObj(s) ? s : {};
    if (!isObj(s.urls)) s.urls = {};
    if (!/^[1-9]$/.test(String(s.last))) s.last = 1;
    return s;
  }

  function urlOf(slot) {
    var u = load().urls[slot];
    return typeof u === 'string' && u ? u : null;
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

  // ---- 位置與大小（只存在 <html> 屬性上，本次頁面有效） ----
  function view() {
    var v;
    try {
      v = JSON.parse(root.getAttribute(VIEW));
    } catch (e) {}
    return v && typeof v === 'object' ? v : {};
  }

  function saveView(v) {
    root.setAttribute(VIEW, JSON.stringify(v));
  }

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  /**
   * 依目前的 view 設定圖片大小與容器位置：
   * - 大小：最長邊 = size。圖片載入後依原始比例設定明確寬高，小圖也能放大。
   * - 位置：沒拖曳／縮放過就維持右下角；否則用 left/top，並確保至少 40px 留在畫面內。
   */
  function applyView(box, img) {
    var v = view();
    var size = clamp(v.size || SIZE, MIN, Math.max(MIN, window.innerHeight));
    var nw = img.naturalWidth;
    var nh = img.naturalHeight;
    img.style.maxWidth = img.style.maxHeight = Math.round(size) + 'px';
    if (nw && nh) {
      var k = size / Math.max(nw, nh);
      img.style.width = Math.round(nw * k) + 'px';
      img.style.height = Math.round(nh * k) + 'px';
    }
    if (typeof v.x !== 'number') return;
    box.style.right = box.style.bottom = 'auto';
    box.style.left = v.x + 'px';
    box.style.top = v.y + 'px';
    var r = box.getBoundingClientRect();
    if (!r.width || !r.height) return; // 尚未插入或圖片未載入：尺寸未知，等 onload 再確認
    var x = clamp(v.x, 40 - r.width, window.innerWidth - 40);
    var y = clamp(v.y, 40 - r.height, window.innerHeight - 40);
    if (x !== v.x || y !== v.y) {
      v.x = x;
      v.y = y;
      saveView(v);
      box.style.left = x + 'px';
      box.style.top = y + 'px';
    }
  }

  /** 拖曳：移動超過 4px 才算拖曳（放開時不會觸發關閉）；圖片至少留 40px 在畫面內。 */
  function makeDraggable(box, img) {
    box.onmousedown = function (e) {
      if (e.button !== 0 || (e.target !== box && e.target !== img)) return;
      e.preventDefault(); // 避免選取文字
      var sx = e.clientX;
      var sy = e.clientY;
      var r = box.getBoundingClientRect();
      var moved = false;
      function move(ev) {
        // 沒按著滑鼠（例如在 iframe 上放開、切換視窗）或圖片已被換掉：結束拖曳
        if (('buttons' in ev && ev.buttons === 0) || !box.parentNode) return up();
        var dx = ev.clientX - sx;
        var dy = ev.clientY - sy;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
        moved = true;
        var v = view();
        v.x = r.left + dx;
        v.y = r.top + dy;
        saveView(v);
        applyView(box, img);
      }
      function up() {
        d.removeEventListener('mousemove', move, true);
        d.removeEventListener('mouseup', up, true);
        window.removeEventListener('blur', up);
        if (!moved) return;
        // 擋掉拖曳結束後的那一次 click；放開位置在圖片外時 click 不會送到圖片，所以下一輪自動解除
        box.__bmtDragged = true;
        setTimeout(function () {
          box.__bmtDragged = false;
        }, 0);
      }
      d.addEventListener('mousemove', move, true);
      d.addEventListener('mouseup', up, true);
      window.addEventListener('blur', up);
    };
  }

  /**
   * 滾輪縮放：依滾動量連續縮放（滑鼠滾輪一格約 10%，觸控板細微滑動只縮放一點），
   * 以游標位置為中心；範圍 60px～畫面高度。
   */
  function makeZoomable(box, img) {
    box.addEventListener(
      'wheel',
      function (e) {
        if (!e.deltaY) return;
        e.preventDefault(); // 滑鼠在圖片上時頁面不捲動
        var px = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? window.innerHeight : 1);
        var v = view();
        var r = box.getBoundingClientRect();
        var old = clamp(v.size || SIZE, MIN, Math.max(MIN, window.innerHeight));
        // 不在這裡取整數：觸控板的細微滑動才能累積起來
        v.size = clamp(old * Math.pow(1.1, -px / 100), MIN, Math.max(MIN, window.innerHeight));
        var k = v.size / old;
        v.x = e.clientX - (e.clientX - r.left) * k;
        v.y = e.clientY - (e.clientY - r.top) * k;
        saveView(v);
        applyView(box, img);
      },
      { passive: false }
    );
  }

  var HOVER_BTN =
    'all:initial;cursor:pointer;background:rgba(0,0,0,.6);color:#fff;border-radius:4px;' +
    'font:12px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;';

  /** 欄位提示列：1~9，有圖的數字為白色、沒圖的暗色、目前這張加框；點數字切換或設定。 */
  function slotBar(slot) {
    var urls = load().urls;
    var bar = d.createElement('div');
    bar.style.cssText =
      'all:initial;display:none;position:absolute;bottom:6px;left:50%;transform:translateX(-50%);' +
      'white-space:nowrap;line-height:0';
    for (var i = 1; i <= 9; i++) {
      var b = d.createElement('button');
      b.type = 'button';
      b.textContent = i;
      b.setAttribute('data-slot', i);
      b.style.cssText =
        HOVER_BTN +
        'display:inline-block;width:18px;margin:0 1px;padding:2px 0;text-align:center;' +
        'color:' + (typeof urls[i] === 'string' && urls[i] ? '#fff' : 'rgba(255,255,255,.35)') + ';' +
        'box-shadow:' + (i === slot ? 'inset 0 0 0 1px #fff' : 'none');
      b.onclick = function (e) {
        e.stopPropagation();
        var n = +this.getAttribute('data-slot');
        if (n !== slot) open(n);
      };
      bar.appendChild(b);
    }
    return bar;
  }

  /**
   * 顯示圖片（位置與大小沿用本次的 view）；載入成功才記住網址。
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
      'line-height:0;cursor:move;opacity:0;transition:opacity .2s';
    var img = d.createElement('img');
    img.alt = '';
    img.draggable = false; // 關閉瀏覽器原生的圖片拖曳（會拖出半透明預覽圖）
    img.style.cssText =
      'all:initial;display:block;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.2)';
    var btn = d.createElement('button');
    btn.type = 'button';
    btn.textContent = '更換';
    btn.style.cssText = HOVER_BTN + 'display:none;position:absolute;top:6px;left:6px;padding:4px 8px';
    var bar = slotBar(slot);

    makeDraggable(box, img);
    makeZoomable(box, img);

    function hover(on) {
      box.__bmtHover = on;
      btn.style.display = bar.style.display = on ? 'block' : 'none';
    }
    box.onmouseenter = function () {
      hover(true);
    };
    box.onmouseleave = function () {
      hover(false);
    };
    // 從提示列或「更換」換圖時游標還在原處：新圖直接維持 hover 狀態
    if (old && old.__bmtHover) hover(true);
    box.onclick = function () {
      if (box.__bmtDragged) {
        box.__bmtDragged = false;
        return;
      }
      close();
    };
    btn.onclick = function (e) {
      e.stopPropagation();
      var u = ask(slot);
      if (u) show(slot, u, false);
    };
    // 已切換到別張或已關閉後，舊圖的 load / error 才到：一律忽略，避免改動目前狀態
    img.onload = function () {
      if (box !== current()) return;
      remember(slot, url);
      bar.children[slot - 1].style.color = '#fff'; // 剛設定的欄位也標成有圖
      applyView(box, img); // 知道原始尺寸後套用明確寬高並重新確認位置
      box.style.opacity = '1';
    };
    img.onerror = function () {
      if (box !== current()) return;
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
    box.appendChild(bar);
    (d.body || root).appendChild(box);
    applyView(box, img);
    img.src = url;
  }

  /** 顯示第 slot 張；沒設定過就先詢問網址。 */
  function open(slot) {
    var url = urlOf(slot) || ask(slot);
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
        // stopImmediatePropagation：萬一標記被頁面移除、監聽器被裝了兩次，同一次按鍵也只處理一次
        e.stopImmediatePropagation();
        if (e.repeat) return; // 長按的自動連發會讓開關來回切換
        var slot = +m[1];
        var cur = current();
        if (cur && +cur.getAttribute('data-slot') === slot) close(); // 同一張再按一次 = 關閉
        else open(slot);
      },
      true
    );
    toast('快捷鍵已啟用：Alt+Shift+1~9', 'info');
  }

  open(+load().last);
})();
