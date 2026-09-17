// assets/js/ai.js
const AI_CONFIG = {
  endpoint: 'https://qnctdjwoylhfbqigqkje.supabase.co/functions/v1/llm-proxy',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFuY3RkandveWxoZmJxaWdxa2plIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2MzAxODYsImV4cCI6MjEwNTIwNjE4Nn0.j6KMMpwOHU_hwAtL3WNYO7EbVsSwJ5ZhvWa1MhyG1l8'
};

async function callLLM(userMessage, onChunk, onDone, onError) {
  try {
    const response = await fetch(AI_CONFIG.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + AI_CONFIG.anonKey
      },
      body: JSON.stringify({ message: userMessage })
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
        } catch (e) {}
      }
    }

    if (onDone) onDone(fullText);
  } catch (err) {
    console.error('[ai.js]', err);
    if (onError) onError(err.message || 'AI 暂时无法响应');
  }
}