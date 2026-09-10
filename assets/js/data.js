window.PROFILE_DATA = {
  name: "张聿辰",

  /* 开场依次弹出的消息 */
  introMessages: [
    { type: "profile", name: "张聿辰" },                 // 第一条：头像 + 姓名
    { type: "text", text: "大一 · 计算机科学与技术" },     // 第二条
    { type: "text", text: "探索者" }                      // 第三条
  ],

  /* 第四条：菜单信息框（4 个选项） */
  menuMessage: {
    title: "了解更多",
    options: [
      {
        label: "关于我",
        answer: "你好，我是张聿辰，目前就读于计算机科学与技术专业大一。我对 Web 开发、AI 应用和产品设计感兴趣。"
      },
      {
        label: "当前技能",
        answer: "HTML & CSS、Python 基础、Vibe Coding、UI/UX 设计、团队协作。"
      },
      {
        label: "项目经历",
        answer: "课程作业：个人主页 V1；新生创新项目：校园小程序需求调研与原型；自学笔记库：Markdown 知识管理。"
      },
      {
        label: "下一步计划",
        answer: "继续迭代 V2：真实头像、项目链接、排版优化和暗色模式。"
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
    version: "V1.3",
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
          { text: "菜单与联系方式统一为信息框形式，便于后续扩展", done: true },
          { text: "配色切换为黑白灰高级灰调，去除蓝色", done: true },
          { text: "修改日志缩小，沉到页面最下角居中", done: true }
        ]
      },
      {
        title: "V2 待办",
        items: [
          { text: "替换真实头像", done: false },
          { text: "补充真实项目链接", done: false },
          { text: "调整移动端间距", done: false },
          { text: "添加暗色模式切换", done: false }
        ]
      }
    ]
  }
};