-- ============================================================
-- 个人主页 V6 · AI 孪生「答不上来就回报」闭环
--
-- 用法：Supabase 控制台 → SQL Editor → New query → 整段粘贴 → Run
-- 本文件是幂等的：重复执行不会报错、不会重复建对象。
--
-- 【它解决什么】
--   访客问了一个孪生没学过的问题时：
--     1. 前端把这个问题记进 qa_gaps（status=pending）
--     2. 我在后台输入口令，看到待答列表，填上答案
--     3. 答案写回 qa_gaps（status=answered），网站立刻就能用它回答
--     4. 同时这份问答会被写进 data.js，成为永久的训练文本
--
-- 【为什么不用 Supabase Auth】
--   这个项目是纯静态站 + anon key，没有账号体系。为「只有我能写答案」
--   这件事单独接一套登录太重，所以用「本人口令 + 数据库端校验函数」：
--   写操作只能通过 security definer 函数进行，函数内部校验口令。
--   口令只在 SQL Editor 里设置一次，不进仓库、不进前端代码。
--
-- 【安全边界】
--   * anon 只能「新增」待答问题，不能读、不能改、不能删任何行
--   * anon 只能「读」已答的行（网站靠它学习答案；这也是要公开的内容）
--   * 待答的行（含别人的提问）anon 读不到，必须持口令走函数
--   * owner_secret 表开了 RLS 且没有任何策略 = 谁也别想读
--   * 口令请设长一点（建议 24 位以上随机串），函数里用 = 比较，
--     配合 HTTPS 与长口令，爆破不现实
-- ============================================================


-- ============================================================
-- 1) 表：qa_gaps（知识缺口 / 已学会的问答）
-- ============================================================
create table if not exists public.qa_gaps (
  id           uuid primary key default gen_random_uuid(),
  question     text not null,
  -- 归一化后的去重键（小写 + 去首尾空白），由数据库自动计算，前端伪造不了
  question_key text generated always as (lower(btrim(question))) stored,
  answer       text,
  status       text not null default 'pending',
  source       text,
  created_at   timestamptz not null default now(),
  answered_at  timestamptz
);

alter table public.qa_gaps enable row level security;

-- 长度 / 取值约束（not valid：不校验历史数据，但对新写入生效）
do $$ begin
  alter table public.qa_gaps
    add constraint qa_gaps_question_len
    check (char_length(btrim(question)) between 2 and 300) not valid;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.qa_gaps
    add constraint qa_gaps_answer_len
    check (answer is null or char_length(btrim(answer)) between 1 and 2000) not valid;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.qa_gaps
    add constraint qa_gaps_status_chk
    check (status in ('pending', 'answered')) not valid;
exception when duplicate_object then null; end $$;

-- 同一个问题只留一条（配合前端 Prefer: resolution=ignore-duplicates）
create unique index if not exists qa_gaps_question_key_uidx
  on public.qa_gaps (question_key);

create index if not exists qa_gaps_status_idx
  on public.qa_gaps (status, created_at desc);


-- ============================================================
-- 2) 策略：anon 只能「新增待答」和「读已答」
--    —— 故意不写 update / delete 策略，RLS 默认拒绝
-- ============================================================
drop policy if exists "qa_gaps anon insert" on public.qa_gaps;
create policy "qa_gaps anon insert"
  on public.qa_gaps for insert to anon, authenticated
  with check (
    char_length(btrim(question)) between 2 and 300
    and status = 'pending'
    and answer is null
  );

drop policy if exists "qa_gaps anon read answered" on public.qa_gaps;
create policy "qa_gaps anon read answered"
  on public.qa_gaps for select to anon, authenticated
  using (status = 'answered' and answer is not null);

revoke update, delete, truncate on public.qa_gaps from anon, authenticated;
grant insert, select on public.qa_gaps to anon, authenticated;


-- ============================================================
-- 3) 表：owner_secret（本人口令，只有定义者函数能读到）
-- ============================================================
create table if not exists public.owner_secret (
  key   text primary key,
  value text not null
);

alter table public.owner_secret enable row level security;
-- 故意不建任何策略：anon 连一行都读不到
revoke all on public.owner_secret from anon, authenticated;


-- ============================================================
-- 4) 函数：口令校验 + 读待答 + 写答案
-- ============================================================

-- 4.1 口令校验（不给 anon 执行权限，只作为下面两个函数的内部工具）
create or replace function public.qpass_ok(pass text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.owner_secret
     where key = 'answer_pass'
       and value = pass
       and char_length(value) >= 8
  );
$$;

revoke all on function public.qpass_ok(text) from anon, authenticated;


-- 4.2 列出待我回答的问题
create or replace function public.list_gaps(pass text, limit_n int default 50)
returns table (id uuid, question text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.qpass_ok(pass) then
    raise exception '口令不对，或还没设置口令（见 v6-qa.sql 第 6 节）';
  end if;

  return query
    select g.id, g.question, g.created_at
      from public.qa_gaps g
     where g.status = 'pending'
     order by g.created_at desc
     limit greatest(1, least(coalesce(limit_n, 50), 200));
end $$;


-- 4.3 提交答案（写完立刻被网站读到）
-- 注意：参数名 answer 和列名 answer 同名，所以先用局部变量接一下，
-- 避免 plpgsql 里出现「到底指哪个」的歧义。
create or replace function public.answer_gap(gap_id uuid, answer text, pass text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_answer text;
begin
  if not public.qpass_ok(pass) then
    raise exception '口令不对，或还没设置口令（见 v6-qa.sql 第 6 节）';
  end if;

  v_answer := btrim(coalesce(answer, ''));

  if char_length(v_answer) < 1 or char_length(v_answer) > 2000 then
    raise exception '答案长度需要在 1 - 2000 字之间';
  end if;

  update public.qa_gaps
     set answer = v_answer,
         status = 'answered',
         answered_at = now()
   where id = gap_id
     and status = 'pending';

  return found;
end $$;


grant execute on function public.list_gaps(text, int)   to anon, authenticated;
grant execute on function public.answer_gap(uuid, text, text) to anon, authenticated;


-- ============================================================
-- 5) 自查
-- ============================================================
select c.relname as "表名", c.relrowsecurity as "已开启RLS"
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('qa_gaps', 'owner_secret')
 order by 1;

select tablename as "表名", policyname as "策略名", cmd as "操作"
  from pg_policies
 where schemaname = 'public'
   and tablename = 'qa_gaps'
 order by 3;

-- 应该看到：qa_gaps 2 条策略（INSERT / SELECT），owner_secret 0 条策略


-- ============================================================
-- 6) 【重要】设置本人口令 —— 只在这个 SQL Editor 里执行，不要写进仓库！
--
--   把下面的 'ChangeMe-请换成你自己的长口令' 换成你自己的口令（24 位以上随机串），
--   执行一次。之后在 admin.html 的「待我回答」面板里输入同一个口令即可。
--   想换口令就再执行一次同样的语句（on conflict 会覆盖）。
-- ============================================================
-- insert into public.owner_secret (key, value)
-- values ('answer_pass', 'ChangeMe-请换成你自己的长口令')
-- on conflict (key) do update set value = excluded.value;

-- 想确认口令是否已设置（只显示是否设置，不显示内容）：
-- select key, char_length(value) as "口令长度" from public.owner_secret;
