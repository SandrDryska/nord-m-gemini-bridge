const { GoogleGenerativeAI } = require("@google/generative-ai");

async function generateTextWithGemini(apiKey, input) {
  const { prompt, system } = normalizeInput(input);
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", ...(system ? { systemInstruction: system } : {}) });
  const result = await model.generateContent([prompt]);
  const response = await result.response;
  return response.text();
}

async function generateTextWithGeminiAndAudio(apiKey, input, audioBase64) {
  const { prompt, system } = normalizeInput(input);
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash", ...(system ? { systemInstruction: system } : {}) });
  const parts = [
    prompt,
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


