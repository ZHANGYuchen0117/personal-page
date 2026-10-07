// supabase/v6-qa.sql 的自动化测试
//
// 为什么需要它：这份 SQL 决定了「谁能上报、谁能读、谁完全读不到」，是权限相关的代码。
// 改错一个字就可能把访客上报堵死（线上表现是：访客上报静默失败、后台永远看不到
// 待答问题），或者反过来把待答问题泄露出去。光靠肉眼看 SQL 不可靠。
//
// 最重要的教训（T3c）：**必须按 PostgREST 实际的写法测**。
// PostgREST 处理 INSERT 时会带 RETURNING，而 PostgreSQL 见到 RETURNING 就会用
// SELECT 策略去检查刚插入的行 —— 只测裸 INSERT 会得出「脚本没问题」的错误结论。
//
// 用法：
//   cd tools
//   npm install @electric-sql/pglite     # 只需一次
//   node test-sql.mjs
//
// 期望输出：26 通过 / 0 失败

import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SQL_FILE = path.join(HERE, '..', 'supabase', 'v6-qa.sql');
const sql = fs.readFileSync(SQL_FILE, 'utf8');

let pass = 0, fail = 0;
const out = [];
function ok(name, cond, extra) {
  if (cond) { pass++; out.push('PASS | ' + name); }
  else { fail++; out.push('FAIL | ' + name + (extra ? ' | ' + extra : '')); }
}
// 「应该失败」的用例
async function expectErr(name, fn, wantSub) {
  try { await fn(); fail++; out.push('FAIL | ' + name + ' | 居然成功了，应该被拦住'); }
  catch (e) {
    const m = String(e && e.message || e);
    if (!wantSub || m.indexOf(wantSub) !== -1) { pass++; out.push('PASS | ' + name); }
    else { fail++; out.push('FAIL | ' + name + ' | 报错不含「' + wantSub + '」: ' + m); }
  }
}
// 「应该成功」的用例
async function expectOk(name, fn) {
  try { await fn(); pass++; out.push('PASS | ' + name); }
  catch (e) { fail++; out.push('FAIL | ' + name + ' | ' + String(e && e.message || e)); }
}
// 「应该失败，且报错里含任意一个关键词」
async function expectErrAny(name, fn, subs) {
  try { await fn(); fail++; out.push('FAIL | ' + name + ' | 居然成功了，应该被拦住'); }
  catch (e) {
    const m = String(e && e.message || e);
    if (!subs || subs.some(s => m.indexOf(s) !== -1)) { pass++; out.push('PASS | ' + name); }
    else { fail++; out.push('FAIL | ' + name + ' | 报错不含 ' + JSON.stringify(subs) + ': ' + m); }
  }
}

const db = new PGlite();

// Supabase 里 anon / authenticated 是内置角色，本地先造出来
await db.exec(`create role anon; create role authenticated;`);

// ---- T1: 整段脚本能不能跑通 ----
try {
  await db.exec(sql);
  ok('T1 整段 v6-qa.sql 执行无报错（含脚本自带的 anon 自查）', true);
} catch (e) {
  ok('T1 整段 v6-qa.sql 执行无报错（含脚本自带的 anon 自查）', false, String(e && e.message || e));
  out.push('汇总: ' + pass + ' 通过 / ' + fail + ' 失败');
  console.log(out.join('\n'));
  process.exit(1);
}

// ---- T2: 策略/权限的期望状态 ----
const pol = await db.query(
  `select policyname, cmd, roles::text as roles from pg_policies
    where schemaname='public' and tablename='qa_gaps' order by cmd`);
ok('T2 qa_gaps 只保留 1 条策略（SELECT）', pol.rows.length === 1,
  JSON.stringify(pol.rows.map(r => r.cmd)));
ok('T2b 唯一策略是 SELECT，且对 anon 生效',
  pol.rows[0] && pol.rows[0].cmd === 'SELECT' && /anon/.test(pol.rows[0].roles),
  JSON.stringify(pol.rows[0]));
const rls = await db.query(`select relrowsecurity from pg_class where oid='public.qa_gaps'::regclass`);
ok('T2c qa_gaps 仍开启 RLS', rls.rows[0].relrowsecurity === true);

// ---- T3: 访客上报走 RPC（前端唯一写入口）----
await db.exec('set role anon');
await expectOk('T3 匿名调 report_gap 上报问题（前端实际走的路）',
  async () => {
    await db.query(`select public.report_gap('【自检】这是一条自检页写入的测试问题', 'no_answer')`);
  });
await expectOk('T3b 同一个问题再报一次也不报错（内部去重）',
  async () => {
    await db.query(`select public.report_gap('【自检】这是一条自检页写入的测试问题', 'no_answer')`);
  });

// ★★★ 回归用例：这就是线上「有策略却写不进去」的真凶 ★★★
// PostgREST 的 INSERT 形如：
//   with pgrst_source as (insert ... returning *) select * from pgrst_source
// RETURNING 会让 PostgreSQL 用 SELECT 策略去检查新行；待答行读不回来 → 42501。
// 用一张临时表把这个陷阱完整复现出来，防止以后有人又把它改回直写。
await db.exec('reset role');   // 建表要用管理员身份
await db.exec(`
  create table public.trap_demo (
    id uuid primary key default gen_random_uuid(),
    question text not null,
    answer text,
    status text not null default 'pending'
  );
  alter table public.trap_demo enable row level security;
  create policy trap_demo_ins on public.trap_demo for insert to anon
    with check (status = 'pending' and answer is null);
  create policy trap_demo_sel on public.trap_demo for select to anon
    using (status = 'answered' and answer is not null);
  grant insert, select on public.trap_demo to anon;
`);
await db.exec('set role anon');
await expectOk('T3c 陷阱复现①：裸 INSERT 是成功的（所以只测这个会误判成"没问题"）',
  async () => { await db.exec(`insert into public.trap_demo (question) values ('陷阱测试甲')`); });
