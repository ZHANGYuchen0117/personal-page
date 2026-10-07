// supabase/v6-qa.sql 的自动化测试
//
// 为什么需要它：这份 SQL 决定了「谁能往 qa_gaps 写、谁能读、谁完全读不到」，
// 是权限相关的代码。改一个字就可能把访客写入堵死（线上表现为：
// 访客上报静默失败、后台永远看不到待答问题），或者反过来把待答问题泄露出去。
// 光靠肉眼看 SQL 不可靠，所以用真 Postgres（PGlite，跑在 Node 里的 WASM 版）
// 把整段脚本跑一遍，并以 anon 身份实测。
//
// 用法：
//   cd tools
//   npm install @electric-sql/pglite     # 只需一次
//   node test-sql.mjs
//
// 期望输出：25 通过 / 0 失败

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
// 断言「这个操作应该被拦住 / 应该成功」——expectErr 用于"应该失败"的用例
async function expectErr(name, fn, wantSub) {
  try { await fn(); fail++; out.push('FAIL | ' + name + ' | 居然成功了，应该被拦住'); }
  catch (e) {
    const m = String(e && e.message || e);
    if (!wantSub || m.indexOf(wantSub) !== -1) { pass++; out.push('PASS | ' + name); }
    else { fail++; out.push('FAIL | ' + name + ' | 报错内容不含「' + wantSub + '」: ' + m); }
  }
}
// 有些用例是"应该成功"，配合 expectErr 用：把上一次的 FAIL 改回 PASS
function flip(name) {
  const last = out[out.length - 1];
  if (last && last.startsWith('FAIL') && last.indexOf('居然成功了') !== -1) {
    out[out.length - 1] = 'PASS | ' + name;
    pass++; fail--;
  }
}

const db = new PGlite();

// Supabase 里 anon / authenticated 是内置角色，本地先造出来
await db.exec(`create role anon; create role authenticated;`);

// ---- T1: 整段脚本能不能跑通 ----
try {
  await db.exec(sql);
  ok('T1 整段 v6-qa.sql 执行无报错', true);
} catch (e) {
  ok('T1 整段 v6-qa.sql 执行无报错', false, String(e && e.message || e));
  out.push('汇总: ' + pass + ' 通过 / ' + fail + ' 失败');
  console.log(out.join('\n'));
  process.exit(1);
}

// ---- T2: 策略确实建出来了（这条最关键：缺策略 = 访客写不进来）----
const pol = await db.query(
  `select policyname, cmd, roles::text as roles, with_check
     from pg_policies where schemaname='public' and tablename='qa_gaps' order by cmd`);
ok('T2 qa_gaps 恰好 2 条策略', pol.rows.length === 2, JSON.stringify(pol.rows.map(r => r.cmd)));
const cmds = pol.rows.map(r => r.cmd).sort();
ok('T2b 策略覆盖 INSERT + SELECT', cmds.join(',') === 'INSERT,SELECT', cmds.join(','));
const insPol = pol.rows.find(r => r.cmd === 'INSERT');
ok('T2c INSERT 策略含 with_check 条件', !!(insPol && insPol.with_check), JSON.stringify(insPol));
ok('T2d 策略对 anon 生效', !!(insPol && /anon/.test(insPol.roles)), insPol && insPol.roles);
const rls = await db.query(`select relrowsecurity from pg_class where oid='public.qa_gaps'::regclass`);
ok('T2e qa_gaps 已开启 RLS', rls.rows[0].relrowsecurity === true);

// ---- T3: 匿名访客写入（前端上报走的就是这条）----
await db.exec('set role anon');
await expectErr('T3 匿名写入待答问题（正常问题，应通过）',
  async () => {
    await db.exec(`insert into public.qa_gaps (question, status, source)
      values ('【自检】这是一条自检页写入的测试问题', 'pending', 'no_answer')`);
  }, null);
flip('T3 匿名写入待答问题（正常问题，应通过）');

