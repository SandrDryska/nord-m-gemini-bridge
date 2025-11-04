async function generateTextWithMistral(apiKey, input) {
  const primaryModel = "mistral-large-latest";
  const fallbackModel = "mistral-small-latest"; // более надёжная доступная модель
  let modelUsed = primaryModel;

  // Готовим сообщения и system-промпт
  let messages;
  let systemPrompt = "";
  if (Array.isArray(input)) {
    const systemMsg = input.find(m => m.role === 'system');
    systemPrompt = systemMsg ? (systemMsg.text || "") : "";
    messages = input
      .filter(m => m.role !== 'system')
      .map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.text
      }));
  } else {
    // Обратная совместимость: старый формат
    const { prompt, system } = normalizeInput(input);
    systemPrompt = system || "";
    messages = [ { role: 'user', content: prompt } ];
  }
  
  const primaryBody = { model: primaryModel, messages, temperature: 1, max_tokens: 1024, ...(systemPrompt ? { system_prompt: systemPrompt } : {}) };
  let response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(primaryBody),
  });
  if (!response.ok && [400, 404, 422].includes(response.status)) {
    const errText = await safeReadText(response);
    console.warn(`[Mistral] Primary model failed (${primaryModel}). Falling back to ${fallbackModel}. Details: ${errText}`);
    modelUsed = fallbackModel;
    const fallbackBody = { model: fallbackModel, messages, temperature: 1, max_tokens: 1024, ...(systemPrompt ? { system_prompt: systemPrompt } : {}) };
    response = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(fallbackBody),
    });
  }
  if (!response.ok) {
    const errText = await safeReadText(response);
    throw new Error(`Mistral chat error ${response.status}: ${errText}`);
  }
  const data = await response.json();
  const message = data.choices?.[0]?.message?.content ?? "";
  console.log(`[Mistral] Text generation model: ${modelUsed}`);
  return message;
}

async function safeReadText(res) {
  try {
    return await res.text();
  } catch (_) {
    return "(no body)";
  }
}

function normalizeInput(input) {
  if (typeof input === 'string') {
    return { prompt: input, system: '' };
  }
  return { prompt: input?.prompt || '', system: input?.system || '' };
}

module.exports = {
  generateTextWithMistral,
};

