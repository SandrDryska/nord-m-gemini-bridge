async function generateTextWithOpenAI(apiKey, prompt) {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });
  const model = "gpt-5-nano-2025-08-07";
  const completion = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
  });
  const message = completion.choices?.[0]?.message?.content ?? "";
  console.log(`[OpenAI] Text generation model: ${model}`);
  return message;
}

async function generateTextWithOpenAIAndAudio(apiKey, prompt, audioBase64) {
  const { default: OpenAI } = await import("openai");
  const { toFile } = await import("openai/uploads");
  const client = new OpenAI({ apiKey });

  // 1) Транскрипция
  const transcriptionModel = "gpt-4o-mini-transcribe";
  const file = await toFile(Buffer.from(audioBase64, "base64"), "recording.webm", {
    type: "audio/webm",
  });
  const transcription = await client.audio.transcriptions.create({
    file,
    model: transcriptionModel,
  });
  const transcriptText = transcription.text || "";
  console.log(`[OpenAI] Transcription model: ${transcriptionModel}`);
  console.log(`[OpenAI] Transcript: ${transcriptText}`);

  // 2) Генерация ответа по текстовой модели
  const textModel = "gpt-5-nano-2025-08-07";
  const completion = await client.chat.completions.create({
    model: textModel,
    messages: [
      {
        role: "user",
        content: `${prompt}\n\nТранскрипция аудио:\n${transcriptText}`,
      },
    ],
    temperature: 0.7,
  });
  const message = completion.choices?.[0]?.message?.content ?? "";
  console.log(`[OpenAI] Text generation model: ${textModel}`);
  return message;
}

module.exports = {
  generateTextWithOpenAI,
  generateTextWithOpenAIAndAudio,
};


