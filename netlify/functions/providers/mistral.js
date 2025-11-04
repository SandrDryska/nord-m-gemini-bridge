async function generateTextWithMistral(apiKey, input) {
  const primaryModel = "mistral-large-latest";
  const fallbackModel = "mistral-medium-latest";
  let modelUsed = primaryModel;

  let messages;
  if (Array.isArray(input)) {
    // Новый формат: массив сообщений
    messages = input.map(msg => ({
      role: msg.role === 'system' ? 'system' : msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.text
    }));
  } else {
    // Обратная совместимость: старый формат
    const { prompt, system } = normalizeInput(input);
    messages = system ? [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ] : [ { role: 'user', content: prompt } ];
  }
  
  const primaryBody = { model: primaryModel, messages, temperature: 1 };
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
    const fallbackBody = { model: fallbackModel, messages, temperature: 1 };
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