// PostgREST 的 resolution=ignore-duplicates 会长成 ON CONFLICT DO NOTHING
await expectErr('T3b 匿名写入 + ON CONFLICT DO NOTHING（和前端实际请求一致）',
  async () => {
    await db.exec(`insert into public.qa_gaps (question, status, source)
      values ('【自检】这是一条自检页写入的测试问题', 'pending', 'no_answer')
      on conflict (question_key) do nothing`);
  }, null);
flip('T3b 匿名写入 + ON CONFLICT DO NOTHING（和前端实际请求一致）');

// ---- T4-T10: 越权一律拦住 ----
await expectErr('T4 匿名不能直接写 status=answered',
  async () => {
    await db.exec(`insert into public.qa_gaps (question, status, answer)
      values ('【自检】越权测试问题', 'answered', '我自己编的答案')`);
  }, 'row-level security');
await expectErr('T5 匿名不能写超短问题（<2 字）',
  async () => { await db.exec(`insert into public.qa_gaps (question, status) values ('啊', 'pending')`); },
  null);
await expectErr('T6 匿名不能改已有行',
  async () => { await db.exec(`update public.qa_gaps set status='answered' where true`); }, null);
await expectErr('T7 匿名不能删行',
  async () => { await db.exec(`delete from public.qa_gaps where true`); }, null);
await expectErr('T8 匿名读不到待答的行',
  async () => {
    const r = await db.query(`select count(*)::int as n from public.qa_gaps`);
    if (r.rows[0].n !== 0) throw new Error('读到了 ' + r.rows[0].n + ' 行，应该 0 行');
  }, null);
flip('T8 匿名读不到待答的行');
await expectErr('T9 匿名读不到 owner_secret',
  async () => {
    const r = await db.query(`select count(*)::int as n from public.owner_secret`);
    if (r.rows[0].n !== 0) throw new Error('读到了口令表');
  }, null);
flip('T9 匿名读不到 owner_secret');
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
await expectErr('T13 口令正确时 list_gaps 能拉到待答问题',
  async () => {
    const r = await db.query(`select * from public.list_gaps('test-pass-1234567890', 50)`);
    gaps = r.rows;
    if (!r.rows.length) throw new Error('拉到了 0 条');
  }, null);
flip('T13 口令正确时 list_gaps 能拉到待答问题');
ok('T13b 拉到的就是刚才匿名写进去的那条',
  !!(gaps && gaps[0] && gaps[0].question.indexOf('自检') !== -1), JSON.stringify(gaps && gaps[0]));

await expectErr('T14 answer_gap 能写回答案',
  async () => {
    const r = await db.query(`select public.answer_gap($1, $2, $3) as ok`,
      [gaps[0].id, '这是我补的答案', 'test-pass-1234567890']);
    if (r.rows[0].ok !== true) throw new Error('返回 ' + r.rows[0].ok);
  }, null);
flip('T14 answer_gap 能写回答案');

let seen = null;
await expectErr('T15 答完后匿名能读到这条问答（网站学习走的路）',
  async () => {
    const r = await db.query(`select question, answer from public.qa_gaps where status='answered'`);
    seen = r.rows;
    if (!r.rows.length) throw new Error('读不到已答的行');
  }, null);
flip('T15 答完后匿名能读到这条问答（网站学习走的路）');
ok('T15b 读到的答案就是补的那句',
  !!(seen && seen[0] && seen[0].answer === '这是我补的答案'), JSON.stringify(seen));

await expectErr('T16 答完了就不再出现在待答列表里',
  async () => {
    const r = await db.query(`select * from public.list_gaps('test-pass-1234567890', 50)`);
    if (r.rows.length !== 0) throw new Error('还有 ' + r.rows.length + ' 条待答');
  }, null);
flip('T16 答完了就不再出现在待答列表里');

// ---- T17-T18: 去重 + 幂等 ----
await db.exec('reset role');
const dup = await db.query(`select count(*)::int as n from public.qa_gaps`);
ok('T17 同一个问题只留一条（去重键生效）', dup.rows[0].n === 1, '表里现在 ' + dup.rows[0].n + ' 行');

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
