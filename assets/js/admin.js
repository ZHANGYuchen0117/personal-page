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
  content.profile = content.profile || [];   /* V6：个人档案（喂给孪生） */
  content.qa = content.qa || [];             /* V6：本人补录的问答（训练文本） */

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

  /* V6：个人档案 —— 「标签：内容」一行一条，共 5 条 */
  function renderProfile() {
    el('profileList').value = (content.profile || []).map(function (p) {
      return p.label + '：' + p.value;
    }).join('\n');
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
    renderProfile();
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

    /* 个人档案：「标签：内容」，中英文冒号都认 */
    content.profile = el('profileList').value.split('\n').map(function (line) {
      const t = line.trim();
      if (!t) return null;
      const m = t.match(/^([^：:]+)[：:]\s*(.*)$/);
      if (m) return { label: m[1].trim(), value: m[2].trim() };
      return { label: t, value: '' };
    }).filter(function (p) { return p && p.label; });

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
      version: el('planVersion').value.trim() || 'V7',
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
      ' * 个人主页数据（V7：内容数据化 + AI 孪生持续训练 + 社区记录保留）',
      ' * 关于我 / 个人档案 / 技能 / 项目 / 补录问答 都写在 content 里，',
      ' * AI 提示词由这份数据自动拼出来 —— 改这里就改全站口径。',
      ' * 这份文件可以用 admin.html 生成，也可以直接手改。',
      ' * ========================================================== */',
      '(function () {',
      "  const NAME = '" + NAME.replace(/'/g, "\\'") + "';",
      '',
      '  const CONTENT = ' + JSON.stringify(c, null, 2) + ';',
      '',
      '  /* 公告栏（V5）：页脚「公告」入口 + 打开网页自动弹出 */',
      '  const ANNOUNCEMENT = ' +
        JSON.stringify(base.announcement || {}, null, 2).replace(/\n/g, '\n    ') + ';',
      '',
      '  /* 把公告压成一行，喂给 AI —— 访客问「有什么公告」也能答对 */',
      '  function announcementText() {',
      '    return ANNOUNCEMENT.sections.map(function (s) {',
      "      return s.title + '：' + s.items.join('；');",
      "    }).join('。');",
      '  }',
      '',
      "  /* ---------- 提示词：全部由上面的数据拼出来 ---------- */",
      '',
      '  /* 个人档案压成一行（出生日期 / 爱好 / 想一起学的 / 平时喜欢 / 大学目标） */',
      '  function profileText() {',
      '    return CONTENT.profile.map(function (p) {',
      "      return p.label + '：' + p.value;",
      "    }).join('；');",
      '  }',
      '',
      '  /* 本人补录的问答 = 永久写在 data.js 里的 + 运行时从云端拉到的。',
      '     只取最近 30 条，避免提示词太长反而把访客的问题挤没了。 */',
      '  function qaPairs() {',
      "    const runtime = (typeof window !== 'undefined' && window.QA_KNOWLEDGE) || [];",
      '    return (CONTENT.qa || []).concat(runtime)',
      '      .filter(function (x) { return x && x.q && x.a; })',
      '      .slice(-30);',
      '  }',
      '',
      '  function qaText() {',
      '    return qaPairs().map(function (x) {',
      "      return x.q + '→' + x.a;",
      "    }).join('；');",
      '  }',
      '',
      '  /* 孪生「答不出来」的暗号（V6）：前端识别到它就不显示，',
      '     改成友好话术并回报给本人。见 assets/js/qa.js 与 chat.js。 */',
      "  const UNKNOWN = '__UNKNOWN__';",
      '',
      "  const RULE = '不要补充未提到的内容。' +",
      "    '如果上面的资料里完全没有答案，你的整条回复必须只有这一串字符：' + UNKNOWN +",
      "    '，不要写任何解释、也不要自己编。';",
      '',
      '  function aboutPrompt() {',
      '    const facts = CONTENT.about.facts.concat([CONTENT.about.stage]);',
      "    return '请只依据以下信息，用2-3句话介绍' + NAME + '：' + facts.join('，') +",
      "      '。个人档案：' + profileText() + '。' + RULE;",
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
      '  /* 自由输入的问题：把页面上的资料一并带上，避免 AI 凭自己那份过期知识作答 */',
      '  function questionPrompt(question) {',
      '    const facts = CONTENT.about.facts.concat([CONTENT.about.stage]);',
      '    const skills = CONTENT.skills.map(function (s) {',
      "      return s.note ? s.name + '（' + s.note + '）' : s.name;",
      "    }).join('、');",
      '    const projects = CONTENT.projects.map(function (p) {',
      '      const bits = [];',
      '      if (p.desc) bits.push(p.desc);',
      "      if (p.link) bits.push('GitHub 仓库：' + p.link);",
      "      return bits.length ? p.name + '（' + bits.join('，') + '）' : p.name;",
      "    }).join('、');",
      '    const plan = CONTENT.plan.map(function (stage) {',
      "      return stage.version + ' ' + stage.theme + '（' + stage.items.join('、') + '）';",
      "    }).join('；');",
      '    const qa = qaText();',
      '',
      "    return '请只依据以下信息回答访客的问题，用2-3句话，语气自然。' + RULE + '\\n' +",
      "      '姓名：' + NAME + '\\n' +",
      "      '关于：' + facts.join('，') + '\\n' +",
      "      '个人档案：' + profileText() + '\\n' +",
      "      '技能：' + skills + '\\n' +",
      "      '项目：' + projects + '\\n' +",
      "      '接下来：' + plan + '\\n' +",
      "      '最新公告：' + announcementText() + '\\n' +",
      "      (qa ? '已知问答：' + qa + '\\n' : '') +",
      "      '联系方式：页面上的「联系我」里有微信二维码，扫码即可加好友。\\n' +",
      "      '访客的问题：' + question;",
      '  }',
      '',
      '  window.PROFILE_DATA = {',
      '    name: NAME,',
      '',
      '    /* 头像：把真实照片放在 assets/img/avatar.jpg */',
      '    avatar: ' + JSON.stringify(base.avatar || './assets/img/avatar.jpg') + ',',
      '',
      '    /* 内容数据（V6）：关于我 / 个人档案 / 技能 / 项目 / 计划 / 补录问答 */',
      '    content: CONTENT,',
      '',
      '    /* AI 孪生「答不出来」的暗号（V6）：前端识别到就不显示，改成友好话术 */',
      '    unknownToken: UNKNOWN,',
      '',
      '    /* 给自由输入的问题补上页面资料（菜单按钮自己有完整 prompt，不走这里） */',
      '    questionPrompt: questionPrompt,',
      '',
      '    /* 公告栏（V5）：页脚「公告」入口 + 打开网页自动弹出 */',
      '    announcement: ANNOUNCEMENT,',
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

  /* ==========================================================
   * V6：AI 孪生「待我回答的问题」
   *  1. 持本人口令，从云端拉出访客问过、但孪生答不上来的问题
   *  2. 填好答案保存 → 写回云端，网站立刻就能用它回答
   *  3. 同时追加到 content.qa → 一起写进生成的 data.js（永久训练文本）
   * 口令只存在本机 localStorage，不进仓库、不进生成的文件。
   * ========================================================== */
  const SB = window.SUPABASE_CONFIG || {};
  const PASS_KEY = 'qa_pass';
  let gaps = [];

  function normQ(s) {
    return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function readPass() {
    try { return localStorage.getItem(PASS_KEY) || ''; } catch (e) { return ''; }
  }

  function setQaStatus(msg, isErr) {
    const n = el('qaStatus');
    n.textContent = msg;
    n.style.color = isErr ? '#c0392b' : '';
  }

  async function rpc(name, body) {
    if (!SB.url || !SB.anonKey) throw new Error('没读到 Supabase 配置');
    const res = await fetch(SB.url + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: {
        apikey: SB.anonKey,
        Authorization: 'Bearer ' + SB.anonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const text = await res.text();
    if (!res.ok) {
      let msg = 'HTTP ' + res.status;
      try {
        const j = JSON.parse(text);
        msg = j.message || j.hint || j.details || msg;
      } catch (e) {}
      throw new Error(msg);
    }
    return text ? JSON.parse(text) : null;
  }

  function renderGaps() {
    const box = el('qaList');
    if (!gaps.length) {
      box.innerHTML = '<p class="hint" style="margin:0">现在没有待答的问题。</p>';
      return;
    }
    box.innerHTML = gaps.map(function (g, i) {
      let when = '';
      try { when = g.created_at ? new Date(g.created_at).toLocaleString('zh-CN') : ''; } catch (e) {}
      return '<div class="card" data-i="' + i + '">' +
        '<p class="hint" style="margin:0 0 6px">' + esc(when) + '</p>' +
        '<p class="q" style="margin:0 0 8px;font-weight:600">' + esc(g.question) + '</p>' +
        '<textarea class="txt ans" rows="3" placeholder="你的回答（1 - 2000 字）"></textarea>' +
        '<div class="bar">' +
          '<button type="button" class="primary" data-save="' + i + '">保存答案</button>' +
          '<button type="button" data-drop="' + i + '">先跳过</button>' +
        '</div>' +
        '</div>';
    }).join('');
  }

  el('qaLoad').addEventListener('click', async function () {
    const pass = (el('qaPass').value || '').trim() || readPass();
    if (!pass) {
      setQaStatus('先填本人口令（在 Supabase 的 SQL Editor 里设过的那串）', true);
      el('qaPass').focus();
      return;
    }
    try { localStorage.setItem(PASS_KEY, pass); } catch (e) {}

    setQaStatus('拉取中…');
    try {
      const rows = await rpc('list_gaps', { pass: pass, limit_n: 100 });
      const known = (content.qa || []).map(function (x) { return normQ(x.q); });
      gaps = (rows || []).map(function (r) {
        return { id: r.id, question: r.question, created_at: r.created_at };
      }).filter(function (g) {
        return known.indexOf(normQ(g.question)) === -1;   /* 已经写进训练文本的就不显示了 */
      });
      renderGaps();
      setQaStatus(gaps.length ? ('有 ' + gaps.length + ' 个问题等你回答') : '没有待答的问题，挺好的。');
    } catch (err) {
      setQaStatus('拉取失败：' + err.message, true);
    }
  });

  el('qaForget').addEventListener('click', function () {
    try { localStorage.removeItem(PASS_KEY); } catch (e) {}
    el('qaPass').value = '';
    setQaStatus('已忘掉本机保存的口令');
  });

  el('qaList').addEventListener('click', async function (e) {
    const saveI = e.target.getAttribute && e.target.getAttribute('data-save');
    const dropI = e.target.getAttribute && e.target.getAttribute('data-drop');

    if (dropI !== null && dropI !== undefined) {
      gaps.splice(Number(dropI), 1);
      renderGaps();
      setQaStatus('已跳过（下次拉取还会出现）');
      return;
    }
    if (saveI === null || saveI === undefined) return;

    const i = Number(saveI);
    const gap = gaps[i];
    if (!gap) return;

    const card = e.target.closest ? e.target.closest('.card') : null;
    const ansEl = card ? card.querySelector('.ans') : null;
    const answer = ansEl ? ansEl.value.trim() : '';
    const pass = (el('qaPass').value || '').trim() || readPass();

    if (!answer) { setQaStatus('答案还没写', true); return; }
    if (!pass) { setQaStatus('先填本人口令', true); return; }

    e.target.disabled = true;
    setQaStatus('保存中…');
    try {
      const ok = await rpc('answer_gap', { gap_id: gap.id, answer: answer, pass: pass });
      if (ok === false) throw new Error('这条已经不在了（可能已经被回答过）');

      /* 追加进训练文本，生成 data.js 时会带上 */
      content.qa = content.qa || [];
      if (!content.qa.some(function (x) { return normQ(x.q) === normQ(gap.question); })) {
        content.qa.push({ q: gap.question, a: answer });
      }
      gaps.splice(i, 1);
      renderGaps();
      el('preview').textContent = JSON.stringify(collect(), null, 2);
      setQaStatus('已保存：网站立刻就能用它回答。别忘了点「生成 data.js」→ 下载覆盖 assets/js/data.js，' +
        '这样它才会成为永久的训练文本（并提交到仓库）。');
    } catch (err) {
      e.target.disabled = false;
      setQaStatus('保存失败：' + err.message, true);
    }
  });

  /* 打开页面时把本机存过的口令填回去（不自动拉取，避免一进来就发请求） */
  el('qaPass').value = readPass();
  renderGaps();

  renderAll();
})();