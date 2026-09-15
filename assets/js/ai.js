// assets/js/ai.js
const AI_CONFIG = {
  endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  apiKey: '6c1ccc1919ca49b8bc3f2425f9b0a81a.Ic8HGvPrsGIMsUGS',   // 只写在这里，不要外传
  model: 'glm-4-flash',
  systemPrompt: '你是张聿辰个人主页的AI孪生。用简洁、友好、口语化的中文回答访客的问题。回答控制在2-3句话以内。'
};

async function callLLM(userMessage, onChunk, onDone, onError) {
  try {
    const response = await fetch(AI_CONFIG.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + AI_CONFIG.apiKey
      },
      body: JSON.stringify({
        model: AI_CONFIG.model,
        messages: [
          { role: 'system', content: AI_CONFIG.systemPrompt },
          { role: 'user', content: userMessage }
        ],
        stream: true,
        temperature: 0.7
      })
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
            fullText += delta;
            onChunk(delta);
          }
        } catch (e) { /* 忽略单个 chunk 错误 */ }
      }
    }

    if (onDone) onDone(fullText);
  } catch (err) {
    console.error('[ai.js]', err);
    if (onError) onError(err.message || 'AI 暂时无法响应');
  }
}