/* ==========================================================
 * 公告栏（V5）
 *
 * - 页脚「公告」按钮随时可进
 * - 打开网页后按 data.js 里 announcement.autoShow 自动弹出
 *   内容全部来自 PROFILE_DATA.announcement，改数据即可改公告
 * ========================================================== */
(function () {
  const data = window.PROFILE_DATA || {};
  const ann = data.announcement;
  const modal = document.getElementById('announcementModal');
  const openBtn = document.querySelector('[data-open-announcement]');
  if (!modal || !ann) return;

  const bodyEl = modal.querySelector('#announcementBody');
  const dateEl = modal.querySelector('#announcementDate');
  const badgeEl = modal.querySelector('#announcementBadge');
  const introEl = modal.querySelector('#announcementIntro');

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str || '');
    return div.innerHTML;
  }

  /* ---------- 渲染 ---------- */
  function render() {
    if (dateEl) dateEl.textContent = ann.date ? '更新于 ' + ann.date : '';

    if (badgeEl) {
      badgeEl.textContent = ann.badge || '';
      badgeEl.hidden = !ann.badge;
    }

    if (introEl) {
      introEl.textContent = ann.intro || '';
      introEl.hidden = !ann.intro;
    }

    bodyEl.innerHTML = (ann.sections || []).map(function (section) {
      const items = (section.items || []).map(function (text) {
        return '<li>' + escapeHtml(text) + '</li>';
      }).join('');

      return '<section class="ann__section">' +
               '<h3 class="ann__section-title">' + escapeHtml(section.title) + '</h3>' +
               '<ul class="ann__list">' + items + '</ul>' +
             '</section>';
    }).join('');
  }

  /* ---------- 打开 / 关闭 ---------- */
  function openModal() {
    render();
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = '';
  }

  if (openBtn) openBtn.addEventListener('click', openModal);

  modal.querySelectorAll('[data-close-announcement]').forEach(function (el) {
    el.addEventListener('click', closeModal);
  });

  /* ---------- 自动弹出 ---------- */
  const AUTO_KEY = 'announcement_auto';

  function shouldAutoShow() {
    const mode = ann.autoShow || 'session';
    if (mode === 'off') return false;
    if (mode === 'always') return true;

    if (mode === 'daily') {
      let today = '';
      try { today = new Date().toISOString().slice(0, 10); } catch (e) {}
      try {
        if (localStorage.getItem(AUTO_KEY) === today) return false;
        localStorage.setItem(AUTO_KEY, today);
      } catch (e) {}
      return true;
    }

    /* 默认 session：一个浏览器会话只弹一次 */
    try {
      if (sessionStorage.getItem(AUTO_KEY) === '1') return false;
      sessionStorage.setItem(AUTO_KEY, '1');
    } catch (e) {}
    return true;
  }

  if (!shouldAutoShow()) return;

  /* 等开场消息先滚出来，别一上来就盖住 */
  setTimeout(function () {
    /* 用户已经自己打开了别的弹窗，就不打扰 */
    const busy = ['communityModal', 'feedbackModal', 'changelogModal', 'registerModal']
      .some(function (id) {
        const m = document.getElementById(id);
        return m && !m.hidden;
      });
    if (busy || !modal.hidden) return;
    openModal();
  }, 1400);
})();
