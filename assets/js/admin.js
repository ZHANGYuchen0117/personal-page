/* ==========================================================
 * V4 内容小后台
 * - 读当前 data.js 的内容，在线改「关于我 / 技能 / 项目 / 计划」
 * - 生成结构完全一致的 data.js，下载后覆盖 assets/js/data.js 即可
 * - 纯前端，不上传任何东西；生成的提示词由数据自动拼出
 * ========================================================== */
(function () {
  const base = window.PROFILE_DATA || {};
  let content = JSON.parse(JSON.stringify(base.content || {}));
  content.about = content.about || { facts: [], stage: '' };
  content.skills = content.skills || [];
  content.projects = content.projects || [];
  content.plan = content.plan || [];

  const NAME = base.name || '张聿辰';

  /* 联系我：和 content 平级，单独维护（避免微信号/二维码又被漏掉） */
  let contact = JSON.parse(JSON.stringify(base.contactMessage || {}));

  const el = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* ---------- 渲染表单 ---------- */
  function renderAbout() {
    el('aboutFacts').value = (content.about.facts || []).join('\n');
    el('aboutStage').value = content.about.stage || '';
  }

  function renderSkills() {
    el('skillList').innerHTML = content.skills.map(function (s, i) {
      return '<div class="row" data-i="' + i + '">' +
        '<input class="txt name" value="' + esc(s.name) + '" placeholder="技能名，例如 HTML & CSS">' +
        '<input class="txt note" value="' + esc(s.note || '') + '" placeholder="程度 / 场景（可空）">' +
        '<button type="button" class="del" data-del-skill="' + i + '" title="删除">×</button>' +
        '</div>';
    }).join('');
  }

  function renderProjects() {
    el('projectList').innerHTML = content.projects.map(function (p, i) {
      return '<div class="card" data-i="' + i + '">' +
        '<div class="row">' +
          '<input class="txt name" value="' + esc(p.name) + '" placeholder="项目名">' +
          '<button type="button" class="del" data-del-project="' + i + '" title="删除">×</button>' +
        '</div>' +
        '<textarea class="txt desc" rows="2" placeholder="一句话描述">' + esc(p.desc || '') + '</textarea>' +
        '<input class="txt link" value="' + esc(p.link || '') + '" placeholder="链接（可空，会原样出现在回答里）">' +
      '</div>';
    }).join('');
  }

  function renderPlan() {
    const p = content.plan[0] || { version: '', theme: '', items: [] };
    el('planVersion').value = p.version || '';
    el('planTheme').value = p.theme || '';
    el('planItems').value = (p.items || []).join('\n');
  }

  function renderContact() {
    el('contactWechat').value = contact.wechat || '';
    el('contactQr').value = contact.qr || '';
    el('contactQrTip').value = contact.qrTip || '';
    el('contactLabel').value = contact.label || '复制微信号';
  }

  function renderAll() {
    renderAbout();
    renderSkills();
    renderProjects();
    renderPlan();
    renderContact();
    el('preview').textContent = JSON.stringify(content, null, 2);
  }

  /* ---------- 从表单收集 ---------- */
  function collect() {
    content.about.facts = el('aboutFacts').value.split('\n')
      .map(s => s.trim()).filter(Boolean);
    content.about.stage = el('aboutStage').value.trim();

    content.skills = Array.prototype.map.call(el('skillList').querySelectorAll('.row'), function (row) {
      return {
        name: row.querySelector('.name').value.trim(),
        note: row.querySelector('.note').value.trim()
      };
    }).filter(s => s.name);

    content.projects = Array.prototype.map.call(el('projectList').querySelectorAll('.card'), function (card) {
      const item = { name: card.querySelector('.name').value.trim() };
      const desc = card.querySelector('.desc').value.trim();
      const link = card.querySelector('.link').value.trim();
      if (desc) item.desc = desc;
      if (link) item.link = link;
      return item;
    }).filter(p => p.name);

    const items = el('planItems').value.split('\n').map(s => s.trim()).filter(Boolean);
    content.plan = [{
      version: el('planVersion').value.trim() || 'V5',
      theme: el('planTheme').value.trim() || '下一步',
      items: items
    }];

    contact = {
      title: contact.title || '联系我',
      qr: el('contactQr').value.trim(),
      qrTip: el('contactQrTip').value.trim(),
      wechat: el('contactWechat').value.trim(),
      label: el('contactLabel').value.trim() || '复制微信号'
    };

    return content;
  }

  /* ---------- 生成 data.js（与站点同一套提示词拼装逻辑） ---------- */
  function buildSource() {
    const c = collect();
    const j = v => JSON.stringify(v, null, 6).replace(/\n/g, '\n  ');

    return [
      '/* ==========================================================',
      ' * 个人主页数据（V4：内容数据化）',
      ' * 关于我 / 技能 / 项目 都写在 content 里，',
      ' * AI 提示词由这份数据自动拼出来 —— 改这里就改全站口径。',
      ' * 这份文件可以用 admin.html 生成，也可以直接手改。',
      ' * ========================================================== */',
      '(function () {',
      "  const NAME = '" + NAME.replace(/'/g, "\\'") + "';",
      '',
      '  const CONTENT = ' + JSON.stringify(c, null, 2) + ';',
      '',
      "  /* ---------- 提示词：全部由上面的数据拼出来 ---------- */",
      "  const RULE = '不要补充未提到的内容。';",
      '',
      '  function aboutPrompt() {',
      '    const facts = CONTENT.about.facts.concat([CONTENT.about.stage]);',
      "    return '请只依据以下信息，用2-3句话介绍' + NAME + '：' + facts.join('，') + '。' + RULE;",
      '  }',
      '',
      '  function skillsPrompt() {',
      '    const list = CONTENT.skills.map(function (s) {',
      "      return s.note ? s.name + '（' + s.note + '）' : s.name;",
      "    }).join('、');",
      "    return '请只依据以下信息，用2-3句话概括' + NAME + '的技能：' + list + '。' + RULE;",
      '  }',
      '',
      '  function projectsPrompt() {',
      '    const list = CONTENT.projects.map(function (p) {',
      '      const bits = [];',
      '      if (p.desc) bits.push(p.desc);',
      "      if (p.link) bits.push('GitHub 仓库：' + p.link);",
      "      return bits.length ? p.name + '（' + bits.join('，') + '）' : p.name;",
      "    }).join('、');",
      "    return '请只依据以下信息，用2-3句话介绍' + NAME + '的项目经历，并把个人主页的 GitHub 链接原样写出来：' +",
      "      list + '。' + RULE;",
      '  }',
      '',
      '  function nextStepPrompt() {',
      '    const planText = CONTENT.plan.map(function (stage) {',
      "      return stage.version + ' ' + stage.theme + '（' + stage.items.join('、') + '）';",
      "    }).join('；');",
      "    return '请只依据以下信息，用1-2句话说明' + NAME + '接下来的迭代计划：' + planText + '。' + RULE;",
      '  }',
      '',
      '  window.PROFILE_DATA = {',
      '    name: NAME,',
      '',
      '    /* 头像：把真实照片放在 assets/img/avatar.jpg */',
      '    avatar: ' + JSON.stringify(base.avatar || './assets/img/avatar.jpg') + ',',
      '',
      '    /* 内容数据（V4）：关于我 / 技能 / 项目 / 计划 */',
      '    content: CONTENT,',
      '',
      '    /* 开场依次弹出的消息 */',
      '    introMessages: ' + JSON.stringify(base.introMessages || [], null, 2).replace(/\n/g, '\n    ') + ',',
      '',
      '    /* 第四条：菜单信息框（prompt 由 content 自动生成） */',
      '    menuMessage: {',
      "      title: " + JSON.stringify((base.menuMessage || {}).title || '了解更多') + ',',
      '      options: [',
      "        { label: '关于我', prompt: aboutPrompt() },",
      "        { label: '当前技能', prompt: skillsPrompt() },",
      "        { label: '项目经历', prompt: projectsPrompt() },",
      "        { label: '下一步计划', prompt: nextStepPrompt() }",
      '      ]',
      '    },',
      '',
      '    /* 第五条：联系我信息框（V4：微信 / 二维码） */',
      '    contactMessage: ' + JSON.stringify(contact, null, 2).replace(/\n/g, '\n    ') + ',',
      '',
      '    changelog: ' + JSON.stringify(base.changelog || {}, null, 2).replace(/\n/g, '\n    '),
      '  };',
      '})();',
      ''
    ].join('\n');
  }

  /* ---------- 交互 ---------- */
  el('addSkill').addEventListener('click', function () {
    collect();
    content.skills.push({ name: '', note: '' });
    renderSkills();
  });

  el('addProject').addEventListener('click', function () {
    collect();
    content.projects.push({ name: '', desc: '', link: '' });
    renderProjects();
  });

  el('skillList').addEventListener('click', function (e) {
    const i = e.target.getAttribute && e.target.getAttribute('data-del-skill');
    if (i === null) return;
    collect();
    content.skills.splice(Number(i), 1);
    renderSkills();
  });

  el('projectList').addEventListener('click', function (e) {
    const i = e.target.getAttribute && e.target.getAttribute('data-del-project');
    if (i === null) return;
    collect();
    content.projects.splice(Number(i), 1);
    renderProjects();
  });

  el('reload').addEventListener('click', function () {
    content = JSON.parse(JSON.stringify(base.content || {}));
    contact = JSON.parse(JSON.stringify(base.contactMessage || {}));
    renderAll();
    el('status').textContent = '已还原成站点当前内容';
  });

  el('generate').addEventListener('click', function () {
    const src = buildSource();
    el('output').value = src;
    window.__generatedDataJs = src;
    let valid = true;
    try { new Function(src); } catch (e) { valid = false; el('status').textContent = '生成了，但语法有问题：' + e.message; }
    if (valid) {
      if (!contact.wechat) {
        el('status').textContent = '生成了（提醒：微信号还空着，「联系我」框只有二维码或干脆不显示）';
      } else if (!contact.qr) {
        el('status').textContent = '生成了（提醒：没填二维码路径，访客只能点按钮复制微信号）';
      } else {
        el('status').textContent = '生成成功，可以下载或复制了';
      }
    }
    el('preview').textContent = JSON.stringify(collect(), null, 2);
  });

  el('download').addEventListener('click', function () {
    const src = el('output').value || buildSource();
    const blob = new Blob([src], { type: 'text/javascript;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'data.js';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    el('status').textContent = '已下载 data.js，覆盖 assets/js/data.js 即可';
  });

  el('copy').addEventListener('click', function () {
    const src = el('output').value || buildSource();
    const done = function () { el('status').textContent = '已复制到剪贴板'; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(src).then(done).catch(function () {
        el('output').select(); document.execCommand('copy'); done();
      });
    } else {
      el('output').select(); document.execCommand('copy'); done();
    }
  });

  el('previewBtn').addEventListener('click', function () {
    el('preview').textContent = JSON.stringify(collect(), null, 2);
  });

  renderAll();
})();