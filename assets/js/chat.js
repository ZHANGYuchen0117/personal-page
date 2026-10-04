(function () {
  const root = document.getElementById('chat-widget');
  if (!root) return;

  const data = window.PROFILE_DATA || {};
  const intro = data.introMessages || [];
  const menu = data.menuMessage || null;
  const contact = data.contactMessage || null;
  const avatarSrc = data.avatar || '';

  const AVATAR_SVG =
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true">' +
    '<path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z"/>' +
    '</svg>';

  function buildAvatarHtml(src) {
    const fallback = '<span class="chat__avatar-fallback">' + AVATAR_SVG + '</span>';
    if (!src) return fallback;
    return '<img class="chat__avatar-img" src="' + src + '" alt="" />' + fallback;
  }

  root.innerHTML =
    '<div class="chat">' +
      '<div class="chat__stream" id="chatStream"></div>' +
      '<div class="chat__input-bar">' +
        '<input type="text" class="chat__input" placeholder="问点什么…" aria-label="问点什么" autocomplete="off" />' +
        '<button type="button" class="chat__send">发送</button>' +
      '</div>' +
    '</div>';

  const stream = root.querySelector('#chatStream');
  const input = root.querySelector('.chat__input');
  const sendBtn = root.querySelector('.chat__send');

  /* ---------- V3 无障碍：新消息可被读屏播报 ---------- */
  stream.setAttribute('role', 'log');
  stream.setAttribute('aria-live', 'polite');

  /* ---------- V3 减少动效偏好：不做位移与过场 ---------- */
  function prefersReduced() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* ---------- V3 进入过场：舞台由虚到实 ---------- */
  let stageIntro = !prefersReduced();
  if (stageIntro) stream.classList.add('is-intro');

  /* ---------- V3 滚动位置记忆 ---------- */
  const SCROLL_KEY = 'chat_scroll';
  let saveTimer = null;

  function saveScroll() {
    try {
      const max = stream.scrollHeight - stream.clientHeight;
      sessionStorage.setItem(SCROLL_KEY, JSON.stringify({
        top: stream.scrollTop,
        atBottom: (max - stream.scrollTop) < 48
      }));
    } catch (e) {}
  }

  /* 开场是自动滚到底部的，这段时间不记录，
     否则会把"在底部"写进记忆，覆盖掉上次要恢复的位置 */
  let introLock = true;
  let userScrolled = false;

  stream.addEventListener('scroll', function () {
    if (introLock) {
      /* 开场期间用户主动滚了也要记住，只是不立刻落盘 */
      userScrolled = true;
      return;
    }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveScroll, 200);
  });
  window.addEventListener('pagehide', function () {
    if (!introLock || userScrolled) saveScroll();
  });

  stream.addEventListener('error', function (e) {
    const t = e.target;
    if (t && t.classList && t.classList.contains('chat__avatar-img')) {
      t.style.display = 'none';
    }
  }, true);

  /* ---------- 文本安全 & 链接化 ---------- */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str || '');
    return div.innerHTML;
  }

  // 回答里的 http(s) 链接变成可点链接（先整体转义，再替换，避免注入）
  function linkify(text) {
    return escapeHtml(text).replace(
      /(https?:\/\/[^\s<]*[A-Za-z0-9\/_#+=%&~-])/g,
      function (url) {
        return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + '</a>';
      }
    );
  }

  /* ---------- V4 复制文本：优先剪贴板 API，老手机浏览器退回 execCommand ---------- */
  function fallbackCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const done = document.execCommand('copy');
      document.body.removeChild(ta);
      return done;
    } catch (e) {
      return false;
    }
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      /* 注意：writeText 成功时 resolve 的是 undefined，不是 true，
         必须显式归一成布尔值，否则成功也会被判成失败 */
      return navigator.clipboard.writeText(text).then(
        function () { return true; },
        function () { return fallbackCopy(text); }
      );
    }
    return Promise.resolve(fallbackCopy(text));
  }

  /* ---------- V3 纵向错落：每行起始高度四档循环，横向下滑方向由角色决定 ---------- */
  const ENTER_Y = [10, 16, 22, 28];
  let rowSeq = 0;

  function appendRow(modifier, html) {
    const row = document.createElement('div');
    row.className = 'chat__row chat__row--' + modifier;
    row.style.setProperty('--enter-y', ENTER_Y[rowSeq % ENTER_Y.length] + 'px');
    rowSeq += 1;

    const bubble = document.createElement('div');
    bubble.className = 'chat__bubble chat__bubble--' + modifier;
    bubble.innerHTML = html;

    row.appendChild(bubble);
    stream.appendChild(row);

    void row.offsetWidth;
    if (prefersReduced()) {
      row.classList.add('is-static');   /* V3：减少动效偏好下直接呈现 */
    } else {
      row.classList.add('is-entering');
    }

    /* 第一行进来的同时撤掉开场虚化 */
    if (stageIntro) {
      stageIntro = false;
      setTimeout(function () { stream.classList.remove('is-intro'); }, 80);
    }

    stream.scrollTop = stream.scrollHeight;
    return row;
  }

  /* ---------- AI 连不上时的本地兜底 ----------
     数据本来就在页面上（PROFILE_DATA.content），不需要网络。
     按关键词挑最贴近的一段回给访客，答不全但至少不会显示「Load failed」。 */
  function localAnswer(question) {
    const content = (window.PROFILE_DATA && window.PROFILE_DATA.content) || {};
    const q = String(question || '');

    function hit() {
      for (let i = 0; i < arguments.length; i++) {
        if (q.indexOf(arguments[i]) !== -1) return true;
      }
      return false;
    }

    if (hit('专业', '学什么', '学校', '大一', '学院')) {
      const fact = (content.about && content.about.facts || []).filter(function (f) {
        return f.indexOf('专业') !== -1;
      })[0];
      if (fact) return fact + '。';
    }
    if (hit('技能', '会什么', '会些什么', '都会什么', '会啥', '会点啥', '擅长', '拿手', '能力', '技术栈')) {
      return '他的技能包括：' + (content.skills || []).map(function (s) {
        return s.note ? s.name + '（' + s.note + '）' : s.name;
      }).join('、') + '。';
    }
    if (hit('项目', '作品', '做过', '仓库', 'github')) {
      return '他做过的项目：' + (content.projects || []).map(function (p) {
        return p.desc ? p.name + '（' + p.desc + '）' : p.name;
      }).join('；') + '。';
    }
    if (hit('计划', '下一步', '接下来', '规划', '以后')) {
      return '接下来的计划：' + (content.plan || []).map(function (s) {
        return s.version + ' ' + s.theme + '（' + s.items.join('、') + '）';
      }).join('；') + '。';
    }
    if (hit('联系', '微信', '加好友', '怎么找', '私信')) {
      return '可以在上面的「联系我」里扫微信二维码加他。';
    }
    if (content.about && content.about.facts && content.about.facts.length) {
      return content.about.facts.join('，') + '。' + (content.about.stage || '');
    }
    return '';
  }

  /* ---------- 统一发送逻辑：菜单点击 / 输入框发送 都走这里 ---------- */
  function sendQuestion(questionText) {
    if (!questionText) return;

    appendRow('ask', questionText);

    /* 菜单按钮的 prompt 已经自带完整资料；自由输入只有原文，
       要在这里补上页面资料，否则 AI 会用它自己那份过期知识作答。 */
    const outgoing = questionText.indexOf('请只依据以下信息') === 0
      ? questionText
      : (typeof data.questionPrompt === 'function' ? data.questionPrompt(questionText) : questionText);

    setTimeout(function () {
      if (typeof callLLM === 'function') {
        const answerRow = appendRow(
          'answer',
          '<span class="chat__thinking"><i></i><i></i><i></i></span>'
        );
        const bubble = answerRow.querySelector('.chat__bubble');
        bubble.classList.add('chat__bubble--ai');

        let started = false;

        callLLM(
          outgoing,
          function (chunk) {
            if (!started) {
              bubble.innerHTML = '';
              started = true;
            }
            bubble.textContent += chunk;
            stream.scrollTop = stream.scrollHeight;
          },
          function (fullText) {
            bubble.innerHTML = linkify(fullText);
          },
          function (errMsg) {
            /* AI 连不上时别给访客甩报错：改用页面上现成的资料兜底回答。
               资料本来就在 PROFILE_DATA.content 里，不需要网络。 */
            const local = localAnswer(questionText);
            bubble.classList.add('chat__bubble--error');
            if (local) {
              bubble.innerHTML =
                '<span class="chat__offline">AI 暂时连不上（' + errMsg + '），先用本地资料回答：</span>' +
                '<br>' + linkify(local);
            } else {
              bubble.textContent = '抱歉，' + errMsg;
            }
          }
        );
      } else {
        appendRow('answer', '（AI 未接入，请先配置 ai.js）');
      }
    }, 400);
  }

  /* ---------- 节奏（减少动效偏好下直接全部呈现） ---------- */
  const reducedNow = prefersReduced();
  const START_DELAY = reducedNow ? 0 : 300;
  const STEP = reducedNow ? 0 : 900;
  let timeline = START_DELAY;

  /* ---------- 1~3：头像 + 两条标语 ---------- */
  intro.forEach(function (msg) {
    const t = timeline;
    setTimeout(function () {
      if (msg.type === 'profile') {
        appendRow(
          'profile',
          '<div class="chat__avatar">' + buildAvatarHtml(avatarSrc) + '</div>' +
          '<div class="chat__name">' + (msg.name || data.name || '') + '</div>'
        );
      } else {
        appendRow('answer', msg.text);
      }
    }, t);
    timeline += STEP;
  });

  /* ---------- 4：菜单信息框 ---------- */
  if (menu) {
    const t = timeline;
    setTimeout(function () {
      const buttonsHtml = (menu.options || []).map(function (opt, i) {
        return '<button type="button" class="info-box__btn" data-idx="' + i + '">' + opt.label + '</button>';
      }).join('');

      const row = appendRow(
        'box',
        '<div class="info-box">' +
          '<div class="info-box__title">' + (menu.title || '') + '</div>' +
          '<div class="info-box__list">' + buttonsHtml + '</div>' +
        '</div>'
      );

      row.querySelectorAll('.info-box__btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const idx = parseInt(btn.dataset.idx, 10);
          const opt = menu.options[idx];
          if (!opt) return;
          sendQuestion(opt.prompt || opt.label);
        });
      });
    }, t);
    timeline += STEP;
  }

  /* ---------- 5：联系我信息框（V4：改成微信 / 二维码，不再默认发邮件） ---------- */
  const hasContact = !!(contact && (contact.qr || contact.wechat || contact.email));
  if (hasContact) {
    const t = timeline;
    setTimeout(function () {
      const hasQr = !!contact.qr;
      const hasWechat = !!contact.wechat;

      let inner =
        '<div class="info-box__title">' + escapeHtml(contact.title || '联系我') + '</div>';

      if (hasQr) {
        inner +=
          '<div class="info-box__qr">' +
            '<img class="info-box__qr-img" src="' + escapeHtml(contact.qr) + '" ' +
                 'alt="我的微信二维码" loading="lazy" decoding="async">' +
            (contact.qrTip
              ? '<span class="info-box__qr-tip">' + escapeHtml(contact.qrTip) + '</span>'
              : '') +
          '</div>';
      }

      /* 只在真有按钮时才渲染这一行，避免留一条空的选择条 */
      let actions = '';
      if (hasWechat) {
        actions +=
          '<button type="button" class="info-box__btn info-box__btn--copy" data-copy-wechat>' +
            escapeHtml(contact.label || '复制微信号') +
          '</button>';
      }
      /* 邮箱不再是默认方式，但留了口子：填了才显示 */
      if (contact.email) {
        actions +=
          '<a class="info-box__btn info-box__btn--link" href="mailto:' + escapeHtml(contact.email) + '">' +
            escapeHtml(contact.emailLabel || '发送邮件') +
          '</a>';
      }
      if (actions) inner += '<div class="info-box__list">' + actions + '</div>';

      if (hasWechat) {
        inner += '<p class="info-box__wechat">微信号：<b>' + escapeHtml(contact.wechat) + '</b></p>';
      } else if (contact.tip) {
        inner += '<p class="info-box__wechat">' + escapeHtml(contact.tip) + '</p>';
      }

      const row = appendRow('box', '<div class="info-box">' + inner + '</div>');

      /* 二维码图片没就位就不留破图；如果又没有微信号/邮箱可联系，整条收起 */
      const qrImg = row.querySelector('.info-box__qr-img');
      if (qrImg) {
        qrImg.addEventListener('error', function () {
          const wrap = qrImg.closest('.info-box__qr');
          if (wrap) wrap.hidden = true;
          if (!hasWechat && !contact.email) row.hidden = true;
        });
      }

      /* 复制微信号，点了给个反馈 */
      const copyBtn = row.querySelector('[data-copy-wechat]');
      if (copyBtn && hasWechat) {
        const original = copyBtn.textContent;
        copyBtn.addEventListener('click', function () {
          copyText(contact.wechat).then(function (ok) {
            copyBtn.textContent = ok ? '已复制 ✓' : '复制失败，请长按微信号';
            copyBtn.classList.toggle('is-copied', !!ok);
            setTimeout(function () {
              copyBtn.textContent = original;
              copyBtn.classList.remove('is-copied');
            }, 1600);
          });
        });
      }
    }, t);
    timeline += STEP;
  }

  /* ---------- V3 滚动位置记忆：开场结束后恢复上次位置 ---------- */
  setTimeout(function () {
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(SCROLL_KEY) || 'null'); } catch (e) {}

    /* top 为 0 也是有效位置（当时停在最上面），只按"是否在底部"判断 */
    if (saved && !saved.atBottom && stream.scrollHeight > stream.clientHeight) {
      stream.scrollTop = saved.top;
      /* 记忆位置已失效（内容比当时短）就退回底部 */
      if (Math.abs(stream.scrollTop - saved.top) > 12) stream.scrollTop = stream.scrollHeight;
    } else {
      stream.scrollTop = stream.scrollHeight;
    }

    /* 恢复完成：之后才把用户的滚动当作"要记住的位置" */
    introLock = false;
    stream.setAttribute('data-scroll-ready', '1');
  }, timeline + (reducedNow ? 120 : 1200));

  /* ---------- 输入框：点发送 或 按回车 ---------- */
  function handleSend() {
    const q = input.value.trim();
    if (!q) return;
    input.value = '';
    sendQuestion(q);
  }

  sendBtn.addEventListener('click', handleSend);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  });
})();