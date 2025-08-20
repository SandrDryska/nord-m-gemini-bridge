async function generateTextWithOpenAI(apiKey, input) {
  const primaryModel = "gpt-5-nano-2025-08-07";
  const fallbackModel = "gpt-4o-mini";
  let modelUsed = primaryModel;

  let messages;
  if (Array.isArray(input)) {
    // Новый формат: массив сообщений
    messages = input.map(msg => ({
      role: msg.role,
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
  let response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(primaryBody),
  });
  if (!response.ok && [400, 404, 422].includes(response.status)) {
    const errText = await safeReadText(response);
    console.warn(`[OpenAI] Primary model failed (${primaryModel}). Falling back to ${fallbackModel}. Details: ${errText}`);
    modelUsed = fallbackModel;
    const fallbackBody = { model: fallbackModel, messages, temperature: 1 };
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(fallbackBody),
    });
  }
  if (!response.ok) {
    const errText = await safeReadText(response);
    throw new Error(`OpenAI chat error ${response.status}: ${errText}`);
  }
  const data = await response.json();
  const message = data.choices?.[0]?.message?.content ?? "";
  console.log(`[OpenAI] Text generation model: ${modelUsed}`);
  return message;
}

async function generateTextWithOpenAIAndAudio(apiKey, input, audioBase64) {
  // 1) Транскрипция
  const primaryTranscribe = "gpt-4o-mini-transcribe";
  const fallbackTranscribe = "whisper-1";
  const audioBuffer = Buffer.from(audioBase64, "base64");
  const audioBlob = new Blob([audioBuffer], { type: "audio/webm" });
  const formData = new FormData();
  formData.append("file", audioBlob, "recording.webm");
  formData.append("model", primaryTranscribe);

  const trResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });
  let trData;
  let transcribeUsed = primaryTranscribe;
  if (!trResponse.ok && [400, 404, 422].includes(trResponse.status)) {
    const errText = await safeReadText(trResponse);
    console.warn(`[OpenAI] Primary transcription model failed (${primaryTranscribe}). Falling back to ${fallbackTranscribe}. Details: ${errText}`);
    const formData2 = new FormData();
    formData2.append("file", audioBlob, "recording.webm");
    formData2.append("model", fallbackTranscribe);
    const trResponse2 = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData2,
    });
    if (!trResponse2.ok) {
      const errText2 = await safeReadText(trResponse2);
      throw new Error(`OpenAI transcription error ${trResponse2.status}: ${errText2}`);
    }
    trData = await trResponse2.json();
    transcribeUsed = fallbackTranscribe;
  } else if (!trResponse.ok) {
    const errText = await safeReadText(trResponse);
    throw new Error(`OpenAI transcription error ${trResponse.status}: ${errText}`);
  } else {
    trData = await trResponse.json();
  }
  const transcriptText = trData.text || "";
  console.log(`[OpenAI] Transcription model: ${transcribeUsed}`);
  console.log(`[OpenAI] Transcript: ${transcriptText}`);

  // 2) Генерация ответа по текстовой модели
  const primaryModel = "gpt-5-nano-2025-08-07";
  const fallbackModel = "gpt-4o-mini";
  let textModelUsed = primaryModel;
  
  let messages;
  if (Array.isArray(input)) {
    // Новый формат: массив сообщений с добавлением транскрипции к последнему user сообщению
    messages = input.map(msg => ({
      role: msg.role,
      content: msg.text
    }));
    // Добавляем транскрипцию к последнему user сообщению
    if (messages.length > 0 && messages[messages.length - 1].role === 'user') {
      messages[messages.length - 1].content += `\n\nТранскрипция аудио:\n${transcriptText}`;
    }
  } else {
    // Обратная совместимость: старый формат
    const { prompt, system } = normalizeInput(input);
    messages = [];
    
    if (system) {
      messages.push({ role: 'system', content: system });
    }
    
    // Формируем контент пользователя
    let userContent = '';
    if (prompt && prompt.trim()) {
      userContent = `${prompt}\n\nТранскрипция аудио:\n${transcriptText}`;
    } else {
      userContent = `Транскрипция аудио:\n${transcriptText}`;
    }
    
    messages.push({ role: 'user', content: userContent });
  }
  
  const chatResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: primaryModel,
      messages,
      temperature: 1,
    }),
  });
  let chatData;
  if (!chatResponse.ok && [400, 404, 422].includes(chatResponse.status)) {
    const errText = await safeReadText(chatResponse);
    console.warn(`[OpenAI] Primary text model failed (${primaryModel}). Falling back to ${fallbackModel}. Details: ${errText}`);
    textModelUsed = fallbackModel;
    const chatResponse2 = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: fallbackModel,
        messages,
        temperature: 1,
      }),
    });
    if (!chatResponse2.ok) {
      const errText2 = await safeReadText(chatResponse2);
      throw new Error(`OpenAI chat error ${chatResponse2.status}: ${errText2}`);
    }
    chatData = await chatResponse2.json();
  } else if (!chatResponse.ok) {
    const errText = await safeReadText(chatResponse);
    throw new Error(`OpenAI chat error ${chatResponse.status}: ${errText}`);
  } else {
    chatData = await chatResponse.json();
  }
  const message = chatData.choices?.[0]?.message?.content ?? "";
  console.log(`[OpenAI] Text generation model: ${textModelUsed}`);
  return {
    message,
    transcript: transcriptText,
    transcribeModel: transcribeUsed,
    textModel: textModelUsed,
  };
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
  generateTextWithOpenAI,
  generateTextWithOpenAIAndAudio,
};


