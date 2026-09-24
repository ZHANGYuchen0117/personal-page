/* ==========================================================
 * 社区聊天 V2.1：注册 + 发言
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

  let currentUser = null;
  let pendingAvatar = null;
  let seenIds = new Set();
  let lastTime = null;
  let pollTimer = null;
  let isOpen = false;

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
    listEl.scrollTop = listEl.scrollHeight;
  }

  /* ---------- 渲染消息 ---------- */
  function renderMessage(msg) {
    if (!msg || !msg.id || seenIds.has(msg.id)) return;
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

    listEl.appendChild(row);
  }

  /* ---------- 拉取消息 ---------- */
  async function fetchMessages(initial) {
    if (!cfg.url || !cfg.anonKey) return;

    let url = cfg.url + '/rest/v1/community_messages?select=*';
    if (initial) {
      url += '&order=created_at.desc&limit=100';
    } else if (lastTime) {
      url += '&order=created_at.asc&created_at=gt.' + encodeURIComponent(lastTime);
    } else {
      return;
    }

    try {
      const res = await fetch(url, {
        headers: {
          'apikey': cfg.anonKey,
          'Authorization': 'Bearer ' + cfg.anonKey
        }
      });
      if (!res.ok) return;

      let rows = await res.json();
      if (initial) rows = rows.reverse();

      rows.forEach(renderMessage);

      if (rows.length) {
        lastTime = rows[rows.length - 1].created_at;
        scrollToBottom();
      }
    } catch (e) {
      console.error('[community]', e);
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

    fetchMessages(true).then(function () {
      scrollToBottom();
      pollTimer = setInterval(function () { fetchMessages(false); }, 3500);
    });

    if (currentUser) setTimeout(function () { inputEl.focus(); }, 160);
  }

  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = '';
    isOpen = false;
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

          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.onerror = function () { reject(new Error('图片无法读取')); };
        img.src = reader.result;
      };
      reader.onerror = function () { reject(new Error('文件读取失败')); };
      reader.readAsDataURL(file);
    });
  }

  /* ---------- 注册提交 ---------- */
  regAvatarInput.addEventListener('change', async function () {
    const file = regAvatarInput.files && regAvatarInput.files[0];
    if (!file) return;
    try {
      pendingAvatar = await processAvatar(file);
      regAvatarPreview.src = pendingAvatar;
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
    regStatus.textContent = '注册中…';
    regStatus.className = 'fb-status';

    try {
      const res = await fetch(cfg.url + '/rest/v1/community_users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': cfg.anonKey,
          'Authorization': 'Bearer ' + cfg.anonKey,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          name: name,
          phone: phone,
          email: email,
          avatar: pendingAvatar
        })
      });

      if (!res.ok) throw new Error('HTTP ' + res.status);

      const rows = await res.json();
      const user = rows && rows[0];
      if (!user || !user.id) throw new Error('注册返回异常');

      currentUser = {
        id: user.id,
        name: user.name,
        avatar: user.avatar || null
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

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!regModal.hidden) { closeReg(); return; }
    if (isOpen) closeModal();
  });

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