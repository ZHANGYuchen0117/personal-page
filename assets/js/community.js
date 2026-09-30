/* ==========================================================
 * 社区聊天 V2.2：注册 + 发言 + Storage 头像 + 实时推送 + 分页
 * ========================================================== */

(function () {
  const cfg = window.SUPABASE_CONFIG || {};
  const modal = document.getElementById('communityModal');
  const openBtn = document.querySelector('[data-open-community]');
  const regModal = document.getElementById('registerModal');
  if (!modal || !openBtn || !regModal) return;

  const listEl = modal.querySelector('#communityList');
  const inputEl = modal.querySelector('#communityInput');
  const sendBtn = modal.querySelector('#communitySend');
  const statusEl = modal.querySelector('#communityStatus');
  const guestEl = modal.querySelector('#communityGuest');
  const composeEl = modal.querySelector('#communityCompose');
  const meAvatarEl = modal.querySelector('#communityMeAvatar');
  const meNameEl = modal.querySelector('#communityMeName');
  const logoutBtn = modal.querySelector('#communityLogout');

  // 注册表单
  const regForm = regModal.querySelector('#registerForm');
  const regAvatarInput = regModal.querySelector('#regAvatar');
  const regAvatarPreview = regModal.querySelector('#regAvatarPreview');
  const regName = regModal.querySelector('#regName');
  const regPhone = regModal.querySelector('#regPhone');
  const regEmail = regModal.querySelector('#regEmail');
  const regStatus = regModal.querySelector('#regStatus');
  const regSubmit = regModal.querySelector('#regSubmit');

  const DEFAULT_AVATAR =
    'data:image/svg+xml;utf8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">' +
      '<rect width="40" height="40" fill="#d8d8d4"/>' +
      '<circle cx="20" cy="16" r="7" fill="#8a8a86"/>' +
      '<path d="M6 37c2-7 8-11 14-11s12 4 14 11z" fill="#8a8a86"/>' +
      '</svg>'
    );

  const PAGE_SIZE = 20;          // 每页消息数
  const AVATAR_BUCKET = 'avatars';

  let currentUser = null;
  let pendingAvatar = null;      // { dataUrl, blob }
  let seenIds = new Set();
  let lastTime = null;           // 最新一条时间（增量拉取用）
  let oldestTime = null;         // 最旧一条时间（向上翻页用）
  let hasMore = false;
  let loadingOlder = false;
  let loadedOnce = false;        // 首屏是否已加载过（重开弹窗只做增量）
  let pollTimer = null;
  let isOpen = false;

  /* ---------- 分页按钮：列表顶部 ---------- */
  const moreBtn = document.createElement('button');
  moreBtn.type = 'button';
  moreBtn.className = 'community__more';
  moreBtn.hidden = true;
  moreBtn.textContent = '加载更早的消息';
  listEl.insertBefore(moreBtn, listEl.firstChild);
  moreBtn.addEventListener('click', function () { loadOlder(); });

  function updateMoreBtn() {
    moreBtn.disabled = false;
    moreBtn.hidden = !hasMore;
    moreBtn.textContent = '加载更早的消息';
  }

  /* ---------- V3 手势：在顶部下拉刷新 ---------- */
  const refreshHint = document.createElement('div');
  refreshHint.className = 'community__refresh';
  refreshHint.hidden = true;
  refreshHint.textContent = '下拉刷新';
  listEl.insertBefore(refreshHint, listEl.firstChild);

  let pullStartY = null;
  let pullDy = 0;
  let refreshing = false;

  listEl.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1 || refreshing || listEl.scrollTop > 4) {
      pullStartY = null;
      return;
    }
    pullStartY = e.touches[0].clientY;
    pullDy = 0;
  }, { passive: true });

  listEl.addEventListener('touchmove', function (e) {
    if (pullStartY === null || refreshing) return;
    const dy = e.touches[0].clientY - pullStartY;

    if (dy <= 0 || listEl.scrollTop > 4) {
      pullDy = 0;
      refreshHint.hidden = true;
      return;
    }
    pullDy = Math.min(dy, 90);
    refreshHint.hidden = false;
    refreshHint.style.setProperty('--pull', pullDy + 'px');
    refreshHint.textContent = pullDy > 60 ? '松开刷新' : '下拉刷新';
    if (dy > 10 && e.cancelable) e.preventDefault();   // 跟手，不带动页面回弹
  }, { passive: false });

  listEl.addEventListener('touchend', function () {
    if (pullStartY === null) return;
    const pulled = pullDy;
    pullStartY = null;
    pullDy = 0;

    if (pulled > 60 && !refreshing) {
      refreshing = true;
      refreshHint.hidden = false;
      refreshHint.textContent = '正在刷新…';
      Promise.resolve(fetchNew())
        .catch(function () {})
        .then(function () {
          refreshHint.textContent = '已是最新';
          setTimeout(function () {
            refreshHint.hidden = true;
            refreshHint.style.removeProperty('--pull');
            refreshing = false;
          }, 700);
        });
    } else {
      refreshHint.hidden = true;
      refreshHint.style.removeProperty('--pull');
    }
  });

  /* ---------- V3 滚动位置记忆：重开弹窗接着上次看的位置 ---------- */
  const SCROLL_KEY = 'community_scroll';
  let scrollSaveTimer = null;

  /* V3：程序性滚动（加载完成 / 追加消息）不算"用户看的位置"，
     否则会把"在底部"写进记忆，覆盖掉下次要恢复的位置 */
  let programScrollUntil = 0;

  function programScroll(fn) {
    programScrollUntil = Date.now() + 350;
    fn();
  }

  function saveListScroll() {
    if (Date.now() < programScrollUntil) return;
    try {
      sessionStorage.setItem(SCROLL_KEY, JSON.stringify({
        top: listEl.scrollTop,
        atBottom: isNearBottom()
      }));
    } catch (e) {}
  }

  listEl.addEventListener('scroll', function () {
    clearTimeout(scrollSaveTimer);
    scrollSaveTimer = setTimeout(saveListScroll, 200);
  });

  function restoreListScroll() {
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(SCROLL_KEY) || 'null'); } catch (e) {}
    /* top 为 0 也是有效位置（当时停在最上面） */
    if (!saved || saved.atBottom) return;
    programScroll(function () { listEl.scrollTop = saved.top; });
    /* 位置失效（消息比当时少）就退回底部 */
    if (Math.abs(listEl.scrollTop - saved.top) > 12) scrollToBottom();
  }

  /* ---------- 用户状态 ---------- */
  function loadUser() {
    try {
      const raw = localStorage.getItem('community_user');
      if (!raw) return null;
      const u = JSON.parse(raw);
      if (u && u.id && u.name) return u;
    } catch (e) {}
    return null;
  }

  function saveUser(u) {
    try {
      if (u) localStorage.setItem('community_user', JSON.stringify(u));
      else localStorage.removeItem('community_user');
    } catch (e) {}
  }

  function updateUI() {
    if (currentUser) {
      guestEl.hidden = true;
      composeEl.hidden = false;
      meNameEl.textContent = currentUser.name;
      meAvatarEl.src = currentUser.avatar || DEFAULT_AVATAR;
    } else {
      guestEl.hidden = false;
      composeEl.hidden = true;
    }
  }

  /* ---------- 通用 ---------- */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str || '');
    return div.innerHTML;
  }

  function scrollToBottom() {
    programScroll(function () { listEl.scrollTop = listEl.scrollHeight; });
  }

  /* ---------- 渲染消息 ----------
   * prepend=true 时插到分页按钮之后（用于"加载更早"） */
  function renderMessage(msg, prepend) {
    if (!msg || !msg.id || seenIds.has(msg.id)) return null;
    seenIds.add(msg.id);

    const empty = listEl.querySelector('.community__empty');
    if (empty) empty.remove();

    const row = document.createElement('div');
    row.className = 'community__msg';
    if (currentUser && msg.user_id === currentUser.id) {
      row.classList.add('is-me');
    }

    const avatar = msg.avatar || DEFAULT_AVATAR;

    row.innerHTML =
      '<img class="community__msg-avatar" src="' + avatar + '" alt="" />' +
      '<div class="community__msg-body">' +
        '<div class="community__nick">' + escapeHtml(msg.nickname || '访客') + '</div>' +
        '<div class="community__text">' + escapeHtml(msg.content) + '</div>' +
      '</div>';

    // 头像加载失败（比如早期内嵌图或链接失效）就回退默认头像
    const img = row.querySelector('.community__msg-avatar');
    img.addEventListener('error', function () {
      img.src = DEFAULT_AVATAR;
    }, { once: true });

    if (prepend) listEl.insertBefore(row, moreBtn.nextSibling);
    else listEl.appendChild(row);

    return row;
  }

  function isNearBottom() {
    return listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 120;
  }

  /* ---------- 拉取消息：分页 + 增量 ---------- */
  async function fetchPage(query) {
    const res = await fetch(cfg.url + '/rest/v1/community_messages?' + query, {
      headers: {
        'apikey': cfg.anonKey,
        'Authorization': 'Bearer ' + cfg.anonKey
      }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  /* 首屏：只取最新一页（多取 1 条判断还有没有更早的） */
  async function loadInitial() {
    if (!cfg.url || !cfg.anonKey) return;
    const rows = await fetchPage('select=*&order=created_at.desc&limit=' + (PAGE_SIZE + 1));
    const more = rows.length > PAGE_SIZE;
    const page = (more ? rows.slice(0, PAGE_SIZE) : rows).reverse();

    page.forEach(function (m) { renderMessage(m); });
    if (page.length) lastTime = page[page.length - 1].created_at;

    // 分页状态只在第一次首屏加载时初始化
    if (!oldestTime) {
      if (page.length) oldestTime = page[0].created_at;
      hasMore = more;
      updateMoreBtn();
    }
    scrollToBottom();
  }

  /* 向上翻页：加载更早的消息 */
  async function loadOlder() {
    if (!cfg.url || !cfg.anonKey || loadingOlder || !hasMore || !oldestTime) return;
    loadingOlder = true;
    moreBtn.disabled = true;
    moreBtn.textContent = '加载中…';

    try {
      const rows = await fetchPage(
        'select=*&order=created_at.desc&created_at=lt.' + encodeURIComponent(oldestTime) +
        '&limit=' + (PAGE_SIZE + 1)
      );
      const more = rows.length > PAGE_SIZE;
      const page = (more ? rows.slice(0, PAGE_SIZE) : rows).reverse();

      const prevHeight = listEl.scrollHeight;
      const prevTop = listEl.scrollTop;

      // 倒着插：每条都插在分页按钮后面，最终顺序才是从旧到新
      page.slice().reverse().forEach(function (m) { renderMessage(m, true); });
      if (page.length) oldestTime = page[0].created_at;

      hasMore = more;
      // 新内容加在顶部：补偿滚动位置，视觉上不跳动
      programScroll(function () { listEl.scrollTop = prevTop + (listEl.scrollHeight - prevHeight); });
    } catch (e) {
      console.error('[community]', e);
    } finally {
      loadingOlder = false;
      updateMoreBtn();
    }
  }

  /* 增量：只捞比本地最新一条更新的（轮询兜底用） */
  async function fetchNew() {
    if (!cfg.url || !cfg.anonKey) return;
    if (!lastTime) return loadInitial();   // 此前一条都没有：直接刷新首屏
    const rows = await fetchPage(
      'select=*&order=created_at.asc&created_at=gt.' + encodeURIComponent(lastTime) + '&limit=50'
    );
    if (!rows.length) return;

    const stick = isNearBottom();
    rows.forEach(function (m) { renderMessage(m); });
    lastTime = rows[rows.length - 1].created_at;
    if (stick) scrollToBottom();
  }

  /* ---------- 实时推送（Supabase Realtime，WebSocket 直连） ---------- */
  let ws = null;
  let wsRef = 0;
  let wsJoined = false;
  let wsTries = 0;
  let wsRetryTimer = null;
  let heartbeatTimer = null;

  function realtimeUrl() {
    return cfg.url.replace(/^http/, 'ws') +
      '/realtime/v1/websocket?apikey=' + encodeURIComponent(cfg.anonKey) + '&vsn=1.0.0';
  }

  function onIncoming(rec) {
    if (!rec || !rec.id) return;
    const stick = isNearBottom();
    const row = renderMessage(rec);
    if (!row) return;
    if (rec.created_at && (!lastTime || rec.created_at > lastTime)) {
      lastTime = rec.created_at;
    }
    if (stick) scrollToBottom();
  }

  function startRealtime() {
    if (!cfg.url || !cfg.anonKey || ws) return;

    let socket;
    try {
      socket = new WebSocket(realtimeUrl());
    } catch (e) {
      scheduleRealtime();
      return;
    }
    ws = socket;

    socket.onopen = function () {
      wsTries = 0;
      wsRef += 1;
      socket.send(JSON.stringify({
        topic: 'realtime:public:community_messages',
        event: 'phx_join',
        payload: {
          config: {
            broadcast: { ack: false, self: false },
            presence: { key: '' },
            postgres_changes: [
              { event: 'INSERT', schema: 'public', table: 'community_messages' }
            ]
          },
          access_token: cfg.anonKey
        },
        ref: String(wsRef)
      }));

      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(function () {
        if (socket.readyState === WebSocket.OPEN) {
          wsRef += 1;
          socket.send(JSON.stringify({
            topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(wsRef)
          }));
        }
      }, 25000);
    };

    socket.onmessage = function (evt) {
      let msg;
      try { msg = JSON.parse(evt.data); } catch (e) { return; }

      if (msg.event === 'phx_reply' && msg.payload && msg.payload.status === 'ok') {
        wsJoined = true;
        return;
      }
      if (msg.event === 'postgres_changes') {
        const p = msg.payload || {};
        const d = p.data || p;
        const rec = d.record || d.new;
        if (rec) onIncoming(rec);
      }
    };

    socket.onclose = function () {
      if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
      ws = null;
      wsJoined = false;
      scheduleRealtime();
    };
  }

  function scheduleRealtime() {
    if (!isOpen || wsRetryTimer) return;
    wsTries += 1;
    const delay = Math.min(1000 * Math.pow(2, Math.min(wsTries, 4)), 15000);
    wsRetryTimer = setTimeout(function () {
      wsRetryTimer = null;
      startRealtime();
    }, delay);
  }

  function stopRealtime() {
    if (wsRetryTimer) { clearTimeout(wsRetryTimer); wsRetryTimer = null; }
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    wsJoined = false;
    wsTries = 0;
    if (ws) {
      const socket = ws;
      ws = null;
      try { socket.close(); } catch (e) {}
    }
  }

  /* ---------- 发送消息 ---------- */
  async function sendMessage() {
    if (!currentUser) {
      statusEl.textContent = '请先注册';
      return;
    }
    const content = inputEl.value.trim();
    if (!content) return;

    if (!cfg.url || !cfg.anonKey) {
      statusEl.textContent = '后台未配置';
      return;
    }

    inputEl.value = '';
    sendBtn.disabled = true;
    statusEl.textContent = '';

    try {
      const res = await fetch(cfg.url + '/rest/v1/community_messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': cfg.anonKey,
          'Authorization': 'Bearer ' + cfg.anonKey,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          nickname: currentUser.name,
          content: content,
          user_id: currentUser.id,
          avatar: currentUser.avatar || null
        })
      });

      if (!res.ok) throw new Error('HTTP ' + res.status);
      const rows = await res.json();
      if (rows && rows[0]) {
        renderMessage(rows[0]);
        lastTime = rows[0].created_at;
        scrollToBottom();
      }
    } catch (e) {
      statusEl.textContent = '发送失败，请稍后再试';
      console.error('[community]', e);
    } finally {
      sendBtn.disabled = false;
      inputEl.focus();
    }
  }

  /* ---------- 打开 / 关闭社区 ---------- */
  function openModal() {
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    isOpen = true;
    updateUI();

    const firstLoad = loadedOnce
      ? fetchNew()
      : loadInitial().then(function () { loadedOnce = true; });
    /* V3：加载完成后恢复上次的滚动位置 */
    firstLoad.then(restoreListScroll).catch(function (e) { console.error('[community]', e); });

    startRealtime();

    // 轮询兜底：实时连上就跳过，连不上时 5 秒兜一次
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(function () {
      if (wsJoined) return;
      fetchNew().catch(function () {});
    }, 5000);

    if (currentUser) setTimeout(function () { inputEl.focus(); }, 160);
  }

  function closeModal() {
    saveListScroll();
    modal.hidden = true;
    document.body.style.overflow = '';
    isOpen = false;
    stopRealtime();
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  /* ---------- 打开 / 关闭注册 ---------- */
  function openReg() {
    regModal.hidden = false;
    document.body.style.overflow = 'hidden';
    pendingAvatar = null;
    regAvatarPreview.src = DEFAULT_AVATAR;
    regForm.reset();
    regStatus.textContent = '';
    regStatus.className = 'fb-status';
    setTimeout(function () { regName.focus(); }, 160);
  }

  function closeReg() {
    regModal.hidden = true;
    if (!modal.hidden) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
  }

  /* ---------- 头像处理：压缩到 128x128 ---------- */
  function processAvatar(file) {
    return new Promise(function (resolve, reject) {
      if (!file) return resolve(null);
      if (!file.type || file.type.indexOf('image/') !== 0) {
        return reject(new Error('请选择图片文件'));
      }
      if (file.size > 5 * 1024 * 1024) {
        return reject(new Error('图片不能超过 5MB'));
      }

      const reader = new FileReader();
      reader.onload = function () {
        const img = new Image();
        img.onload = function () {
          const size = 128;
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');

          const scale = Math.max(size / img.width, size / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);

          const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
          if (typeof canvas.toBlob !== 'function') {
            return resolve({ dataUrl: dataUrl, blob: null });   // 老浏览器退回内嵌图
          }
          canvas.toBlob(function (blob) {
            resolve({ dataUrl: dataUrl, blob: blob });
          }, 'image/jpeg', 0.82);
        };
        img.onerror = function () { reject(new Error('图片无法读取')); };
        img.src = reader.result;
      };
      reader.onerror = function () { reject(new Error('文件读取失败')); };
      reader.readAsDataURL(file);
    });
  }

  /* ---------- 头像上传：Supabase Storage ---------- */
  async function uploadAvatar(avatar, userId) {
    if (!avatar || !avatar.blob) return (avatar && avatar.dataUrl) || null;

    const path = userId + '.jpg';
    const res = await fetch(cfg.url + '/storage/v1/object/' + AVATAR_BUCKET + '/' + path, {
      method: 'POST',
      headers: {
        'apikey': cfg.anonKey,
        'Authorization': 'Bearer ' + cfg.anonKey,
        'Content-Type': 'image/jpeg',
        'cache-control': 'max-age=31536000'
      },
      body: avatar.blob
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);

    return cfg.url + '/storage/v1/object/public/' + AVATAR_BUCKET + '/' + path;
  }

  /* ---------- 生成用户 ID ----------
   * community_users 表不开放读取（保护手机号 / 邮箱），
   * 所以注册时用 return=minimal，ID 由客户端生成（uuid v4）。 */
  function uuidv4() {
    if (window.crypto && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    const bytes = new Uint8Array(16);
    if (window.crypto && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.prototype.map.call(bytes, function (b) {
      return ('0' + b.toString(16)).slice(-2);
    }).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) +
           '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  }

  /* ---------- 注册提交 ---------- */
  regAvatarInput.addEventListener('change', async function () {
    const file = regAvatarInput.files && regAvatarInput.files[0];
    if (!file) return;
    try {
      pendingAvatar = await processAvatar(file);
      regAvatarPreview.src = pendingAvatar.dataUrl;
    } catch (err) {
      regStatus.textContent = err.message;
      regStatus.className = 'fb-status is-err';
    }
  });

  regForm.addEventListener('submit', async function (e) {
    e.preventDefault();

    const name = regName.value.trim();
    const phone = regPhone.value.trim();
    const email = regEmail.value.trim();

    if (!name || name.length > 20) {
      regStatus.textContent = '昵称需要 1-20 个字';
      regStatus.className = 'fb-status is-err';
      return;
    }
    if (!/^[\d\-\+\s()]{6,20}$/.test(phone)) {
      regStatus.textContent = '请填写有效的手机号';
      regStatus.className = 'fb-status is-err';
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      regStatus.textContent = '请填写有效的邮箱';
      regStatus.className = 'fb-status is-err';
      return;
    }
    if (!cfg.url || !cfg.anonKey) {
      regStatus.textContent = '后台未配置';
      regStatus.className = 'fb-status is-err';
      return;
    }

    regSubmit.disabled = true;
    regStatus.className = 'fb-status';

    const userId = uuidv4();

    // 头像优先上传到 Storage；上传失败退回内嵌压缩图，保证注册永远能用
    let avatarValue = null;
    if (pendingAvatar) {
      regStatus.textContent = '上传头像…';
      try {
        avatarValue = await uploadAvatar(pendingAvatar, userId);
      } catch (err) {
        console.warn('[community] 头像上传失败，回退内嵌图片', err);
        avatarValue = pendingAvatar.dataUrl || null;
      }
    }

    regStatus.textContent = '注册中…';

    try {
      const res = await fetch(cfg.url + '/rest/v1/community_users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': cfg.anonKey,
          'Authorization': 'Bearer ' + cfg.anonKey,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          id: userId,
          name: name,
          phone: phone,
          email: email,
          avatar: avatarValue
        })
      });

      if (!res.ok) throw new Error('HTTP ' + res.status);

      currentUser = {
        id: userId,
        name: name,
        avatar: avatarValue
      };
      saveUser(currentUser);
      updateUI();

      regStatus.textContent = '注册成功';
      regStatus.className = 'fb-status is-ok';
      setTimeout(function () {
        closeReg();
        if (currentUser) inputEl.focus();
      }, 800);
    } catch (err) {
      console.error('[community register]', err);
      regStatus.textContent = '注册失败，请稍后再试';
      regStatus.className = 'fb-status is-err';
    } finally {
      regSubmit.disabled = false;
    }
  });

  /* ---------- 事件绑定 ---------- */
  openBtn.addEventListener('click', openModal);
  modal.querySelectorAll('[data-close-community]').forEach(function (el) {
    el.addEventListener('click', closeModal);
  });
  modal.querySelector('#communityRegisterBtn').addEventListener('click', openReg);
  regModal.querySelectorAll('[data-close-register]').forEach(function (el) {
    el.addEventListener('click', closeReg);
  });

  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      if (!confirm('确定退出当前账号？')) return;
      currentUser = null;
      saveUser(null);
      updateUI();
    });
  }

  /* Esc 关闭交给 app.js 的统一键盘处理（V3），此处不再重复绑定 */

  sendBtn.addEventListener('click', sendMessage);
  inputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  /* ---------- 初始化 ---------- */
  currentUser = loadUser();
  updateUI();
})();