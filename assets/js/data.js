window.PROFILE_DATA = {
  name: "张聿辰",

  /* 头像：把真实照片放在 assets/img/avatar.jpg
     如果文件不存在，会自动回退到内置矢量图标 */
  avatar: "./assets/img/avatar.jpg",

  /* 开场依次弹出的消息 */
  introMessages: [
    { type: "profile", name: "张聿辰" },
    { type: "text", text: "大一 · 计算机科学与技术" },
    { type: "text", text: "探索者" }
  ],

  /* 第四条：菜单信息框 */
  menuMessage: {
    title: "了解更多",
    options: [
  {
    label: '关于我',
    prompt: '请用2-3句话介绍张聿辰，他是计算机科学与技术专业的大一学生，对Web开发、AI应用和产品设计感兴趣。',
    answer: ''   // answer 不再用，留空即可
  },
  {
    label: '当前技能',
    prompt: '张聿辰目前掌握HTML & CSS、Python基础、Vibe Coding、UI/UX设计和团队协作。请用2-3句话概括他的技能。',
    answer: ''
  },
  {
    label: '项目经历',
    prompt: '张聿辰做过三个项目：个人主页V1、校园小程序需求调研与原型、Markdown自学笔记库。请用2-3句话介绍。',
    answer: ''
  },
  {
    label: '下一步计划',
    prompt: '张聿辰下一步计划迭代V2：替换真实头像、补充项目链接、优化排版、添加暗色模式。请用2-3句话说明。',
    answer: ''
  }
]
  },

  /* 第五条：联系我信息框 */
  contactMessage: {
    title: "联系我",
    email: "you@example.com",
    label: "发送邮件"
  },

  changelog: {
    date: "2026年9月",
    version: "V1.4",
    groups: [
      {
        title: "已完成",
        items: [
          { text: "移除页面中的表情符号", done: true },
          { text: "聊天组件拆分为独立文件", done: true },
          { text: "修复修改日志弹窗", done: true },
          { text: "姓名头像改为首条消息，标语拆成两条依次滑出", done: true },
          { text: "减速入场动画，加入模糊与缩放的质感", done: true },
          { text: "取消总边框，改为从网页左侧滑出", done: true },
          { text: "菜单与联系方式统一为信息框形式", done: true },
          { text: "配色切换为黑白灰高级灰调", done: true },
          { text: "添加暗色模式切换，跟随系统并可手动记忆", done: true },
          { text: "移动端间距全面精修", done: true },
          { text: "头像支持真实照片，未提供时回退到矢量图", done: true }
        ]
      },
      {
        title: "V2 待办",
        items: [
          { text: "补充真实项目链接（GitHub / 报告）", done: false },
          { text: "给页面加一个简短的进入过场", done: false },
          { text: "尝试横向滑入与纵向错落结合的节奏", done: false },
          { text: "导出为可分享的单文件版本", done: false }
        ]
      }
    ]
  }
};