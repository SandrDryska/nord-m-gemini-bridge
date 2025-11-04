async function generateTextWithMistral(apiKey, input) {
  const primaryModel = "magistral-medium-2509";
  const fallbackModel = "mistral-small-latest"; // более надёжная доступная модель
  let modelUsed = primaryModel;

  // Готовим сообщения и system-промпт
  let messages;
  let systemPrompt = "";
  if (Array.isArray(input)) {
    // Логируем входящие данные для отладки
    console.log('[Mistral] Входящие сообщения (первые 3):', JSON.stringify(input.slice(0, 3), null, 2));
    
    const systemMsg = input.find(m => m.role === 'system');
    systemPrompt = systemMsg ? (systemMsg.text || "") : "";
    // Фильтруем и валидируем сообщения
    messages = input
      .filter(m => {
        if (m.role === 'system') return false;
        // Проверяем, что text существует и является строкой
        if (!m.text) return false;
        const textStr = typeof m.text === 'string' ? m.text : String(m.text || '');
        return textStr.trim().length > 0;
      })
      .map(msg => {
        // Безопасное преобразование в строку
        const textStr = typeof msg.text === 'string' ? msg.text : String(msg.text || '');
        return {
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: textStr.trim()
        };
      });
    
    // Логируем преобразованные сообщения
    console.log('[Mistral] Преобразованные сообщения для API:', JSON.stringify(messages.slice(-2), null, 2));
    
    // Убеждаемся, что последнее сообщение от пользователя
    if (messages.length > 0 && messages[messages.length - 1].role !== 'user') {
      console.warn('[Mistral] Последнее сообщение не от пользователя, возможно проблема с историей');
    }
  } else {
    // Обратная совместимость: старый формат
    const { prompt, system } = normalizeInput(input);
    systemPrompt = system || "";
    messages = [ { role: 'user', content: prompt } ];
  }
  
  // Валидация: должны быть сообщения
  if (!messages || messages.length === 0) {
    throw new Error('Mistral: нет валидных сообщений для отправки');
  }
  
  console.log(`[Mistral] Отправка запроса: ${messages.length} сообщений, модель: ${primaryModel}`);
  
  const primaryBody = { model: primaryModel, messages, temperature: 1, max_tokens: 1024, ...(systemPrompt ? { system_prompt: systemPrompt } : {}) };
  let response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(primaryBody),
  });
  
  // Обрабатываем ошибки 429 (rate limit) и другие ошибки с fallback
  if (!response.ok && ([400, 404, 422, 429].includes(response.status))) {
    const errText = await safeReadText(response);
    console.warn(`[Mistral] Primary model failed (${primaryModel}), статус ${response.status}. Falling back to ${fallbackModel}. Details: ${errText}`);
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
  
  // Логируем структуру ответа для отладки
  console.log('[Mistral] Структура ответа API:', JSON.stringify(data, null, 2).substring(0, 500));
  
  // Унифицированное извлечение текста из message.content (строка | массив частей)
  function extractTextFromMessage(msg) {
    if (!msg) return '';
    const content = msg.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      try {
        return content
          .filter(part => part && part.type === 'text' && typeof part.text === 'string')
          .map(part => part.text)
          .join('');
      } catch (_) {
        return '';
      }
    }
    return '';
  }
  
  let message = '';
  if (data?.choices?.[0]?.message) {
    message = extractTextFromMessage(data.choices[0].message);
  } else if (data?.message) {
    message = typeof data.message === 'string' ? data.message : extractTextFromMessage(data.message);
  }
  
  if (typeof message !== 'string') {
    console.warn('[Mistral] Ответ не является строкой, принудительное преобразование');
    message = String(message || '');
  }
  
  if (!message || message.trim().length === 0) {
    console.warn('[Mistral] Пустой ответ от API. Полный ответ:', JSON.stringify(data));
    message = '';
  }
  
  console.log(`[Mistral] Text generation model: ${modelUsed}, длина ответа: ${message.length}, первые 100 символов: ${message.substring(0, 100)}`);
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

