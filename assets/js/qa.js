/* ==========================================================
 * AI 孪生「持续训练」模块（V6）
 *
 * 两件事：
 *  1) 学习：把本人已经补答过的问答从云端拉下来，喂进提示词。
 *     同步先从 localStorage 缓存里读一份，保证断网也有效；
 *     再后台刷新一次。
 *  2) 回报：访客问的问题孪生答不上来时，把问题写进 qa_gaps，
 *     本人在后台补答后，孪生下次就会了。
 *     断网时先排进本地队列，联网后自动补发。
 *
 * 设计约束（跟着项目现状走）：
 *  - 纯静态站 + anon key，没有账号体系，所以「上报」只允许新增；
 *    「读取待答」必须持本人口令走数据库函数（见 supabase/v6-qa.sql）。
 *  - 同一条问题不会被同一个浏览器重复上报（本地去重 +
 *    数据库侧 question_key 唯一索引兜底）。
 *  - 失败一律静默：这个站的 Supabase 在国内偶发不可达，
 *    不能在控制台刷噪音。
 * ========================================================== */

(function () {
  const cfg = window.SUPABASE_CONFIG || {};
  const BASE = cfg.url;
  const KEY = cfg.anonKey;
  const TABLE = 'qa_gaps';

  const KNOWN_KEY = 'qa_known_v1';    /* 已学会的问答（缓存） */
  const QUEUE_KEY = 'qa_gap_queue_v1';/* 待上报的问题（断网排队） */
  const SENT_KEY = 'qa_sent_v1';      /* 本机已上报过的，去重 */

  const MAX_QUEUE = 20;
  const MAX_SENT = 80;
  const MAX_KNOWN = 100;

  const PD = window.PROFILE_DATA || {};
  const UNKNOWN_TOKEN = PD.unknownToken || '__UNKNOWN__';

  const ready = !!(BASE && KEY);

  /* ---------- localStorage 小工具（全部 try/catch，隐私模式也不炸） ---------- */
  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const v = JSON.parse(raw);
      return v == null ? fallback : v;
    } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  /* 归一化：比对「同一个问题」用的键，和数据库里的 question_key 口径一致 */
  function normKey(q) {
    return String(q == null ? '' : q).trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 300);
  }

  /* ---------- 1) 孪生「答不上来」的判断 ---------- */
  /* 主约定：后端 AI 遇到资料里没有的问题时只回 __UNKNOWN__（见 data.js 的 RULE）。
     但实测模型并不总是听话 —— 有时它会回「没提到。」这种自然拒绝。
     所以这里三层判断：
       1. 明确出现 __UNKNOWN__ -> 不知道
       2. 整条回复基本就是 unknown -> 不知道
       3. 兜底：回复很短，且整句就是「没提到 / 不知道 / 未提及」这类拒绝 -> 不知道
     第 3 层限定「短回复」，避免正常回答里出现「不知道」被误伤。 */
  const REFUSE_RE = /没(?:有)?(?:提|说|写|讲)(?:到|过|明|及|出)|未(?:提及|提到|说明|包含|收录)|不知道|不清楚|不了解|无法(?:回答|确定|得知|提供)|(?:资料|信息|记录|内容)(?:里|中)?(?:没有|未|无)|没有(?:相关|这方?面|更多)?(?:的)?(?:信息|资料|记录|内容|提及)|不敢(?:确定|乱说)/;

  function isUnknown(text) {
    const raw = String(text == null ? '' : text).trim();
    if (!raw) return false;
    if (raw.indexOf(UNKNOWN_TOKEN) !== -1) return true;
    if (/^[\s"'`*_.\-]*(__)?unknown(__)?[\s"'`*_.\-!！。]*$/i.test(raw)) return true;
    const compact = raw.replace(/\s+/g, '');
    if (compact.length <= 30 && REFUSE_RE.test(compact)) return true;
    return false;
  }

  /* ---------- 2) 已经会的东西 ---------- */
  /* data.js 里永久写死的 + 云端学到的 */
  function knownPairs() {
    const baked = (PD.content && PD.content.qa) || [];
    const runtime = window.QA_KNOWLEDGE || [];
    return baked.concat(runtime);
  }

  function isKnown(question) {
    const k = normKey(question);
    if (k.length < 2) return false;
    return knownPairs().some(function (p) {
      return p && p.q && normKey(p.q) === k;
    });
  }

  /* ---------- 3) 上报知识缺口 ---------- */
  function markSent(k) {
    const sent = read(SENT_KEY, []);
    sent.push(k);
    write(SENT_KEY, sent.slice(-MAX_SENT));
  }

  async function post(question, source) {
    const res = await fetch(BASE + '/rest/v1/' + TABLE + '?on_conflict=question_key', {
      method: 'POST',
      headers: {
        apikey: KEY,
        Authorization: 'Bearer ' + KEY,
        'Content-Type': 'application/json',
        /* 同一个问题只留一条：重复时直接忽略，不报错 */
        Prefer: 'resolution=ignore-duplicates,return=minimal'
      },
      body: JSON.stringify({ question: question, status: 'pending', source: source || 'chat' })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
  }

  /* 把本地队列里的问题尽量发出去；返回成功条数 */
  async function flush() {
    if (!ready) return 0;
    const queue = read(QUEUE_KEY, []);
    if (!queue.length) return 0;

    const left = [];
    let done = 0;
    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      const q = typeof item === 'string' ? item : item.question;
      const src = typeof item === 'string' ? 'chat' : (item.source || 'chat');
      try {
        await post(q, src);
        markSent(normKey(q));
        done++;
      } catch (e) {
        left.push(item);
      }
    }
    write(QUEUE_KEY, left);
    return done;
  }

  /* 记录一个问题；联网就立刻发，断网就排队等下次 */
  async function reportGap(question, source) {
    const q = String(question == null ? '' : question).trim().slice(0, 300);
    if (q.length < 2) return false;

    const k = normKey(q);
    if (read(SENT_KEY, []).indexOf(k) !== -1) return true;   /* 本机已报过 */
    if (isKnown(q)) { markSent(k); return true; }            /* 已经会了 */

    const queue = read(QUEUE_KEY, []);
    if (!queue.some(function (it) {
      return normKey(typeof it === 'string' ? it : it.question) === k;
    })) {
      queue.push({ question: q, source: source || 'chat' });
      write(QUEUE_KEY, queue.slice(-MAX_QUEUE));
    }

    return (await flush()) > 0;
  }

  /* ---------- 4) 学习：拉取已答好的问答 ---------- */
  async function loadAnswered() {
    if (!ready) return window.QA_KNOWLEDGE || [];
    try {
      const res = await fetch(
        BASE + '/rest/v1/' + TABLE +
        '?select=question,answer&status=eq.answered&order=answered_at.desc&limit=' + MAX_KNOWN,
        { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } }
      );
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const rows = await res.json();
      const list = (rows || [])
        .filter(function (r) { return r && r.question && r.answer; })
        .map(function (r) { return { q: r.question, a: r.answer }; });
      window.QA_KNOWLEDGE = list;
      write(KNOWN_KEY, list);
      return list;
    } catch (e) {
      /* 断网：保留同步阶段读出来的缓存 */
      return window.QA_KNOWLEDGE || [];
    }
  }

  /* ---------- 5) 初始化 ---------- */
  function init() {
    /* 先把缓存里的知识同步读出来，保证这一轮提问就能用上 */
    window.QA_KNOWLEDGE = read(KNOWN_KEY, []);
    /* 再后台刷新 + 补发排队的问题；失败静默 */
    loadAnswered();
    flush();
    window.addEventListener('online', function () { flush(); });
  }

  window.QA = {
    isUnknown: isUnknown,
    isKnown: isKnown,
    knownPairs: knownPairs,
    reportGap: reportGap,
    loadAnswered: loadAnswered,
    flush: flush,
    queued: function () { return read(QUEUE_KEY, []).length; }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
