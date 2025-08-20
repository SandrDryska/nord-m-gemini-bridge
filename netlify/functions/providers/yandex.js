// Измените модель здесь: например 'qwen', 'yandexgpt', 'yandexgpt-lite'
const DEFAULT_MODEL_NAME = 'yandexgpt-lite';

async function generateTextWithYandex(apiKey, folderId, input, options) {
	const resolved = resolveYandexOptions(folderId, options);
	
	let messages;
	if (Array.isArray(input)) {
		// Новый формат: массив сообщений
		messages = input.map(msg => ({
			role: msg.role,
			text: msg.text
		}));
	} else {
		// Обратная совместимость: старый формат
		const { prompt, system } = normalizeInput(input);
		messages = [];
		if (system && system.trim().length > 0) {
			messages.push({ role: 'system', text: system });
		}
		messages.push({ role: 'user', text: prompt });
	}

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

// --- AUDIO PIPELINE ---
async function transcribeWithYandexSTT(apiKey, folderId, audioBuffer, opts = {}) {
	// По умолчанию считаем, что пишем в OGG/Opus 48kHz
	const lang = opts.lang || 'ru-RU';
	const format = opts.format || 'oggopus';
	const sampleRateHertz = opts.sampleRateHertz || 48000;

	const url = `https://stt.api.cloud.yandex.net/speech/v1/stt:recognize?lang=${encodeURIComponent(lang)}&format=${encodeURIComponent(format)}&sampleRateHertz=${encodeURIComponent(String(sampleRateHertz))}`;

	const response = await fetch(url, {
		method: 'POST',
		headers: {
			Authorization: `Api-Key ${apiKey}`,
			'Content-Type': 'application/octet-stream',
			'x-folder-id': folderId,
		},
		body: audioBuffer,
	});
	if (!response.ok) {
		const errText = await safeReadText(response);
		throw new Error(`Yandex STT error ${response.status}: ${errText}`);
	}
	const data = await response.json().catch(() => null);
	if (!data) {
		// Некоторые ответы могут приходить в text/plain, попробуем text()
		const txt = await response.text();
		try {
			const parsed = JSON.parse(txt);
			return parsed.result || '';
		} catch (_) {
			return '';
		}
	}
	return data.result || '';
}

async function generateTextWithYandexAndAudio(apiKey, folderId, input, audioBase64, sttOpts) {
	const audioBuffer = Buffer.from(audioBase64, 'base64');
	const transcript = await transcribeWithYandexSTT(apiKey, folderId, audioBuffer, sttOpts);
	
	let messagesWithAudio;
	if (Array.isArray(input)) {
		// Новый формат: массив сообщений
		messagesWithAudio = [...input];
		// Заменяем последнее user сообщение на версию с транскрипцией
		if (messagesWithAudio.length > 0 && messagesWithAudio[messagesWithAudio.length - 1].role === 'user') {
			const lastMessage = messagesWithAudio[messagesWithAudio.length - 1];
			messagesWithAudio[messagesWithAudio.length - 1] = {
				...lastMessage,
				text: `${lastMessage.text}\n\nТранскрипция аудио:\n${transcript}`
			};
		}
	} else {
		// Обратная совместимость: старый формат
		const { prompt, system } = normalizeInput(input);
		let mergedPrompt;
		if (prompt && prompt.trim()) {
			mergedPrompt = system
				? `${prompt}\n\nТранскрипция аудио:\n${transcript}`
				: `${prompt}\n\nТранскрипция аудио:\n${transcript}`;
		} else {
			mergedPrompt = `Транскрипция аудио:\n${transcript}`;
		}
		messagesWithAudio = { prompt: mergedPrompt, system };
	}

	const text = await generateTextWithYandex(apiKey, folderId, messagesWithAudio);
	return { message: text, transcript };
}

module.exports.generateTextWithYandexAndAudio = generateTextWithYandexAndAudio;


