async function generateTextWithOpenAI(apiKey, prompt) {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
  });
  const message = completion.choices?.[0]?.message?.content ?? "";
  return message;
}

module.exports = {
  generateTextWithOpenAI,
};


