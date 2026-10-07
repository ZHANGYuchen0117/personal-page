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
-- 2) 策略：anon 只能「读已答」
--    —— 故意不写 update / delete / insert 策略，RLS 默认拒绝
--
--    ⚠️ 为什么访客写入不用 INSERT 策略、而走下面的 report_gap 函数？
--    PostgREST 处理 INSERT 时内部会带 RETURNING（形如
--      with pgrst_source as (insert ... returning *) select * from pgrst_source
--    ），而 PostgreSQL 一旦看到 RETURNING，就会拿 **SELECT 策略** 去检查
--    刚插入的那一行。我们的 SELECT 策略只允许读「已答」的行，于是刚写进去的
--    「待答」行读不回来，直接报：
--      42501 new row violates row-level security policy for table "qa_gaps"
--    注意：裸 INSERT（不带 RETURNING）是完全正常的，所以这个坑很隐蔽 ——
--    必须按 PostgREST 的实际写法测（tools/test-sql.mjs 里有这条回归用例）。
--    把写入挪进 security definer 函数后，插入以表主身份进行、RLS 不生效，
--    函数返回 void 也不会把行读回来，从结构上绕开了这个问题。
-- ============================================================
-- 老版本留下的直写策略，如果你之前跑过旧脚本，这里把它清掉
drop policy if exists "qa_gaps anon insert" on public.qa_gaps;

drop policy if exists "qa_gaps anon read answered" on public.qa_gaps;
create policy "qa_gaps anon read answered"
  on public.qa_gaps for select to anon, authenticated
  using (status = 'answered' and answer is not null);

revoke update, delete, truncate on public.qa_gaps from anon, authenticated;
-- 访客不再需要直写权限：写入统一走 report_gap()（见 4.0）
revoke insert on public.qa_gaps from anon, authenticated;
grant select on public.qa_gaps to anon, authenticated;


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
-- 4) 函数：访客上报 + 口令校验 + 读待答 + 写答案
-- ============================================================

-- 4.0 访客上报一个问题（前端唯一能用的写入口）
--     security definer：以表主身份插入，不经过 RLS，也就绕开了上面说的
--     RETURNING 陷阱；返回 void，所以不会把行读回来。
--     客户端只能传「问题 + 来源」，status / answer 由函数写死，改不了。
create or replace function public.report_gap(q text, src text default 'ai_unknown')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_q   text;
  v_src text;
begin
  v_q := btrim(coalesce(q, ''));
  if char_length(v_q) < 2 or char_length(v_q) > 300 then
    raise exception '问题长度需要在 2 - 300 字之间';
  end if;

  v_src := case when src in ('ai_unknown', 'no_answer') then src else 'ai_unknown' end;

  begin
    insert into public.qa_gaps (question, status, source)
    values (v_q, 'pending', v_src);
  exception
    when unique_violation then
      null;  -- 同一个问题已经报过了，忽略即可（不报错给访客看）
  end;
end $$;

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

-- 注意：PostgreSQL 默认把 EXECUTE 授给 PUBLIC，所以必须连 public 一起收回，
-- 只写 from anon 是收不掉的（实测验证过）。
revoke all on function public.qpass_ok(text) from public, anon, authenticated;


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


grant execute on function public.report_gap(text, text)      to anon, authenticated;
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

-- 应该看到：qa_gaps 只有 1 条策略（SELECT），owner_secret 0 条策略。
-- 写入不再依赖策略，而是走 report_gap() 函数 —— 这是正常的，不是漏了。

-- 顺手确认「访客上报」这条路通了：见仓库里 tools/test-sql.mjs（用真 Postgres 实测），
-- 或在 SQL Editor 里**单独**粘贴执行下面这几句：
--
--   set role anon;
--   select public.report_gap('【自检】临时测试', 'no_answer');
--   reset role;
--   delete from public.qa_gaps where question = '【自检】临时测试';
--
-- ⚠️ 千万不要把 begin / rollback 写进这个脚本里：
-- PostgreSQL 的简单查询协议会把**整批语句当成一个隐式事务**，
-- 末尾一个 rollback 会把前面建的整张表一起撤销（而且不报错，非常难查）。


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
