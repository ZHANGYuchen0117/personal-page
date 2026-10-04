/* ==========================================================
 * 反馈模块：弹窗 + 提交到 Supabase
 * ========================================================== */

(function () {
  const cfg = window.SUPABASE_CONFIG || {};
  const modal = document.getElementById('feedbackModal');
  const openBtn = document.querySelector('[data-open-feedback]');
  const form = document.getElementById('feedbackForm');
  const status = document.getElementById('fbStatus');
  const contentEl = document.getElementById('fbContent');
  const contactEl = document.getElementById('fbContact');
  const submitBtn = form ? form.querySelector('.fb-submit') : null;
  const chips = form ? form.querySelectorAll('.fb-chip') : [];

  if (!modal || !form) return;

  let currentType = '建议';

  function openModal() {
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(function () { contentEl && contentEl.focus(); }, 120);
  }

  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = '';
    status.textContent = '';
    status.className = 'fb-status';
  }

  if (openBtn) openBtn.addEventListener('click', openModal);
  modal.querySelectorAll('[data-close-feedback]').forEach(function (el) {
    el.addEventListener('click', closeModal);
  });
  /* Esc 关闭由 app.js 统一处理（V3），这里不再重复绑定 */

  /* ---------- V4 反馈闭环：本机回执 ---------- */
  const HISTORY_KEY = 'fb_history';
  const historySection = document.getElementById('fbHistorySection');
  const historyList = document.getElementById('fbHistory');
  const clearBtn = document.querySelector('[data-clear-feedback]');

  function readHistory() {
    try {
      const arr = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function writeHistory(arr) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(arr.slice(0, 5))); } catch (e) {}
  }

  function timeAgo(ts) {
    const gap = Math.max(0, Date.now() - ts);
    if (gap < 60000) return '刚刚';
    if (gap < 3600000) return Math.floor(gap / 60000) + ' 分钟前';
    if (gap < 86400000) return Math.floor(gap / 3600000) + ' 小时前';
    return Math.floor(gap / 86400000) + ' 天前';
  }

  function renderHistory() {
    if (!historySection || !historyList) return;
    const arr = readHistory();
    historySection.hidden = arr.length === 0;
    historyList.innerHTML = arr.map(function (item) {
      const text = String(item.content || '').slice(0, 40);
      return '<li class="fb-history__item">' +
        '<span class="fb-history__type">' + (item.type || '建议') + '</span>' +
        '<span class="fb-history__text">' + text.replace(/[<>&]/g, function (c) {
          return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c];
        }) + (String(item.content || '').length > 40 ? '…' : '') + '</span>' +
        '<span class="fb-history__meta">已收到 · ' + timeAgo(item.t || 0) + '</span>' +
        '</li>';
    }).join('');
  }

  function pushHistory(type, content) {
    const arr = readHistory();
    arr.unshift({ type: type, content: content, t: Date.now() });
    writeHistory(arr);
    renderHistory();
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      writeHistory([]);
      renderHistory();
    });
  }

  renderHistory();

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      chips.forEach(function (c) { c.classList.remove('is-active'); });
      chip.classList.add('is-active');
      currentType = chip.dataset.type || '其他';
    });
  });

  function setStatus(text, kind) {
    status.textContent = text;
    status.className = 'fb-status' + (kind ? ' is-' + kind : '');
  }

  function checkCooldown() {
    try {
      const last = parseInt(localStorage.getItem('fb_last') || '0', 10);
      const gap = Date.now() - last;
      if (gap < 60000) return Math.ceil((60000 - gap) / 1000);
    } catch (e) {}
    return 0;
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    const honey = form.querySelector('input[name="website"]');
    if (honey && honey.value) {
      setStatus('提交成功，谢谢', 'ok');
      return;
    }

    const content = contentEl.value.trim();
    if (!content) {
      setStatus('内容不能为空', 'err');
      return;
    }
    if (content.length > 2000) {
      setStatus('内容太长，请控制在 2000 字以内', 'err');
      return;
    }

    const wait = checkCooldown();
    if (wait > 0) {
      setStatus('提交太频繁，请 ' + wait + ' 秒后再试', 'err');
      return;
    }

    if (!cfg.url || !cfg.anonKey) {
      setStatus('后台还没配置好，请稍后再试', 'err');
      return;
    }

    submitBtn.disabled = true;
    setStatus('提交中…');

    try {
      const res = await fetch(cfg.url + '/rest/v1/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': cfg.anonKey,
          'Authorization': 'Bearer ' + cfg.anonKey,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          type: currentType,
          content: content,
          contact: contactEl.value.trim() || null
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || ('HTTP ' + res.status));
      }

      try { localStorage.setItem('fb_last', String(Date.now())); } catch (e) {}
      pushHistory(currentType, content);   /* V4：留下本机回执 */

      setStatus('收到了，谢谢你的反馈', 'ok');
      contentEl.value = '';
      contactEl.value = '';
      setTimeout(closeModal, 1400);
    } catch (err) {
      console.error('[feedback]', err);
      setStatus('提交失败，请稍后再试', 'err');
    } finally {
      submitBtn.disabled = false;
    }
  });
})();