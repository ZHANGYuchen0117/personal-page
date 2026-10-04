// assets/js/ai.js
const AI_CONFIG = {
  endpoint: 'https://qnctdjwoylhfbqigqkje.supabase.co/functions/v1/llm-proxy',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFuY3RkandveWxoZmJxaWdxa2plIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2MzAxODYsImV4cCI6MjEwNTIwNjE4Nn0.j6KMMpwOHU_hwAtL3WNYO7EbVsSwJ5ZhvWa1MhyG1l8',
  timeout: 20000   /* 兜住「一直转圈」：超过这个时间就放弃，让调用方走兜底 */
};

/* 把各种底层报错翻译成访客看得懂的说明。
   浏览器原始报错在 Chrome 是 "Failed to fetch"、Safari 是 "Load failed"，
   直接显示给访客毫无意义。 */
function friendlyAIError(err) {
  if (err && err.name === 'AbortError') return 'AI 响应超时了，请稍后重试';
  const msg = String((err && err.message) || '');
  if (err instanceof TypeError || /load failed|failed to fetch|networkerror|network request failed/i.test(msg)) {
    return '当前网络连不上 AI 服务，换个网络再试试';
  }
  if (/^API \d/.test(msg)) return 'AI 服务暂时不可用，请稍后重试';
  return msg || 'AI 暂时无法响应';
}

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

/* 判断是不是「网络层」的偶发失败（Safari 报 Load failed，Chrome 报 Failed to fetch）。
   这类失败重试一次往往就好了；超时（AbortError）不算，重试只会让人多等一倍时间。 */
function isTransientNetworkError(err) {
  if (!err || err.name === 'AbortError') return false;
  const msg = String(err.message || '');
  return (err instanceof TypeError) || /load failed|failed to fetch|network|connection/i.test(msg);
}

async function callLLM(userMessage, onChunk, onDone, onError, _isRetry) {
  const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  const timer = controller ? setTimeout(function () { controller.abort(); }, AI_CONFIG.timeout) : null;
  let gotAny = false;   /* 是否已经收到过内容，决定能不能安全重试 */
  try {
    const response = await fetch(AI_CONFIG.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + AI_CONFIG.anonKey
      },
      body: JSON.stringify({ message: userMessage }),
      signal: controller ? controller.signal : undefined
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error('API ' + response.status + ': ' + errText);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            gotAny = true;
            fullText += delta;
            onChunk(delta);
          }
        } catch (e) {}
      }
    }

    if (onDone) onDone(fullText);
  } catch (err) {
    /* 偶发失败自动重试一次。
       只在「一个字都还没收到」时才重试：如果已经吐了一半，重试会把答案叠成两份。 */
    if (!gotAny && !_isRetry && isTransientNetworkError(err)) {
      console.warn('[ai.js] 首次调用失败，稍后自动重试一次:', err && err.name, err && err.message);
      if (timer) clearTimeout(timer);
      await sleep(900);
      return callLLM(userMessage, onChunk, onDone, onError, true);
    }
    /* 控制台保留原始报错（方便排查），给访客的则是一句人话 */
    console.error('[ai.js] 原始错误:', err && err.name, err && err.message);
    if (onError) onError(friendlyAIError(err));
  } finally {
    if (timer) clearTimeout(timer);
  }
}