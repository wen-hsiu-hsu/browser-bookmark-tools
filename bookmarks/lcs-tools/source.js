/**
 * @name    LCS 工具
 * @version 1.0.0
 * @desc    LearnCraft Spanish podcast 頁：浮動面板整合專注模式、模糊西文（strong em）、±5 秒，附快捷鍵 ⌥⇧1~4
 *
 * 建置：npm run build -- lcs-tools
 */
(function () {
  /* @include panel */

  var d = document;
  var w = window;
  var ID = '__bmt_lcs_tools__';
  var VERSION = '1.0.0';
  var SEEK = '__bmt_lcs_seek'; // 插入播放器的 ±5s 按鈕
  var BLUR = 'data-__bmt_blur'; // 處理過的 strong em："1" 模糊中，"0" 已顯示
  var TOGGLE = '__bmtLcsToggle'; // 掛在 <html> 上：目前版本的切換函式；點擊委派只綁一次，呼叫的永遠是最新版
  var STEP = 5;

  // 重複點書籤：同版本的面板已存在就展開；舊版閒置時換成新版
  var old = d.getElementById(ID);
  if (old && old.__bmtPanel) {
    if (old.getAttribute('data-__bmt_ver') === VERSION) return old.__bmtPanel.expand();
    if (old.__bmtPanel.busy()) return toast('舊版面板執行中，請稍後再點一次', 'error');
    old.__bmtPanel.close();
  }
  if (old && old.parentNode) old.parentNode.removeChild(old);

  // =====================================================================
  // 1. 專注模式（移植自 lcs-podcast-focus v1.1.0）
  // =====================================================================

  /** 刪除 sticky 導覽列、播放器貼齊頂端；回傳描述字串，兩者都找不到時回傳空字串。 */
  function focusMode() {
    var navs = d.querySelectorAll('.v2-section.sticky-nav');
    for (var i = 0; i < navs.length; i++) {
      if (navs[i].parentNode) navs[i].parentNode.removeChild(navs[i]);
    }
    var player =
      d.getElementById('podcast_player_container') ||
      d.querySelector('.podcast-player-container');
    if (player) player.style.setProperty('top', '0px', 'important');

    var parts = [];
    if (navs.length) parts.push('移除 sticky-nav ×' + navs.length);
    if (player) parts.push('播放器 top → 0px');
    return parts.join('・');
  }

  // =====================================================================
  // 2. 模糊西文（strong em）：點一下顯示，再點一下模糊
  // =====================================================================

  /**
   * 設定模糊或顯示。第一次處理時記住原本的 inline filter，顯示時還原，不清掉網站自己的樣式。
   * cursor 一律維持 pointer（顯示後仍可再點一下模糊），所以不需要記原值。
   */
  function setBlur(el, on) {
    if (!el.hasAttribute(BLUR)) {
      el.__bmtOrig = [el.style.getPropertyValue('filter'), el.style.getPropertyPriority('filter')];
    }
    var o = el.__bmtOrig || ['', ''];
    if (on) {
      el.style.setProperty('filter', 'blur(10px)', 'important');
    } else if (o[0]) {
      el.style.setProperty('filter', o[0], o[1]);
    } else {
      el.style.removeProperty('filter');
    }
    el.style.setProperty('cursor', 'pointer', 'important'); // 顯示後仍可再點一下模糊
    el.setAttribute(BLUR, on ? '1' : '0');
  }

  /** 全部（含新出現的）strong em 重新模糊，回傳數量。 */
  function blurAll() {
    var els = d.querySelectorAll('strong em');
    for (var i = 0; i < els.length; i++) setBlur(els[i], true);
    return els.length;
  }

  // 點擊委派：document capture，只處理書籤處理過的元素；在連結內也不跳轉。
  // 只綁一次，但每次執行都把切換函式換成目前版本，換新版書籤後不必重新整理
  var hasToggle = !!d.documentElement[TOGGLE];
  d.documentElement[TOGGLE] = setBlur;
  if (!hasToggle) {
    d.addEventListener(
      'click',
      function (e) {
        // 修飾鍵（例如 ⌘／Ctrl＋點擊在新分頁開連結）與拖曳選取文字時不切換
        if (e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        var sel = w.getSelection && w.getSelection();
        if (sel && !sel.isCollapsed) return;
        for (var n = e.target; n && n.nodeType === 1; n = n.parentNode) {
          if (!n.hasAttribute(BLUR)) continue;
          e.preventDefault();
          d.documentElement[TOGGLE](n, n.getAttribute(BLUR) !== '1');
          return;
        }
      },
      true
    );
  }

  // =====================================================================
  // 3. ±5 秒
  // =====================================================================

  function fmt(t) {
    t = Math.floor(t);
    var h = Math.floor(t / 3600);
    var m = Math.floor((t % 3600) / 60);
    var s = t % 60;
    var mm = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    return h ? h + ':' + mm : mm;
  }

  /** 移動播放位置，限制在 0～duration；找不到 audio 時回傳 null，否則回傳新位置。 */
  function seek(delta) {
    var a = d.querySelector('audio');
    if (!a) return null;
    var t = (a.currentTime || 0) + delta;
    if (isFinite(a.duration)) t = Math.min(t, a.duration);
    t = Math.max(0, t);
    a.currentTime = t;
    return t;
  }

  function seekCmd(delta) {
    return function (ctx) {
      var t = seek(delta);
      if (t === null) toast('找不到音訊', 'error');
      else toast((delta < 0 ? '−' : '+') + Math.abs(delta) + 's → ' + fmt(t), 'success');
      ctx.done();
    };
  }

  // ---------- 播放器上的 ±5s 按鈕 ----------
  // 複製原生 15s／30s 按鈕（沿用 class 與圖示，外觀交給網站 CSS），只改文字與點擊行為
  var NATIVE = '.fbx-time-shift-button.fbx-%s:not(.' + SEEK + ')';
  var mine = []; // 這個版本插入的按鈕（只移除自己的，避免舊版清理時刪掉新版按鈕）

  /** 把按鈕內（SVG 以外）像「15s」「30s」的文字改成新秒數；文字直接放在 button 內也適用。 */
  function relabel(node, text) {
    for (var c = node.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) c.nodeValue = c.nodeValue.replace(/\d+\s*s\b/, text);
      else if (c.nodeType === 1 && c.namespaceURI !== 'http://www.w3.org/2000/svg') relabel(c, text);
    }
  }

  function makeSeekBtn(native, delta) {
    var b = native.cloneNode(true);
    // 不帶過來：重複的 id、寫著 15／30 的 title、inline on* handler、複製當下的停用狀態
    var attrs = [];
    for (var i = 0; i < b.attributes.length; i++) attrs.push(b.attributes[i].name);
    for (i = 0; i < attrs.length; i++) {
      if (/^(id|title|disabled|aria-disabled|on.*)$/i.test(attrs[i])) b.removeAttribute(attrs[i]);
    }
    b.className = b.className.replace(/\S*disabled\S*/gi, '') + ' ' + SEEK;
    b.setAttribute('type', 'button');
    b.setAttribute('aria-label', (delta < 0 ? '倒轉 ' : '快進 ') + Math.abs(delta) + ' 秒');
    b.setAttribute('data-__bmt_delta', delta);
    relabel(b, Math.abs(delta) + 's');
    return b;
  }

  // window capture 是事件最早經過的地方：在這裡處理並 stopImmediatePropagation，
  // 播放器即使在 capture 階段用 class 做委派，也不會把 clone 當成原生 15s／30s 鈕
  function onSeekClick(e) {
    for (var n = e.target; n && n.nodeType === 1; n = n.parentNode) {
      if (mine[0] !== n && mine[1] !== n) continue;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (seek(+n.getAttribute('data-__bmt_delta')) === null) toast('找不到音訊', 'error');
      return;
    }
  }
  w.addEventListener('click', onSeekClick, true);

  /** 確保播放器上有 ±5s 按鈕（重繪後補回）；回傳是否都在。 */
  function ensureSeekBtns() {
    var ok = true;
    var specs = [['backward', -STEP], ['forward', STEP]];
    for (var i = 0; i < specs.length; i++) {
      if (mine[i] && d.documentElement.contains(mine[i])) continue;
      var native = d.querySelector(NATIVE.replace('%s', specs[i][0]));
      if (!native || !native.parentNode) {
        ok = false;
        continue;
      }
      if (mine[i] && mine[i].parentNode) mine[i].parentNode.removeChild(mine[i]);
      mine[i] = makeSeekBtn(native, specs[i][1]);
      // 〔⏪ 5s〕〔⏪ 15s〕〔30s ⏩〕〔5s ⏩〕
      native.parentNode.insertBefore(mine[i], specs[i][1] < 0 ? native : native.nextSibling);
    }
    return ok;
  }

  function removeSeekBtns() {
    w.removeEventListener('click', onSeekClick, true);
    for (var i = 0; i < mine.length; i++) {
      if (mine[i] && mine[i].parentNode) mine[i].parentNode.removeChild(mine[i]);
    }
    mine = [];
  }

  // =====================================================================
  // 面板
  // =====================================================================

  createPanel({
    id: ID,
    title: 'LCS 工具',
    mini: 'LCS',
    version: VERSION,
    footer: 'v' + VERSION + ' · 拖曳標題列移動',
    commands: [
      {
        id: 'focus',
        key: '1',
        label: '專注模式',
        icon: [['path', { d: 'M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4' }]],
        run: function (ctx) {
          var msg = focusMode();
          toast(msg || '找不到目標元素', msg ? 'success' : 'error');
          ctx.done();
        }
      },
      {
        id: 'blur',
        key: '2',
        label: '重新模糊',
        icon: [['path', { d: 'M3 3l18 18' }], ['path', { d: 'M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9' }],
          ['path', { d: 'M6.6 6.6A17 17 0 0 0 2 12s4 7 10 7a9.7 9.7 0 0 0 5.4-1.6' }], ['path', { d: 'M9.9 9.9a3 3 0 0 0 4.2 4.2' }]],
        run: function (ctx) {
          var n = blurAll();
          toast(n ? '已模糊 ' + n + ' 處' : '找不到 strong em', n ? 'success' : 'error');
          ctx.done();
        }
      },
      {
        id: 'back',
        key: '3',
        label: '倒轉 5 秒',
        icon: [['path', { d: 'M11 7l-6 5 6 5z' }], ['path', { d: 'M19 7l-6 5 6 5z' }]],
        run: seekCmd(-STEP)
      },
      {
        id: 'fwd',
        key: '4',
        label: '快進 5 秒',
        icon: [['path', { d: 'M5 7l6 5-6 5z' }], ['path', { d: 'M13 7l6 5-6 5z' }]],
        run: seekCmd(STEP)
      }
    ]
  });
  var root = d.getElementById(ID);

  // =====================================================================
  // 開啟時自動執行：專注模式、模糊、插入 ±5s 按鈕
  // =====================================================================

  var focusMsg = focusMode();
  var n = blurAll();
  var btnOk = ensureSeekBtns();
  var parts = [focusMsg || '找不到導覽列與播放器', n ? '模糊 ' + n + ' 處' : '找不到 strong em',
    btnOk ? '已加入 ±5s 按鈕' : '找不到播放器按鈕'];
  toast(parts.join('・'), focusMsg || n || btnOk ? 'success' : 'error');

  // 監看頁面：播放器重繪時補回按鈕；面板被關閉或移除時，收掉按鈕並停止監看。
  // 一批變動只排一次檢查（CHECK_MS 內合併）；補回太頻繁（框架一直移除）就放棄，避免互相拉扯
  var CHECK_MS = 100;
  var MAX_REINSERT = 5; // 每 REINSERT_WINDOW 毫秒
  var REINSERT_WINDOW = 2000;
  if (w.MutationObserver) {
    var pending = false;
    var reinserts = [];
    var mo = new w.MutationObserver(function () {
      if (!pending) {
        pending = true;
        setTimeout(check, CHECK_MS);
      }
    });
    var stop = function () {
      mo.disconnect();
      removeSeekBtns();
    };
    var check = function () {
      pending = false;
      if (!d.documentElement.contains(root)) return stop();
      var before = mine.slice();
      ensureSeekBtns();
      if (mine[0] === before[0] && mine[1] === before[1]) return;
      var now = new Date().getTime();
      reinserts.push(now);
      while (reinserts.length && now - reinserts[0] > REINSERT_WINDOW) reinserts.shift();
      if (reinserts.length > MAX_REINSERT) {
        stop();
        toast('播放器按鈕一直被移除，已停止補回', 'error');
      }
    };
    mo.observe(d.body || d.documentElement, { childList: true, subtree: true });
  }
})();
