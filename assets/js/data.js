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
    prompt: '请只依据以下信息，用2-3句话介绍张聿辰：计算机科学与技术专业大一学生，对 Web 开发、AI 应用和产品设计感兴趣，个人主页已迭代到 V2.2，正在推进 V3 到 V4 的迭代计划。不要补充未提到的内容。',
    answer: ''   // answer 不再用，留空即可
  },
  {
    label: '当前技能',
    prompt: '请只依据以下信息，用2-3句话概括张聿辰的技能：HTML & CSS、Python 基础、Vibe Coding、UI/UX 设计、团队协作。不要补充未提到的内容。',
    answer: ''
  },
  {
    label: '项目经历',
    prompt: '请只依据以下信息，用2-3句话介绍张聿辰的项目经历，并把个人主页的 GitHub 链接原样写出来：个人主页（聊天式页面，GitHub 仓库：https://github.com/ZHANGYuchen0117/personal-page ，已迭代到 V2.2：AI 问答、反馈入口、社区注册与发言、消息实时推送、消息分页加载）、校园小程序需求调研与原型、Markdown 自学笔记库。不要补充未提到的内容。',
    answer: ''
  },
  {
    label: '下一步计划',
    prompt: '请只依据以下信息，用2句话说明张聿辰接下来的迭代计划（已排到 V4），每句话对应一个版本阶段并各点出一两个具体事项：V3 完善体验与内容（进入过场与滑入节奏、移动端打磨、内容数据化统一管理、可访问性）；V4 走向工程化与分享（可分享的单文件版本、内容管理后台、访问统计与反馈闭环、部署与域名优化）。不要补充未提到的内容。',
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
    version: "V2.2",
    groups: [
      {
        title: "已完成",
        items: [
          { text: "聊天式个人主页 V1 系列", done: true },
          { text: "接入 AI 自由提问", done: true },
          { text: "反馈入口 + 云端数据库", done: true },
          { text: "社区交流功能", done: true },
          { text: "图标悬停微动效", done: true },
          { text: "社区注册：昵称、手机号、邮箱、头像", done: true },
          { text: "注册写入兼容数据库只读策略，注册即可用", done: true },
          { text: "对话区可滚动，右侧常显滚动条（比背景略深）", done: true },
          { text: "头像上传改走 Supabase Storage，不再把图片塞进消息字段", done: true },
          { text: "社区消息实时推送（Realtime），轮询降级兜底", done: true },
          { text: "社区消息分页加载，顶部「加载更早的消息」", done: true },
          { text: "补充真实项目链接（GitHub 仓库）", done: true }
        ]
      },
      {
        title: "V3 计划",
        items: [
          { text: "进入过场 + 横向滑入与纵向错落结合的节奏", done: false },
          { text: "移动端打磨：键盘弹出、滚动位置记忆、手势", done: false },
          { text: "内容数据化：关于我 / 技能 / 项目由一份数据驱动", done: false },
          { text: "可访问性：对比度、键盘操作、减少动效偏好", done: false }
        ]
      },
      {
        title: "V4 计划",
        items: [
          { text: "导出可分享的单文件版本（一个 HTML 就能看）", done: false },
          { text: "内容管理小后台：在线编辑资料与项目", done: false },
          { text: "访问统计与反馈闭环", done: false },
          { text: "部署与域名优化", done: false }
        ]
      }
    ]
  }
};