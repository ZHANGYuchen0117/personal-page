(function () {
  const root = document.getElementById('chat-widget');
  if (!root) return;

  const data = window.PROFILE_DATA || {};
  const intro = data.introMessages || [];
  const menu = data.menuMessage || null;
  const contact = data.contactMessage || null;

  const AVATAR_SVG =
    '<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true">' +
    '<path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z"/>' +
    '</svg>';

  root.innerHTML =
    '<div class="chat">' +
      '<div class="chat__stream" id="chatStream"></div>' +
    '</div>';

  const stream = root.querySelector('#chatStream');

  /* ---------- 通用：把一条消息塞进消息流 ---------- */
  function appendRow(modifier, html) {
    const row = document.createElement('div');
    row.className = 'chat__row chat__row--' + modifier;

    const bubble = document.createElement('div');
    bubble.className = 'chat__bubble chat__bubble--' + modifier;
    bubble.innerHTML = html;

    row.appendChild(bubble);
    stream.appendChild(row);

    void row.offsetWidth;            // 强制重排，保证每次都能播放动画
    row.classList.add('is-entering');

    stream.scrollTop = stream.scrollHeight;
    return row;
  }

  /* ---------- 节奏控制 ---------- */
  const START_DELAY = 280;   // 页面打开后，第一条延迟出现
  const STEP = 900;          // 每条消息之间的间隔（越大越慢）

  let timeline = START_DELAY;

  /* ---------- 1~3：头像 + 两条标语 ---------- */
  intro.forEach(function (msg) {
    const t = timeline;
    setTimeout(function () {
      if (msg.type === 'profile') {
        appendRow(
          'profile',
          '<div class="chat__avatar">' + AVATAR_SVG + '</div>' +
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

      /* 点击菜单项 -> 提问气泡 + 回答气泡 */
      row.querySelectorAll('.info-box__btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const idx = parseInt(btn.dataset.idx, 10);
          const opt = menu.options[idx];
          if (!opt) return;
          appendRow('ask', opt.label);
          setTimeout(function () {
            appendRow('answer', opt.answer);
          }, 460);
        });
      });
    }, t);
    timeline += STEP;
  }

  /* ---------- 5：联系我信息框 ---------- */
  if (contact) {
    const t = timeline;
    setTimeout(function () {
      appendRow(
        'box',
        '<div class="info-box">' +
          '<div class="info-box__title">' + (contact.title || '') + '</div>' +
          '<div class="info-box__list">' +
            '<a class="info-box__btn info-box__btn--link" href="mailto:' + (contact.email || '') + '">' +
              (contact.label || '联系我') +
            '</a>' +
          '</div>' +
        '</div>'
      );
    }, t);
    timeline += STEP;
  }
})();