// netlify/functions/generate.js

const busboy = require('busboy');
const { getStore } = require('@netlify/blobs');
const { generateTextWithGemini, generateTextWithGeminiAndAudio } = require('./providers/gemini');
const { generateTextWithOpenAI, generateTextWithOpenAIAndAudio } = require('./providers/openai');
const { generateTextWithYandex, generateTextWithYandexAndAudio } = require('./providers/yandex');
const { generateTextWithMistral } = require('./providers/mistral');

const ALLOWED_ORIGIN = "*";

// Поддержка ручной конфигурации Netlify Blobs через переменные окружения
// Приоритет: пользовательские N_SITE_ID/N_BLOB_TOKEN, затем стандартные NETLIFY_SITE_ID/NETLIFY_BLOBS_TOKEN
const NETLIFY_SITE_ID = process.env.N_SITE_ID || process.env.NETLIFY_SITE_ID;
const NETLIFY_BLOBS_TOKEN = process.env.N_BLOB_TOKEN || process.env.NETLIFY_BLOBS_TOKEN;

// Диагностика наличия переменных окружения (без утечек значений)
try {
    console.log('[Blobs] Manual env detected:', {
        hasSiteId: Boolean(NETLIFY_SITE_ID),
        hasToken: Boolean(NETLIFY_BLOBS_TOKEN)
    });
} catch (_) {}

function getBlobsStore() {
    try {
        if (NETLIFY_SITE_ID && NETLIFY_BLOBS_TOKEN) {
            console.log('[Blobs] Using manual config with siteID length:', NETLIFY_SITE_ID.length, 'token length:', NETLIFY_BLOBS_TOKEN.length);
            const config = { name: 'ai-sessions', siteID: NETLIFY_SITE_ID, token: NETLIFY_BLOBS_TOKEN };
            return getStore(config);
        }
        // Авто-конфигурация в среде Netlify (prod/preview/dev через netlify dev)
        console.log('[Blobs] Using auto config');
        return getStore({ name: 'ai-sessions' });
    } catch (e) {
        console.error('[Blobs] Store creation failed:', e.message);
        // Пробрасываем дальше, чтобы верхний уровень корректно залогировал
        throw e;
    }
}

// Константы для сессий
const SESSION_TTL_MINUTES = 60;
const MAX_MESSAGES_IN_SESSION = 20; // Ограничение для скользящего окна

// Функции для работы с сессиями
async function getSession(sessionId) {
    if (!sessionId) return null;
    try {
        const store = getBlobsStore();
        const sessionData = await store.get(sessionId, { type: 'json' });
        return sessionData;
    } catch (error) {
        console.warn('[Session] Ошибка загрузки сессии:', error.message);
        return null;
    }
}

async function saveSession(sessionId, sessionData) {
    if (!sessionId) return;
    try {
        const store = getBlobsStore();
        await store.set(sessionId, JSON.stringify(sessionData), {
            metadata: { 
                ttl: SESSION_TTL_MINUTES * 60 // TTL в секундах
            }
        });
    } catch (error) {
        console.error('[Session] Ошибка сохранения сессии:', error.message);
    }
}

async function deleteSession(sessionId) {
    if (!sessionId) return;
    try {
        const store = getBlobsStore();
        await store.delete(sessionId);
    } catch (error) {
        console.warn('[Session] Ошибка удаления сессии:', error.message);
    }
}

function createNewSession(systemPrompt = '') {
    return {
        systemPrompt,
        messages: [],
        createdAt: Date.now(),
        lastActivity: Date.now()
    };
}

function trimSessionHistory(messages, maxMessages = MAX_MESSAGES_IN_SESSION) {
    if (messages.length <= maxMessages) return messages;
    // Оставляем последние maxMessages сообщений
    return messages.slice(-maxMessages);
}

function formatMessagesForProvider(systemPrompt, messages, newUserMessage) {
    const allMessages = [];
    
    // Добавляем system prompt если есть
    if (systemPrompt && systemPrompt.trim()) {
        allMessages.push({ role: 'system', text: systemPrompt });
    }
    
    // Добавляем историю сообщений
    allMessages.push(...messages);
    
    // Добавляем новое сообщение пользователя
    if (newUserMessage && newUserMessage.trim()) {
        allMessages.push({ role: 'user', text: newUserMessage });
    }
    
    return allMessages;
}

