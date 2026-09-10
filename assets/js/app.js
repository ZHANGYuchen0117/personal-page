(function () {
  const data = window.PROFILE_DATA || {};

  /* ---------- 主题切换 ---------- */
  const themeBtn = document.querySelector('[data-toggle-theme]');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      const cur = document.documentElement.getAttribute('data-theme');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
    });
  }

  /* ---------- 姓名 / 标语（如果页面其他位置也用到） ---------- */
  document.querySelectorAll('[data-profile="name"]').forEach(function (el) {
    el.textContent = data.name || el.textContent;
  });

  /* ---------- 修改日志弹窗 ---------- */
  const modal = document.getElementById('changelogModal');
  const sub = document.getElementById('changelogSub');
  const body = document.getElementById('changelogBody');
  const openBtn = document.querySelector('[data-open-changelog]');

  function renderChangelog() {
    const log = data.changelog || {};

    sub.textContent = '创建于 ' + (log.date || '') + ' · 当前版本：' + (log.version || '');

    body.innerHTML = (log.groups || []).map(function (group) {
      const items = (group.items || []).map(function (item) {
        return '<li class="' + (item.done ? 'is-done' : 'is-todo') + '">' + item.text + '</li>';
      }).join('');

      return (
        '<section class="log-entry">' +
          '<h3 class="log-entry__title">' + group.title + '</h3>' +
          '<ul class="log-entry__list">' + items + '</ul>' +
        '</section>'
      );
    }).join('');
  }

  function openModal() {
    if (!modal) return;
    renderChangelog();
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = '';
  }

  if (openBtn) openBtn.addEventListener('click', openModal);

  if (modal) {
    modal.querySelectorAll('[data-close-modal]').forEach(function (el) {
      el.addEventListener('click', closeModal);
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal && !modal.hidden) closeModal();
  });
})();