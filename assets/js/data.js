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
    version: "V2.1",
    groups: [
      {
        title: "已完成",
        items: [
          { text: "聊天式个人主页 V1 系列", done: true },
          { text: "接入 AI 自由提问", done: true },
          { text: "反馈入口 + 云端数据库", done: true },
          { text: "社区交流功能", done: true },
          { text: "图标悬停微动效", done: true },
          { text: "社区注册：昵称、手机号、邮箱、头像", done: true }
        ]
      },
      {
        title: "V2.2 待办",
        items: [
          { text: "头像上传改走 Supabase Storage", done: false },
          { text: "消息实时推送（Realtime）", done: false },
          { text: "社区消息分页加载", done: false }
        ]
      }
    ]
  }
};