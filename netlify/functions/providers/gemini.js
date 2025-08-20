const { GoogleGenerativeAI } = require("@google/generative-ai");

async function generateTextWithGemini(apiKey, input) {
  const genAI = new GoogleGenerativeAI(apiKey);
  
  if (Array.isArray(input)) {
    // Новый формат: массив сообщений
    const systemMessage = input.find(msg => msg.role === 'system');
    const systemInstruction = systemMessage ? systemMessage.text : '';
    
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash", 
      ...(systemInstruction ? { systemInstruction } : {}) 
    });
    
    // Конвертируем сообщения в формат Gemini
    const parts = input
      .filter(msg => msg.role !== 'system')
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
      .join('\n\n');
    
    const result = await model.generateContent([parts]);
    const response = await result.response;
    return response.text();
  } else {
    // Обратная совместимость: старый формат
    const { prompt, system } = normalizeInput(input);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", ...(system ? { systemInstruction: system } : {}) });
    const result = await model.generateContent([prompt]);
    const response = await result.response;
    return response.text();
  }
}

async function generateTextWithGeminiAndAudio(apiKey, input, audioBase64) {
  const genAI = new GoogleGenerativeAI(apiKey);
  
  if (Array.isArray(input)) {
    // Новый формат: массив сообщений
    const systemMessage = input.find(msg => msg.role === 'system');
    const systemInstruction = systemMessage ? systemMessage.text : '';
    
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash", 
      ...(systemInstruction ? { systemInstruction } : {}) 
    });
    
    // Конвертируем историю в текст + добавляем аудио
    const conversationHistory = input
      .filter(msg => msg.role !== 'system')
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
      .join('\n\n');
    
    const parts = [
      conversationHistory,
      {
        inlineData: {
          data: audioBase64,
          mimeType: "audio/webm",
        },
      },
    ];
    
    const result = await model.generateContent(parts);
    const response = await result.response;
    return response.text();
  } else {
    // Обратная совместимость: старый формат
    const { prompt, system } = normalizeInput(input);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", ...(system ? { systemInstruction: system } : {}) });
    const parts = [];
    
    // Добавляем текстовый промпт только если он не пустой
    if (prompt && prompt.trim()) {
      parts.push(prompt);
    }
    
    // Всегда добавляем аудио
    parts.push({
      inlineData: {
        data: audioBase64,
        mimeType: "audio/webm",
      },
    });

    const result = await model.generateContent(parts);
    const response = await result.response;
    return response.text();
  }
}

function normalizeInput(input) {
  if (typeof input === 'string') {
    return { prompt: input, system: '' };
  }
  return { prompt: input?.prompt || '', system: input?.system || '' };
}

module.exports = {
  generateTextWithGemini,
  generateTextWithGeminiAndAudio,
};


