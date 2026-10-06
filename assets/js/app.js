(function () {
  const data = window.PROFILE_DATA || {};

  /* ---------- 主题切换 ---------- */
  function syncThemeColor(theme) {
    const meta = document.getElementById('themeColor');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#141413' : '#f4f3f1');
  }

  const themeBtn = document.querySelector('[data-toggle-theme]');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      const cur = document.documentElement.getAttribute('data-theme');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      syncThemeColor(next);
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

  /* ---------- V3 键盘操作：Esc 关闭任意弹窗 + Tab 焦点循环 ---------- */
  /* 顺序 = 叠放顺序，最后一个是「最上层」，Esc 优先关它。
     V5：补上公告栏；注册弹窗的真实 id 是 registerModal（原来写的
     communityRegisterModal 根本取不到元素，导致注册弹窗按 Esc 关不掉） */
  const MODALS = ['communityModal', 'feedbackModal', 'changelogModal', 'announcementModal', 'registerModal'];

  function visibleModals() {
    return MODALS.map(function (id) { return document.getElementById(id); })
      .filter(function (m) { return m && !m.hidden; });
  }

  document.addEventListener('keydown', function (e) {
    const open = visibleModals();
    if (!open.length) return;
    const top = open[open.length - 1];

    if (e.key === 'Escape') {
      const closeBtn = top.querySelector('.modal__close');
      if (closeBtn) closeBtn.click();
      return;
    }

    if (e.key === 'Tab') {
      const panel = top.querySelector('.modal__panel') || top;
      const all = panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      const list = Array.prototype.filter.call(all, function (el) {
        return !el.disabled && el.offsetParent !== null;
      });
      if (!list.length) return;

      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;

      if (!panel.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  /* ---------- V3 焦点管理：打开时移入弹窗，关闭后还给触发按钮 ---------- */
  const triggers = {};

  /* 记录最后一次点击的可聚焦元素：脚本触发打开时也能正确回焦 */
  let lastClicked = null;
  document.addEventListener('click', function (e) {
    const el = e.target && e.target.closest ? e.target.closest('button, [href], [tabindex]') : null;
    if (el) lastClicked = el;
  }, true);

  MODALS.forEach(function (id) {
    const m = document.getElementById(id);
    if (!m) return;

    new MutationObserver(function () {
      if (!m.hidden) {
        const active = document.activeElement;
        const trigger =
          (active && active !== document.body && !m.contains(active)) ? active : lastClicked;
        if (trigger && !m.contains(trigger)) triggers[id] = trigger;

        const panel = m.querySelector('.modal__panel') || m;
        if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1');
        panel.focus();
      } else {
        const t = triggers[id];
        if (t && document.contains(t) && t.offsetParent !== null) {
          t.focus();
          delete triggers[id];
        }
      }
    }).observe(m, { attributes: true, attributeFilter: ['hidden'] });
  });

  /* ---------- V3 键盘避让：手机键盘弹出时给页面留出空间 ---------- */
  (function keyboardAvoid() {
    const vv = window.visualViewport;
    if (!vv) return;

    function update() {
      const gap = window.innerHeight - vv.height - vv.offsetTop;
      const kb = gap > 60 ? Math.round(gap) : 0;
      document.documentElement.style.setProperty('--kb-offset', kb + 'px');

      /* 键盘弹出时如果对话区本来就在底部，保持最新消息可见 */
      if (kb > 0) {
        const stream = document.getElementById('chatStream');
        if (!stream) return;
        const max = stream.scrollHeight - stream.clientHeight;
        if ((max - stream.scrollTop) < 80) {
          setTimeout(function () { stream.scrollTop = stream.scrollHeight; }, 30);
        }
      }
    }

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
  })();
})();