/* ============================================================
 * Supabase 连接配置
 *
 * 注意 anonKey 是 Supabase 的「公开密钥」（JWT 里 role 写着 anon），
 * 它被提交到仓库、被打进 dist、被浏览器下载，都是设计如此，不算泄露 ——
 * Supabase 官方就要求把 anon key 放在前端。真正决定安全的是数据库的
 * RLS 策略，见 supabase/v4-security.sql，改动数据权限请改那个文件。
 *
 * 绝对不要把这个文件里的 anonKey 换成 service_role key：
 * service_role 会绕过所有 RLS，等于把数据库交出去。
 * ============================================================ */
window.SUPABASE_CONFIG = {
  url: 'https://qnctdjwoylhfbqigqkje.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFuY3RkandveWxoZmJxaWdxa2plIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2MzAxODYsImV4cCI6MjEwNTIwNjE4Nn0.j6KMMpwOHU_hwAtL3WNYO7EbVsSwJ5ZhvWa1MhyG1l8'
};