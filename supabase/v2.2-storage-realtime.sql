-- ==========================================================
-- 个人主页 V2.2 · Supabase 云端配置
-- 使用方式：Supabase 控制台 → SQL Editor → New query → 整段粘贴 → Run
-- 说明：三段都是幂等的，重复执行不会报错
-- ==========================================================

-- 1) 头像桶 avatars：公开读、单文件 ≤ 2MB、仅图片格式
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 2097152,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- 2) 允许匿名上传头像（只允许写入 avatars 桶）
do $$ begin
  create policy "avatars anon insert" on storage.objects
    for insert to anon
    with check (bucket_id = 'avatars');
exception when duplicate_object then null; end $$;

-- 3) community_messages 加入 Realtime 实时发布
do $$ begin
  alter publication supabase_realtime add table public.community_messages;
exception when duplicate_object then null; end $$;

-- 4) 核对：应看到 avatars 桶 1 行、community_messages 订阅 1 行
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'avatars';

select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime';
