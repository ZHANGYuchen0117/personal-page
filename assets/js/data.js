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
      stage: '个人主页已迭代到 V5，已上线社区消息搜索与筛选、公告栏'
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
        desc: '聊天式页面，已迭代到 V5：AI 问答（回答以页面资料为准）、社区注册与发言（头像存云端）、消息实时推送/分页/搜索与筛选、公告栏、反馈入口、手机端适配、单文件版与内容小后台',
        link: 'https://github.com/ZHANGYuchen0117/personal-page'
      },
      { name: '校园小程序', desc: '需求调研与原型' },
      { name: 'Markdown 自学笔记库' }
    ],

    /* 迭代计划：版本 / 主题 / 具体事项（只写「还没做」的） */
    plan: [
      {
        version: 'V5',
        theme: '更好用、更好看',
        items: ['装进桌面：离线可用的 PWA', '多套配色方案', '内容多语言切换']
      }
    ]
  };

  /* ==========================================================
   * 公告栏（V5）：打开网页自动弹出，也可以从页脚「公告」进入
   *
   * 怎么改内容：直接改下面 sections 里的文字就行，
   * 每条 items 一行，页面上按顺序显示。
   * autoShow 控制自动弹出的频率：
   *   'session'（默认）一个浏览器会话只弹一次
   *   'daily'  每天第一次打开弹一次
   *   'always' 每次打开都弹
   *   'off'    不自动弹，只从页脚进入
   * ========================================================== */
  const ANNOUNCEMENT = {
    date: '2026年10月',
    badge: '置顶',
    autoShow: 'session',
    intro: '近况都写在这里，会随时更新。',
    sections: [
      {
        title: '项目进展',
        items: [
          '个人主页已迭代到 V5：社区消息可以搜索和筛选了',
          '新增公告栏，打开网页就能看到近况',
          'V4 已完成：AI 问答、社区注册发言、头像云端存储、消息实时推送、手机端适配',
          '接下来：装进桌面（PWA）、多套配色方案、内容多语言切换'
        ]
      },
      {
        title: '篮球比赛',
        items: [
          '计划参加校内外篮球比赛，以赛代练',
          '近期重点练体能储备和投篮稳定性',
          '具体赛程确定后会在公告里更新'
        ]
      },
      {
        title: '健身计划',
        items: [
          '每周 3 次力量训练，胸 / 背 / 腿分开练',
          '每次训练前后各 10 分钟热身与拉伸',
          '保证每天 7 小时以上睡眠，不熬夜'
        ]
      },
      {
        title: '学习计划',
        items: [
          '主抓专业基础课，重点是数学和编程',
          '每周整理一次 Markdown 笔记',
          '持续做 Web 和 AI 相关的动手项目'
        ]
      }
    ]
  };

  /* 把公告压成一行，喂给 AI —— 访客问「有什么公告」也能答对 */
  function announcementText() {
    return ANNOUNCEMENT.sections.map(function (s) {
      return s.title + '：' + s.items.join('；');
    }).join('。');
  }

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

  /* 自由输入的问题：把页面上的资料一并带上。
     不这么做的话，后端 AI 只能凭它自己那份已经过期的知识回答
     （实测会把专业答成「计算机科学」、把项目答成泛泛的「软件开发」）。
     菜单按钮的 prompt 本来就已经带了完整资料，所以只给自由输入补这一层。 */
  function questionPrompt(question) {
    const facts = CONTENT.about.facts.concat([CONTENT.about.stage]);
    const skills = CONTENT.skills.map(function (s) {
      return s.note ? s.name + '（' + s.note + '）' : s.name;
    }).join('、');
    const projects = CONTENT.projects.map(function (p) {
      const bits = [];
      if (p.desc) bits.push(p.desc);
      if (p.link) bits.push('GitHub 仓库：' + p.link);
      return bits.length ? p.name + '（' + bits.join('，') + '）' : p.name;
    }).join('、');
    const plan = CONTENT.plan.map(function (stage) {
      return stage.version + ' ' + stage.theme + '（' + stage.items.join('、') + '）';
    }).join('；');

    return '请只依据以下信息回答访客的问题，用2-3句话，语气自然。' + RULE + '\n' +
      '姓名：' + NAME + '\n' +
      '关于：' + facts.join('，') + '\n' +
      '技能：' + skills + '\n' +
      '项目：' + projects + '\n' +
      '接下来：' + plan + '\n' +
      '最新公告：' + announcementText() + '\n' +
      '联系方式：页面上的「联系我」里有微信二维码，扫码即可加好友。\n' +
      '访客的问题：' + question;
  }

  window.PROFILE_DATA = {
    name: NAME,

    /* 头像：把真实照片放在 assets/img/avatar.jpg
       如果文件不存在，会自动回退到内置矢量图标 */
    avatar: './assets/img/avatar.jpg',

    /* 内容数据（V3）：关于我 / 技能 / 项目 / 计划 */
    content: CONTENT,

    /* 给自由输入的问题补上页面资料（菜单按钮自己有完整 prompt，不走这里） */
    questionPrompt: questionPrompt,

    /* 公告栏（V5）：页脚「公告」入口 + 打开网页自动弹出 */
    announcement: ANNOUNCEMENT,

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
      version: 'V5',
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
            { text: 'V4 部署与分享优化：分享卡片、图标、站点地图、404 指引', done: true },
            { text: 'AI 问答更稳更准：偶发断线自动重试，回答一律以页面资料为准，真连不上就用本地资料兜底', done: true },
            { text: 'V5 社区消息搜索与筛选：按内容或昵称搜索，可只看自己的消息', done: true },
            { text: 'V5 公告栏：打开网页自动弹出，项目 / 篮球 / 健身 / 学习一屏看完', done: true }
          ]
        },
        {
          title: '接下来',
          items: [
            { text: '装进桌面：离线可用的 PWA', done: false },
            { text: '多套配色方案可切换', done: false },
            { text: '内容多语言切换', done: false }
          ]
        }
      ]
    }
  };
})();
