-- ============================================================
-- 个人主页 V4 —— 访问统计建表（Supabase SQL Editor 里整段执行）
--
-- 说明：
--  * 只允许匿名「写入」一条访问记录，不开放读取，别人拿不走你的数据
--  * 前端只上报：路径 / 来源域名 / 语言 / 屏幕尺寸 / 随机访客号
--    不记录 IP，也不记录任何能定位到个人的信息
--  * 表没建之前页面也能正常跑：上传失败是静默忽略的
-- ============================================================

create table if not exists public.visits (
  id          bigserial primary key,
  path        text,
  referrer    text,
  lang        text,
  screen      text,
  session_id  text,
  created_at  timestamptz not null default now()
);

alter table public.visits enable row level security;

drop policy if exists "visits anon insert" on public.visits;
create policy "visits anon insert"
  on public.visits
  for insert
  to anon, authenticated
  with check (true);

create index if not exists visits_created_at_idx on public.visits (created_at desc);

-- 抽查数据（可选）：
-- select date_trunc('day', created_at) as day, count(*) as pv,
--        count(distinct session_id) as uv
--   from public.visits
--  group by 1 order by 1 desc limit 14;
--
-- 最近 20 条来源：
-- select referrer, path, created_at from public.visits order by created_at desc limit 20;
--
-- 清理探针/测试数据：
-- delete from public.visits where session_id like 'v%test%';