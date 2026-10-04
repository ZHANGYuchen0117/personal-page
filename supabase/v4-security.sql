-- ============================================================
-- 个人主页 V4 · 安全基线（Supabase SQL Editor 里整段执行，可重复执行）
--
-- 用法：Supabase 控制台 → SQL Editor → New query → 整段粘贴 → Run
-- 本文件是幂等的：重复跑不会报错、不会重复建对象。
--
-- 【先搞清楚一件事】
--   assets/js/supabase-config.js 里的 anonKey 是 Supabase 的「公开密钥」，
--   它的 JWT 里写着 "role":"anon"，设计上就是要放进前端代码、也一定会出现在
--   部署出去的 HTML 里的。所以它被提交到 GitHub 并不等于泄露。
--   真正的安全边界是下面这些 RLS 策略 —— 匿名用户能做什么、不能做什么。
--
-- 【本文件做的事】
--   1. community_messages：公开可读 + 只能新增，禁止匿名改/删任何人的留言
--   2. community_users  ：只允许新增，禁止读取（保护手机号 / 邮箱）
--   3. visits           ：只允许写入，禁止读取（包含建表，等效于 v4-visits.sql）
--   4. storage avatars  ：只允许写自己那个 uuid 命名的文件，禁止覆盖/删除
--
-- 【核心思想】Postgres 的 RLS 是「默认拒绝」：
--   没写策略 = 该操作一律拒绝。所以下面有些操作是「故意不写策略」的，
--   不要为了「顺手」去补 update / delete 策略。
-- ============================================================


-- ============================================================
-- 1) 留言表 community_messages
-- ============================================================
create table if not exists public.community_messages (
  id         uuid primary key default gen_random_uuid(),
  nickname   text,
  content    text,
  client_id  text,
  created_at timestamptz not null default now(),
  user_id    uuid,
  avatar     text
);

-- 打开行级安全：这一句是「留言板不被清空」的开关
alter table public.community_messages enable row level security;

-- 长度上限，和前端 maxlength 对齐（昵称 20 / 正文 500），顺便挡掉刷屏用的超长文本
do $$ begin
  alter table public.community_messages
    add constraint community_messages_content_len
    check (content is null or char_length(content) between 1 and 500) not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.community_messages
    add constraint community_messages_nickname_len
    check (nickname is null or char_length(nickname) between 1 and 20) not valid;
exception when duplicate_object then null; end $$;

-- 头像可能是内嵌的 128x128 压缩图（约 10KB 的 data URI），给个宽松上限即可
do $$ begin
  alter table public.community_messages
    add constraint community_messages_avatar_len
    check (avatar is null or char_length(avatar) <= 200000) not valid;
exception when duplicate_object then null; end $$;

-- 允许所有人读（这就是一个公开留言板）
drop policy if exists "messages anon read" on public.community_messages;
create policy "messages anon read"
  on public.community_messages
  for select
  to anon, authenticated
  using (true);

-- 允许所有人新增，但必须带上合规的昵称和正文
drop policy if exists "messages anon insert" on public.community_messages;
create policy "messages anon insert"
  on public.community_messages
  for insert
  to anon, authenticated
  with check (
    char_length(coalesce(content, '')) between 1 and 500
    and char_length(coalesce(nickname, '')) between 1 and 20
  );

-- 注意：这里【故意没有】update / delete 策略。
-- 匿名用户不能改、不能删任何一条留言 —— 包括他自己发的。
-- 下面这两句是双保险：即使将来有人误加了策略，权限也收不回来。
revoke update, delete on public.community_messages from anon, authenticated;

create index if not exists community_messages_created_at_idx
  on public.community_messages (created_at desc);


-- ============================================================
-- 2) 用户表 community_users：只进不出（保护手机号 / 邮箱）
-- ============================================================
create table if not exists public.community_users (
  id         uuid primary key,
  name       text,
  phone      text,
  email      text,
  avatar     text,
  created_at timestamptz not null default now()
);

alter table public.community_users enable row level security;

do $$ begin
  alter table public.community_users
    add constraint community_users_field_len
    check (
      char_length(coalesce(name, '')) between 1 and 20
      and char_length(coalesce(phone, '')) <= 20
      and char_length(coalesce(email, '')) <= 100
      and char_length(coalesce(avatar, '')) <= 200000
    ) not valid;
exception when duplicate_object then null; end $$;

-- 只允许注册时新增
drop policy if exists "users anon insert" on public.community_users;
create policy "users anon insert"
  on public.community_users
  for insert
  to anon, authenticated
  with check (char_length(coalesce(name, '')) between 1 and 20);

-- 故意不写 select 策略：匿名读不到任何一行，手机号 / 邮箱不会被遍历走
revoke select, update, delete on public.community_users from anon, authenticated;
-- 但注册要能写入，所以把 insert 权限显式留下
grant insert on public.community_users to anon, authenticated;


-- ============================================================
-- 3) 访问统计 visits：只写不读（等效于 v4-visits.sql，跑过也没关系）
-- ============================================================
create table if not exists public.visits (
  id         bigserial primary key,
  path       text,
  referrer   text,
  lang       text,
  screen     text,
  session_id text,
  created_at timestamptz not null default now()
);

alter table public.visits enable row level security;

-- 字段长度上限：挡住「有人拿这个接口塞垃圾 / 塞大文本」
do $$ begin
  alter table public.visits
    add constraint visits_field_len
    check (
      char_length(coalesce(path, '')) <= 300
      and char_length(coalesce(referrer, '')) <= 300
      and char_length(coalesce(lang, '')) <= 40
      and char_length(coalesce(screen, '')) <= 40
      and char_length(coalesce(session_id, '')) <= 64
    ) not valid;
exception when duplicate_object then null; end $$;

drop policy if exists "visits anon insert" on public.visits;
create policy "visits anon insert"
  on public.visits
  for insert
  to anon, authenticated
  with check (true);

-- 故意不写 select 策略：统计数字只有你自己在控制台看得到
revoke select, update, delete on public.visits from anon, authenticated;
grant insert on public.visits to anon, authenticated;

create index if not exists visits_created_at_idx on public.visits (created_at desc);


-- ============================================================
-- 4) 头像桶 avatars：公开读，只能写自己那个 uuid 文件
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 2097152,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- 收紧了原来的「只检查 bucket_id」：
-- 文件名必须是 36 位 uuid + .jpg（前端就是 <user_id>.jpg），
-- 这样别人没法往这个桶里塞任意命名的垃圾文件。
drop policy if exists "avatars anon insert" on storage.objects;
create policy "avatars anon insert"
  on storage.objects
  for insert
  to anon, authenticated
  with check (
    bucket_id = 'avatars'
    and name ~ '^[0-9a-fA-F-]{36}\.jpg$'
  );

-- 故意不写 update / delete 策略：任何人都覆盖或删除不了别人的头像
revoke update, delete on storage.objects from anon, authenticated;


-- ============================================================
-- 5) 执行完自查：这几条查询的结果应该是
--    rls_enabled 全为 true；policies 里每个表只有读/写各一条
-- ============================================================
select c.relname as "表名", c.relrowsecurity as "已开启RLS"
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('community_messages', 'community_users', 'visits')
 order by 1;

select tablename as "表名", policyname as "策略名", cmd as "操作"
  from pg_policies
 where schemaname in ('public', 'storage')
   and tablename in ('community_messages', 'community_users', 'visits', 'objects')
 order by 1, 3;
