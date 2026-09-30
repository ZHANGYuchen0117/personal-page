/* ==========================================================
 * V3 手势：触屏下从面板顶部下拉关闭弹窗
 * - 只在面板顶部 72px 内、且面板已滚到顶时接管，避免抢正常滚动
 * - 下拉超过 80px 松手即关闭；不够则回弹
 * - 关闭动作复用弹窗自己的关闭按钮，不另开一套逻辑
 * ========================================================== */
(function () {
  const TOP_ZONE = 72;      // 顶部可拖拽区域高度
  const THRESHOLD = 80;     // 触发关闭的下拉距离

  document.querySelectorAll('.modal__panel').forEach(function (panel) {
    const modal = panel.closest('.modal');
    if (!modal) return;

    let startY = null;
    let startX = 0;
    let dy = 0;
    let dragging = false;

    panel.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) { startY = null; return; }
      const t = e.touches[0];
      const rect = panel.getBoundingClientRect();
      if (t.clientY - rect.top > TOP_ZONE) { startY = null; return; }
      if (panel.scrollTop > 4) { startY = null; return; }
      startY = t.clientY;
      startX = t.clientX;
      dy = 0;
      dragging = false;
    }, { passive: true });

    panel.addEventListener('touchmove', function (e) {
      if (startY === null) return;
      const t = e.touches[0];
      const moveY = t.clientY - startY;
      const moveX = Math.abs(t.clientX - startX);

      if (!dragging) {
        /* 纵向意图明确才接管，横向滑动不拦 */
        if (moveY < 8 || moveX > Math.abs(moveY)) return;
        if (panel.scrollTop > 0) { startY = null; return; }
        dragging = true;
        panel.style.transition = 'none';
      }

      dy = Math.max(0, moveY);
      panel.style.transform = 'translateY(' + (dy * 0.55) + 'px)';
      panel.style.opacity = String(Math.max(0.55, 1 - dy / 420));
      if (e.cancelable) e.preventDefault();
    }, { passive: false });

    function settle(allowClose) {
      if (startY === null) return;
      const pulled = dy;
      startY = null;
      if (!dragging) return;
      dragging = false;

      panel.style.transition = 'transform .28s cubic-bezier(.16, 1, .3, 1), opacity .28s ease';

      if (allowClose && pulled > THRESHOLD) {
        panel.style.transform = 'translateY(120%)';
        panel.style.opacity = '0';
        setTimeout(function () {
          const btn = modal.querySelector('.modal__close');
          if (btn) btn.click();
          /* 复位，下次打开还是正常样子 */
          panel.style.transition = '';
          panel.style.transform = '';
          panel.style.opacity = '';
        }, 190);
      } else {
        panel.style.transform = '';
        panel.style.opacity = '';
        setTimeout(function () { panel.style.transition = ''; }, 300);
      }
    }

    panel.addEventListener('touchend', function () { settle(true); });
    panel.addEventListener('touchcancel', function () { settle(false); });
  });
})();
