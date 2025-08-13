async function generateTextWithYandex(apiKey, folderId, input) {
	const { prompt, system } = normalizeInput(input);
	const modelUri = `gpt://${folderId}/yandexgpt/latest`;

	const messages = [];
	if (system && system.trim().length > 0) {
		messages.push({ role: 'system', text: system });
	}
	messages.push({ role: 'user', text: prompt });

	const body = {
		modelUri,
		completionOptions: {
			stream: false,
			temperature: 0.6,
			maxTokens: 2000,
		},
		messages,
	};

	const response = await fetch('https://llm.api.cloud.yandex.net/foundationModels/v1/completion', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Api-Key ${apiKey}`,
		},
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		const errText = await safeReadText(response);
		throw new Error(`YandexGPT error ${response.status}: ${errText}`);
	}
	const data = await response.json();
	const text = data?.result?.alternatives?.[0]?.message?.text ?? '';
	return text;
}

async function safeReadText(res) {
	try { return await res.text(); } catch (_) { return '(no body)'; }
}

function normalizeInput(input) {
	if (typeof input === 'string') {
		return { prompt: input, system: '' };
	}
	return { prompt: input?.prompt || '', system: input?.system || '' };
}

module.exports = { generateTextWithYandex };


