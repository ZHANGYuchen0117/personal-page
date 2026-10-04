# 个人主页 · 微信消息风

聊天式的个人主页：一进来像打开一个对话框，AI 会替我把「关于我 / 技能 / 项目 / 下一步计划」讲清楚，也可以直接提问、留言、给反馈。

- 在线地址：<https://zhangyuchen0117.github.io/personal-page/>
- 单文件版（一个 HTML 就能看）：`dist/personal-page.html`

## 现在有什么（V4）

| 能力 | 说明 |
| --- | --- |
| 聊天式开场 | 头像 / 标语 / 菜单 / 联系方式依次弹出，横向滑入 + 纵向错落 |
| AI 问答 | 点菜单里的问题，或自己输入任何问题（走 llm-proxy） |
| 内容数据化 | 关于我 / 技能 / 项目 / 计划只写在 `assets/js/data.js` 一份数据里，提示词自动生成 |
| 社区 | 注册（昵称 / 手机号 / 邮箱 / 头像）、发言、消息实时推送、分页加载更早的消息 |
| 反馈 | 提交到云端，并在本机留下「我的反馈」回执 |
| 访问统计 | 每个会话匿名记一条访问，不记 IP，前台不可读，只有我在后台看 |
| 手机端 | 刘海屏安全区、44px 触控尺寸、输入框 16px 防缩放、键盘避让、下拉刷新手势、下拉关闭弹窗、滚动位置记忆 |
| 可访问性 | 文字对比度达标、键盘操作（Esc / Tab 循环 / 焦点样式）、尊重「减少动效」偏好 |
| 联系我 | 微信二维码 + （可选）复制微信号，不再默认发邮件 |
| 内容小后台 | `admin.html` 在线改资料，导出 `data.js` 直接覆盖即可 |
| 分享与收录 | 分享卡片（OG）、站点图标、`robots.txt`、`sitemap.xml`、`404.html` 自动回主页 |

## 目录

```
index.html                 页面本体（含主题变量与页面级样式）
admin.html                 内容小后台（纯前端，不联网也能用）
assets/css/                chat / feedback / community 三个组件样式
assets/js/
  data.js                  全站内容数据 + 由数据生成的 AI 提示词
  chat.js                  对话区：开场节奏、AI 问答、滚动位置记忆
  ai.js                    调 llm-proxy 流式返回
  community.js             社区：注册、发言、实时推送、分页、手势
  feedback.js              反馈提交 + 本机回执
  app.js                   主题、弹窗键盘操作、键盘避让
  gestures.js              触屏手势：下拉关闭弹窗
  visits.js                匿名访问统计
  supabase-config.js       后端地址与匿名 key
tools/build-standalone.py  打包成一个 HTML
dist/personal-page.html    打包产物（可直接发给别人）
404.html / robots.txt / sitemap.xml
```

## 本地预览

```bash
python3 -m http.server 8000        # 然后打开 http://127.0.0.1:8000/
```

## 改内容

1. 打开 `admin.html`（在线或本地都行）
2. 改「关于我 / 技能 / 项目 / 下一步计划」，点「生成 data.js」
3. 下载后覆盖 `assets/js/data.js`，提交推送

AI 回答的口径、修改日志以外的所有文案都跟着这份数据走，不用手写提示词。

## 换「联系我」的二维码

1. 把微信名片二维码存成 `assets/img/wechat-qr.png`（白底、不要裁剪得太紧）
2. 想同时给微信号，就在 `admin.html` 的「联系我」里填上；不填就只显示二维码
3. 重新打包：`python3 tools/build-standalone.py`

规则：二维码和微信号都没填时，页面上不会出现「联系我」框；二维码图片不存在时会自动收起，不会露破图。
单文件版打包时会把二维码内联进去；如果那时仓库里还没有二维码文件，它会把这个字段清空而不是留一条失效路径。

## 生成单文件版

```bash
python3 tools/build-standalone.py            # 输出 dist/personal-page.html
```

它会把 CSS / JS / 头像全部内联，并自检「无外部引用」。适合直接发给别人、或丢到任意静态托管。

## 后端（Supabase）

表 / 桶：`feedback`、`community_users`、`community_messages`、`avatars`（Storage 桶）、`visits`。
匿名策略原则：**只给写入，不给读取**；头像走 Storage 公开读。

- **安全基线（推荐先跑这一个，幂等，包含下面两个）**：`supabase/v4-security.sql`
- 建桶与实时推送：`supabase/v2.2-storage-realtime.sql`
- 访问统计建表：`supabase/v4-visits.sql`
- 页面在表还没建好时会静默跳过，不影响打开

### 关于 anon key 被提交到仓库

`assets/js/supabase-config.js` 里的 `anonKey` 是 Supabase 的**公开密钥**（JWT 里 `role: anon`），
设计上就要放在前端，也必然会随部署的 HTML 一起发出去——**提交到仓库不等于泄露**。
它自己没有任何权限，能做什么完全由 RLS 策略决定。所以：

- 真正的安全边界在 `supabase/v4-security.sql`，要改数据权限请改那里，别在控制台手点
- **绝不能**把 anonKey 换成 `service_role` key：那个会绕过所有 RLS
- 该文件里的策略遵循「默认拒绝」：留言只能新增不能改删、用户表只进不出（保护手机号 / 邮箱）、
  访问统计只写不读、头像只能写自己 uuid 命名的文件且不能覆盖删除
- 如果哪天怀疑密钥被人乱用，在 Supabase 控制台轮换 anon key 即可（改完要同步
  `supabase-config.js` 并重新打包、推送）

## 部署

**GitHub Pages（当前方案）**：推送到 `main` 后自动发布，仓库需为 public、Pages 源选 `main / root`。

注意地址要带仓库名：`https://<用户名>.github.io/personal-page/`（只写域名根会 404，`404.html` 会把人送回来）。

**换成自己的域名**：仓库根目录加 `CNAME` 文件写入域名 → 域名商处把 CNAME 指到 `<用户名>.github.io` → Pages 设置里填域名并开启 HTTPS。

**如果 github.io 访问不畅**：可以
1. 用单文件版 `dist/personal-page.html` 直接发给别人（不依赖任何站点）；
2. 把整个仓库镜像到 Gitee Pages / Cloudflare Pages，改一下 `index.html` 里的 `canonical` 与 OG 绝对地址即可。

## 版本

- V1：聊天式主页、AI 问答、反馈入口
- V2.2 / V2.3：云端头像、社区实时推送与分页、手机端适配
- V3：进入过场节奏、键盘避让与手势、内容数据化、可访问性
- V4：单文件版、内容小后台、访问统计与反馈闭环、分享与收录优化

## 隐私

访问统计只记录路径、来源域名、语言、屏幕尺寸和一个本地随机访客号，不记录 IP；数据只有站点所有者在 Supabase 控制台可见。