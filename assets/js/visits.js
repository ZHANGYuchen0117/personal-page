/* ==========================================================
 * V4 访问统计：每次会话匿名记一条访问（不记 IP、不记个人信息）
 *
 * - 一个浏览器会话只记一次（sessionStorage 打标）
 * - 只上报：路径 / 来源域名 / 语言 / 屏幕尺寸 / 随机访客号
 * - 表还没建、策略不允许、断网：全部静默失败，绝不影响页面
 * - 后台查看：Supabase 控制台里看 visits 表（前端不给读权限）
 *
 * 建表 SQL 见仓库 outputs/v4-supabase-setup.sql
 * ========================================================== */
(function () {
  const cfg = window.SUPABASE_CONFIG || {};

  function visitorId() {
    let id = null;
    try { id = localStorage.getItem('visit_sid'); } catch (e) {}
    if (!id) {
      id = 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      try { localStorage.setItem('visit_sid', id); } catch (e) {}
    }
    return id;
  }

  function buildPayload() {
    let ref = '';
    try {
      if (document.referrer) {
        ref = new URL(document.referrer).hostname || '';
      }
    } catch (e) {}
    return {
      path: location.pathname + (location.hash || ''),
      referrer: ref || null,
      lang: navigator.language || null,
      screen: (window.screen && screen.width) ? (screen.width + 'x' + screen.height) : null,
      session_id: visitorId()
    };
  }

  /* 暴露出来便于自测与手动补发 */
  function sendVisitPing(payload) {
    const body = payload || buildPayload();
    window.__lastVisitPing = body;
    window.__visitPingState = 'sending';
    if (!cfg.url || !cfg.anonKey) {
      window.__visitPingState = 'no-config';
      return Promise.resolve(false);
    }
    try {
      return fetch(cfg.url.replace(/\/$/, '') + '/rest/v1/visits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': cfg.anonKey,
          'Authorization': 'Bearer ' + cfg.anonKey,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(body),
        keepalive: true
      }).then(function (res) {
        window.__visitPingState = res && res.ok ? 'sent' : 'failed';
        // 页面上继续静默（访客不该被后台配置问题打扰），但控制台要说清楚原因，
        // 否则「表没建」这种问题会一直悄无声息。
        if (res && !res.ok) {
          if (res.status === 404) {
            console.warn('[visits] visits 表不存在，访问统计没有生效。请先在 Supabase 执行 supabase/v4-security.sql');
          } else {
            console.warn('[visits] 访问统计上报失败，HTTP ' + res.status);
          }
        }
        return !!(res && res.ok);
      }).catch(function () {
        window.__visitPingState = 'failed';
        return false;
      });
    } catch (e) {
      window.__visitPingState = 'failed';
      return Promise.resolve(false);
    }
  }

  window.sendVisitPing = sendVisitPing;

  /* 一个会话只记一次 */
  try {
    if (sessionStorage.getItem('visit_pinged') === '1') {
      window.__visitPingState = 'skipped';   /* 这个会话已经记过，不重复记 */
      return;
    }
    sessionStorage.setItem('visit_pinged', '1');
  } catch (e) {}

  sendVisitPing();
})();