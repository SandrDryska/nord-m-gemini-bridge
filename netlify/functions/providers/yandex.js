// Измените модель здесь: например 'qwen', 'yandexgpt', 'yandexgpt-lite'
const DEFAULT_MODEL_NAME = 'yandexgpt-lite';

async function generateTextWithYandex(apiKey, folderId, input, options) {
	const { prompt, system } = normalizeInput(input);
	const resolved = resolveYandexOptions(folderId, options);

	const messages = [];
	if (system && system.trim().length > 0) {
		messages.push({ role: 'system', text: system });
	}
	messages.push({ role: 'user', text: prompt });

	const body = {
		modelUri: resolved.modelUri,
		completionOptions: {
			stream: false,
			temperature: resolved.temperature,
			maxTokens: resolved.maxTokens,
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

function resolveYandexOptions(folderId, options) {
	const defaults = {
		modelUri: `gpt://${folderId}/${DEFAULT_MODEL_NAME}/latest`,
		temperature: 0.6,
		maxTokens: 2000,
	};

	const modelUri = options?.modelUri
		? String(options.modelUri)
		: (options?.modelName
			? `gpt://${folderId}/${String(options.modelName)}/latest`
			: defaults.modelUri);

	const temperature = isFiniteNumber(options?.temperature)
		? Number(options.temperature)
		: defaults.temperature;

	const maxTokens = isFiniteInteger(options?.maxTokens)
		? Number(options.maxTokens)
		: defaults.maxTokens;
	return { modelUri, temperature, maxTokens };
}

function isFiniteNumber(v) {
	return typeof v === 'number' && Number.isFinite(v);
}

function isFiniteInteger(v) {
	return (typeof v === 'number' || typeof v === 'string') && Number.isInteger(Number(v));
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