function parseMultipartForm(event) {
    return new Promise((resolve, reject) => {
        const bb = busboy({
            headers: { 'content-type': event.headers['content-type'] || event.headers['Content-Type'] }
        });

        const result = {
            files: [],
            fields: {}
        };

        // Мы больше не пытаемся извлечь mimeType здесь, так как он ненадежен
        bb.on('file', (fieldname, file) => {
            const chunks = [];
            file.on('data', (chunk) => chunks.push(chunk));
            file.on('end', () => {
                result.files.push({
                    fieldname,
                    content: Buffer.concat(chunks)
                });
            });
        });

        bb.on('field', (fieldname, val) => { result.fields[fieldname] = val; });
        bb.on('close', () => resolve(result));
        bb.on('error', err => reject(err));

        const bodyBuffer = Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8');
        bb.end(bodyBuffer);
    });
}

exports.handler = async (event) => {
    // CORS Preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204,
            headers: {
                'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
            },
            body: '',
        };
    }

    const headers = {
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        'Content-Type': 'application/json',
    };

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }
    
    const provider = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
    const geminiApiKey = process.env.GEMINI_API_KEY;
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const yandexApiKey = process.env.YANDEX_API_KEY;
    const yandexFolderId = process.env.YANDEX_FOLDER_ID;
    const mistralApiKey = process.env.MISTRAL_API_KEY;

    try {
        let requestParts = [];
        const contentType = event.headers['content-type'] || event.headers['Content-Type'];

        if (contentType && contentType.startsWith('multipart/form-data')) {
            const parsed = await parseMultipartForm(event);
            const prompt = parsed.fields.prompt;
            const system = parsed.fields.system;
            const sessionId = parsed.fields.sessionId;
            const endSession = parsed.fields.endSession === 'true';
            const resetContext = parsed.fields.resetContext === 'true';
            const audioFormat = parsed.fields.audioFormat; // 'oggopus' | 'webm' (optional)
            const audioFile = parsed.files.find(f => f.fieldname === 'audio');
            
            if (!audioFile) {
                throw new Error("Аудиофайл не предоставлен.");
            }

            // Обработка команд управления сессией
            if (endSession && sessionId) {
                await deleteSession(sessionId);
                return { statusCode: 200, headers, body: JSON.stringify({ 
                    message: 'Сессия завершена', 
                    sessionId,
                    provider 
                }) };
            }

            // Загружаем или создаём сессию
            let session = null;
            if (sessionId) {
                session = await getSession(sessionId);
                if (resetContext && session) {
                    session.messages = [];
                    session.lastActivity = Date.now();
                }
            }
            if (!session) {
                session = createNewSession(system || '');
            }

            const audioBase64 = audioFile.content.toString('base64');
            let text;
            let transcript;
            
            // Формируем контекст для модели с учётом истории
            const messagesForProvider = formatMessagesForProvider(session.systemPrompt, session.messages, prompt);
            
            if (provider === 'openai') {
                if (!openaiApiKey) {
                    return { statusCode: 500, headers, body: JSON.stringify({ error: 'OPENAI_API_KEY не задан.' }) };
                }
                console.log('[Provider] openai (audio pipeline with session)');
                const res = await generateTextWithOpenAIAndAudio(openaiApiKey, messagesForProvider, audioBase64);
                text = typeof res === 'string' ? res : res.message;
                transcript = typeof res === 'object' ? res.transcript : undefined;
            } else if (provider === 'gemini') {
                if (!geminiApiKey) {
                    return { statusCode: 500, headers, body: JSON.stringify({ error: 'GEMINI_API_KEY не задан.' }) };
                }
                console.log('[Provider] gemini (audio pipeline with session)');
                text = await generateTextWithGeminiAndAudio(geminiApiKey, messagesForProvider, audioBase64);
            } else if (provider === 'yandex') {
                if (!yandexApiKey || !yandexFolderId) {
                    return { statusCode: 500, headers, body: JSON.stringify({ error: 'YANDEX_API_KEY/YANDEX_FOLDER_ID не заданы.' }) };
                }
                console.log('[Provider] yandex (audio pipeline with session)');
                const res = await generateTextWithYandexAndAudio(
                    yandexApiKey,
                    yandexFolderId,
                    messagesForProvider,
                    audioBase64,
                    { format: audioFormat || 'oggopus', lang: 'ru-RU', sampleRateHertz: 48000 }
                );
                text = typeof res === 'string' ? res : res.message;
                transcript = typeof res === 'object' ? res.transcript : undefined;
            } else if (provider === 'mistral') {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'Mistral провайдер не поддерживает голосовой ввод. Используйте текстовый запрос.' }) };
            }

            // Сохраняем сессию с новыми сообщениями
            if (sessionId) {
                session.messages.push({ role: 'user', text: transcript || prompt, timestamp: Date.now() });
                session.messages.push({ role: 'assistant', text: text, timestamp: Date.now() });
                session.messages = trimSessionHistory(session.messages);
                session.lastActivity = Date.now();
                await saveSession(sessionId, session);
            }

            return { statusCode: 200, headers, body: JSON.stringify({ 
                generatedText: text, 
                provider, 
                transcript,
                sessionId,
                turns: session ? Math.floor(session.messages.length / 2) : 0
            }) };

        } else if (contentType && contentType.startsWith('application/json')) {
            const body = JSON.parse(event.body);
            const prompt = body.prompt;
            var system = body.system;
            var sessionId = body.sessionId;
            var endSession = body.endSession === true;
            var resetContext = body.resetContext === true;
            var modelName = body.modelName; // для Яндекс (например, yandexgpt, qwen, jne)
            var modelUri = body.modelUri;   // полный URI, если хотим указать явный
            var temperature = body.temperature;
            var maxTokens = body.maxTokens;
            if (!prompt) throw new Error("Промпт не предоставлен.");
            requestParts.push(prompt);

        } else {
            throw new Error(`Неподдерживаемый или отсутствующий Content-Type: ${contentType}`);
        }

        // Обработка команд управления сессией для текстового пайплайна
        if (endSession && sessionId) {
            await deleteSession(sessionId);
            return { statusCode: 200, headers, body: JSON.stringify({ 
                message: 'Сессия завершена', 
                sessionId,
                provider 
            }) };
        }

        // Загружаем или создаём сессию
        let session = null;
        if (sessionId) {
            session = await getSession(sessionId);
            if (resetContext && session) {
                session.messages = [];
                session.lastActivity = Date.now();
            }
        }
        if (!session) {
            session = createNewSession(system || '');
        }

        // Формируем контекст для модели с учётом истории
        const messagesForProvider = formatMessagesForProvider(session.systemPrompt, session.messages, requestParts[0]);

        // Текстовый путь
        let text;
        if (provider === 'openai') {
            if (!openaiApiKey) {
                return { statusCode: 500, headers, body: JSON.stringify({ error: 'OPENAI_API_KEY не задан.' }) };
            }
            console.log('[Provider] openai (text pipeline with session)');
            text = await generateTextWithOpenAI(openaiApiKey, messagesForProvider);
        } else if (provider === 'gemini') {
            if (!geminiApiKey) {
                return { statusCode: 500, headers, body: JSON.stringify({ error: 'GEMINI_API_KEY не задан.' }) };
            }
            console.log('[Provider] gemini (text pipeline with session)');
            text = await generateTextWithGemini(geminiApiKey, messagesForProvider);
        } else if (provider === 'yandex') {
            if (!yandexApiKey || !yandexFolderId) {
                return { statusCode: 500, headers, body: JSON.stringify({ error: 'YANDEX_API_KEY/YANDEX_FOLDER_ID не заданы.' }) };
            }
            console.log('[Provider] yandex (text pipeline with session)');
            text = await generateTextWithYandex(
                yandexApiKey,
                yandexFolderId,
                messagesForProvider,
                { modelName, modelUri, temperature, maxTokens }
            );
        } else if (provider === 'mistral') {
            if (!mistralApiKey) {
                return { statusCode: 500, headers, body: JSON.stringify({ error: 'MISTRAL_API_KEY не задан.' }) };
            }
            console.log('[Provider] mistral (text pipeline with session)');
            text = await generateTextWithMistral(mistralApiKey, messagesForProvider);
        }

        // Сохраняем сессию с новыми сообщениями
        if (sessionId) {
            session.messages.push({ role: 'user', text: requestParts[0], timestamp: Date.now() });
            session.messages.push({ role: 'assistant', text: text, timestamp: Date.now() });
            session.messages = trimSessionHistory(session.messages);
            session.lastActivity = Date.now();
            await saveSession(sessionId, session);
        }

        return { statusCode: 200, headers, body: JSON.stringify({ 
            generatedText: text, 
            provider,
            sessionId,
            turns: session ? Math.floor(session.messages.length / 2) : 0
        }) };

    } catch (error) {
        console.error('Ошибка в функции:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message || 'Внутренняя ошибка сервера.' }),
        };
    }
};