await expectErrAny('T3d 陷阱复现②：带 RETURNING 就报 42501（PostgREST 的实际写法）',
  async () => {
    await db.exec(`with pgrst_source as (
        insert into public.trap_demo (question) values ('陷阱测试乙') returning *
      ) select * from pgrst_source`);
  }, ['row-level security']);
await db.exec('reset role');

// 我们自己的表：匿名直写一律被拒
await db.exec('set role anon');
await expectErrAny('T3e 匿名直写 qa_gaps 被拒（权限或 RLS 都算）',
  async () => {
    await db.exec(`insert into public.qa_gaps (question, status, source)
      values ('【自检】直写测试', 'pending', 'no_answer')`);
  }, ['permission denied', 'row-level security']);

// ---- T4-T5: 函数内的约束 ----
await expectErr('T4 report_gap 拒绝超短问题（<2 字）',
  async () => { await db.query(`select public.report_gap('啊', 'no_answer')`); }, '长度');
await expectOk('T5 正常长度的问题能报上去',
  async () => { await db.query(`select public.report_gap('这是一个正常长度的问题', 'no_answer')`); });

// ---- T6-T10: 越权一律拦住 ----
await expectErr('T6 匿名不能改已有行',
  async () => { await db.exec(`update public.qa_gaps set status='answered' where true`); }, null);
await expectErr('T7 匿名不能删行',
  async () => { await db.exec(`delete from public.qa_gaps where true`); }, null);
await expectOk('T8 匿名能查 qa_gaps，但看不到任何待答行（返回 0 行）',
  async () => {
    const r = await db.query(`select count(*)::int as n from public.qa_gaps`);
    if (r.rows[0].n !== 0) throw new Error('读到了 ' + r.rows[0].n + ' 行，应该 0 行');
  });
await expectErrAny('T9 匿名读不到 owner_secret（被拒或 0 行都算安全）',
  async () => {
    const r = await db.query(`select value from public.owner_secret`);
    if (r.rows.length !== 0) throw new Error('读到了口令表 ' + r.rows.length + ' 行');
  }, ['permission denied', 'row-level security']);
await expectErr('T10 匿名不能直接调 qpass_ok（内部工具不该暴露）',
  async () => { await db.query(`select public.qpass_ok('x')`); }, null);

// ---- T11-T16: 后台那条路（口令 -> 拉待答 -> 写答案 -> 访客读到）----
await db.exec('set role anon');
await expectErr('T11 没设口令时 list_gaps 应该拒绝',
  async () => { await db.query(`select * from public.list_gaps('随便什么', 50)`); }, '口令');
await expectErr('T12 口令错时 list_gaps 应该拒绝',
  async () => { await db.query(`select * from public.list_gaps('wrong-pass-123456', 50)`); }, '口令');

await db.exec('reset role');
await db.exec(`insert into public.owner_secret (key, value)
  values ('answer_pass', 'test-pass-1234567890')
  on conflict (key) do update set value = excluded.value`);

await db.exec('set role anon');
let gaps = null;
await expectOk('T13 口令正确时 list_gaps 能拉到待答问题',
  async () => {
    const r = await db.query(`select * from public.list_gaps('test-pass-1234567890', 50)`);
    gaps = r.rows;
    if (!r.rows.length) throw new Error('拉到了 0 条');
  });
ok('T13b 拉到的列表里包含刚才匿名上报的那条',
  !!(gaps && gaps.some(g => g.question.indexOf('自检') !== -1)),
  JSON.stringify(gaps && gaps.map(g => g.question)));

const target = gaps.find(g => g.question.indexOf('自检') !== -1);
await expectOk('T14 answer_gap 能写回答案',
  async () => {
    const r = await db.query(`select public.answer_gap($1, $2, $3) as ok`,
      [target.id, '这是我补的答案', 'test-pass-1234567890']);
    if (r.rows[0].ok !== true) throw new Error('返回 ' + r.rows[0].ok);
  });

let seen = null;
await expectOk('T15 答完后匿名能读到这条问答（网站学习走的路）',
  async () => {
    const r = await db.query(`select question, answer from public.qa_gaps where status='answered'`);
    seen = r.rows;
    if (!r.rows.length) throw new Error('读不到已答的行');
  });
ok('T15b 读到的答案就是补的那句',
  !!(seen && seen[0] && seen[0].answer === '这是我补的答案'), JSON.stringify(seen));

await expectOk('T16 答完了就不再出现在待答列表里（可能还有别的待答）',
  async () => {
    const r = await db.query(`select * from public.list_gaps('test-pass-1234567890', 50)`);
    if (r.rows.some(x => x.id === target.id)) throw new Error('已答的那条还在待答列表里');
  });

// ---- T17-T18: 去重 + 幂等 ----
await db.exec('reset role');
const dup = await db.query(`select count(*)::int as n from public.qa_gaps where question like '%自检%'`);
ok('T17 同一个问题只留一条（去重生效）', dup.rows[0].n === 1, '表里现在 ' + dup.rows[0].n + ' 行');

try {
  await db.exec(sql);
  ok('T18 整个脚本可以重复执行（幂等）', true);
} catch (e) {
  ok('T18 整个脚本可以重复执行（幂等）', false, String(e && e.message || e));
}

out.push('');
out.push('汇总: ' + pass + ' 通过 / ' + fail + ' 失败');
console.log(out.join('\n'));
process.exit(fail ? 1 : 0);
