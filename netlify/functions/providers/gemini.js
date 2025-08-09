const { GoogleGenerativeAI } = require("@google/generative-ai");

async function generateTextWithGemini(apiKey, prompt) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const result = await model.generateContent([prompt]);
  const response = await result.response;
  return response.text();
}

async function generateTextWithGeminiAndAudio(apiKey, prompt, audioBase64) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
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

module.exports = {
  generateTextWithGemini,
  generateTextWithGeminiAndAudio,
};


