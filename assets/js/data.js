/* ==========================================================
 * 个人主页数据（V3：内容数据化）
 * 关于我 / 技能 / 项目 都写在 content 里，
 * AI 提示词由这份数据自动拼出来 —— 改这里就改全站口径。
 * ========================================================== */
(function () {
  const NAME = '张聿辰';

  const CONTENT = {
    /* 关于我：用来介绍自己的事实 + 当前阶段 */
    about: {
      facts: [
        '智能医学工程专业大一学生',
        '对 Web 开发、AI 应用和产品设计感兴趣'
      ],
      stage: '个人主页已迭代到 V4，正在推进 V5 计划'
    },

    /* 技能：一项一行，note 补充程度或场景（可省） */
    skills: [
      { name: 'HTML & CSS', note: '能独立写响应式页面' },
      { name: 'Python', note: '基础' },
      { name: 'Vibe Coding', note: '用 AI 协作把想法做成产品' },
      { name: 'UI/UX 设计', note: '在意细节与节奏' },
      { name: '团队协作', note: '能和不同角色配合' }
    ],

    /* 项目：name 必填；desc 描述；link 有就带上，会原样出现在回答里 */
    projects: [
      {
        name: '个人主页',
        desc: '聊天式页面，已迭代到 V4：AI 问答、反馈入口、社区注册与发言（头像存云端）、消息实时推送与分页、手机端适配、单文件版与内容小后台',
        link: 'https://github.com/ZHANGYuchen0117/personal-page'
      },
      { name: '校园小程序', desc: '需求调研与原型' },
      { name: 'Markdown 自学笔记库' }
    ],

    /* 迭代计划：版本 / 主题 / 具体事项 */
    plan: [
      {
        version: 'V5',
        theme: '更好用、更好看',
        items: ['装进桌面：离线可用的 PWA', '多套配色方案', '内容多语言切换', '社区消息搜索与筛选']
      }
    ]
  };

  /* ---------- 提示词：全部由上面的数据拼出来 ---------- */
  const RULE = '不要补充未提到的内容。';

  function aboutPrompt() {
    const facts = CONTENT.about.facts.concat([CONTENT.about.stage]);
    return '请只依据以下信息，用2-3句话介绍' + NAME + '：' + facts.join('，') + '。' + RULE;
  }

  function skillsPrompt() {
    const list = CONTENT.skills.map(function (s) {
      return s.note ? s.name + '（' + s.note + '）' : s.name;
    }).join('、');
    return '请只依据以下信息，用2-3句话概括' + NAME + '的技能：' + list + '。' + RULE;
  }

  function projectsPrompt() {
    const list = CONTENT.projects.map(function (p) {
      const bits = [];
      if (p.desc) bits.push(p.desc);
      if (p.link) bits.push('GitHub 仓库：' + p.link);
      return bits.length ? p.name + '（' + bits.join('，') + '）' : p.name;
    }).join('、');
    return '请只依据以下信息，用2-3句话介绍' + NAME + '的项目经历，并把个人主页的 GitHub 链接原样写出来：' +
      list + '。' + RULE;
  }

  function nextStepPrompt() {
    const planText = CONTENT.plan.map(function (stage) {
      return stage.version + ' ' + stage.theme + '（' + stage.items.join('、') + '）';
    }).join('；');
    return '请只依据以下信息，用1-2句话说明' + NAME + '接下来的迭代计划：' + planText + '。' + RULE;
  }

  window.PROFILE_DATA = {
    name: NAME,

    /* 头像：把真实照片放在 assets/img/avatar.jpg
       如果文件不存在，会自动回退到内置矢量图标 */
    avatar: './assets/img/avatar.jpg',

    /* 内容数据（V3）：关于我 / 技能 / 项目 / 计划 */
    content: CONTENT,

    /* 开场依次弹出的消息 */
    introMessages: [
      { type: 'profile', name: NAME },
      { type: 'text', text: '大一 · 智能医学工程' },
      { type: 'text', text: '探索者' }
    ],

    /* 第四条：菜单信息框（prompt 由 content 自动生成） */
    menuMessage: {
      title: '了解更多',
      options: [
        { label: '关于我', prompt: aboutPrompt() },
        { label: '当前技能', prompt: skillsPrompt() },
        { label: '项目经历', prompt: projectsPrompt() },
        { label: '下一步计划', prompt: nextStepPrompt() }
      ]
    },

    /* 第五条：联系我信息框（V4：改成微信 / 二维码，不再默认发邮件）
       - 二维码：把图片放到 assets/img/wechat-qr.png，文件不在时这块自动隐藏
       - 微信号：填了才显示「复制微信号」按钮
       - 两者都没填时，整个「联系我」信息框不出现（不会露出空盒子） */
    contactMessage: {
      title: '联系我',
      qr: './assets/img/wechat-qr.png',
      qrTip: '微信扫一扫，加我好友',
      wechat: '',
      label: '复制微信号'
    },

    changelog: {
      date: '2026年9月',
      version: 'V4',
      groups: [
        {
          title: '已完成',
          items: [
            { text: '聊天式个人主页 V1 系列', done: true },
            { text: '接入 AI 自由提问', done: true },
            { text: '反馈入口 + 云端数据库', done: true },
            { text: '社区交流功能 + 图标悬停微动效', done: true },
            { text: 'V2.2 注册：昵称 / 手机号 / 邮箱 / 头像，兼容数据库只读策略', done: true },
            { text: 'V2.2 对话区可滚动，右侧常显滚动条（比背景略深）', done: true },
            { text: 'V2.2 消息分页加载，顶部「加载更早的消息」', done: true },
            { text: 'V2.2 补充真实项目链接（GitHub 仓库）', done: true },
            { text: 'V2.3 头像上传走 Supabase Storage，不再把图片塞进消息字段', done: true },
            { text: 'V2.3 社区消息实时推送（Realtime），断线重连 + 轮询兜底', done: true },
            { text: 'V2.3 手机端适配：刘海屏安全区、44px 触控尺寸、输入框 16px 防缩放', done: true },
            { text: 'V2.3 修复：注册表单里手机号 / 邮箱输入框没有样式', done: true },
            { text: 'V3 进入过场：横向滑入与纵向错落结合的节奏', done: true },
            { text: 'V3 移动端细节：键盘避让、下拉刷新手势、滚动位置记忆', done: true },
            { text: 'V3 内容数据化：关于我 / 技能 / 项目由一份数据驱动', done: true },
            { text: 'V3 可访问性：文字对比度、键盘操作与焦点样式、减少动效偏好', done: true },
            { text: 'V4 导出可分享的单文件版本（一个 HTML 就能看，零外部依赖）', done: true },
            { text: 'V4 内容管理小后台：在线编辑资料与项目并导出 data.js', done: true },
            { text: 'V4 访问统计（匿名计入访客）+ 反馈回执闭环', done: true },
            { text: 'V4 部署与分享优化：分享卡片、图标、站点地图、404 指引', done: true }
          ]
        },
        {
          title: 'V5 计划',
          items: [
            { text: '装进桌面：离线可用的 PWA', done: false },
            { text: '多套配色方案可切换', done: false },
            { text: '内容多语言切换', done: false },
            { text: '社区消息搜索与筛选', done: false }
          ]
        }
      ]
    }
  };
})();
