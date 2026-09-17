/* ==========================================================
 * 社区聊天：读写 Supabase community_messages 表
 * 用轮询实现"接近实时"的效果
 * ========================================================== */

(function () {
  const cfg = window.SUPABASE_CONFIG || {};
  const modal = document.getElementById('communityModal');
  const openBtn = document.querySelector('[data-open-community]');
  if (!modal || !openBtn) return;

  const listEl = modal.querySelector('#communityList');
  const inputEl = modal.querySelector('#communityInput');
  const nickEl = modal.querySelector('#communityNickname');
  const sendBtn = modal.querySelector('#communitySend');
  const statusEl = modal.querySelector('#communityStatus');

  // 本机唯一 ID，用来区分"我发的"和"别人发的"
  let clientId = '';
  try {
    clientId = localStorage.getItem('community_client_id') || '';
    if (!clientId) {
      clientId = 'u_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('community_client_id', clientId);
    }
  } catch (e) {
    clientId = 'u_anon';
  }

  // 昵称记忆
  try {
    const saved = localStorage.getItem('community_nickname');
    if (saved) nickEl.value = saved;
  } catch (e) {}

  const seenIds = new Set();
  let lastTime = null;
  let pollTimer = null;
  let isOpen = false;

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  function renderMessage(msg) {
    if (seenIds.has(msg.id)) return;
    seenIds.add(msg.id);

    const empty = listEl.querySelector('.community__empty');
    if (empty) empty.remove();

    const row = document.createElement('div');
    row.className = 'community__msg';
    if (msg.client_id && msg.client_id === clientId) row.classList.add('is-me');

    row.innerHTML =
      '<div class="community__nick">' + escapeHtml(msg.nickname || '访客') + '</div>' +
      '<div class="community__text">' + escapeHtml(msg.content) + '</div>';

    listEl.appendChild(row);
  }

  function scrollToBottom() {
    listEl.scrollTop = listEl.scrollHeight;
  }

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

  async function sendMessage() {
    const content = inputEl.value.trim();
    if (!content) return;

    const nickname = (nickEl.value.trim() || '访客').slice(0, 20);
    try { localStorage.setItem('community_nickname', nickname); } catch (e) {}

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
          nickname: nickname,
          content: content,
          client_id: clientId
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

  function openModal() {
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    isOpen = true;

    fetchMessages(true).then(function () {
      scrollToBottom();
      pollTimer = setInterval(function () { fetchMessages(false); }, 3500);
    });

    setTimeout(function () { inputEl.focus(); }, 160);
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

  openBtn.addEventListener('click', openModal);
  modal.querySelectorAll('[data-close-community]').forEach(function (el) {
    el.addEventListener('click', closeModal);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen) closeModal();
  });

  sendBtn.addEventListener('click', sendMessage);
  inputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
})();