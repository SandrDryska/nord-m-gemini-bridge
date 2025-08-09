// netlify/functions/generate.js

const busboy = require('busboy');
const { generateTextWithGemini, generateTextWithGeminiAndAudio } = require('./providers/gemini');
const { generateTextWithOpenAI, generateTextWithOpenAIAndAudio } = require('./providers/openai');

const ALLOWED_ORIGIN = "*";

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

    try {
        let requestParts = [];
        const contentType = event.headers['content-type'] || event.headers['Content-Type'];

        if (contentType && contentType.startsWith('multipart/form-data')) {
            const parsed = await parseMultipartForm(event);
            const prompt = parsed.fields.prompt;
            const audioFile = parsed.files.find(f => f.fieldname === 'audio');
            
            if (!audioFile || !prompt) {
                throw new Error("Неполные данные в multipart-запросе.");
            }

            const audioBase64 = audioFile.content.toString('base64');
            let text;
            let transcript;
            if (provider === 'openai') {
                if (!openaiApiKey) {
                    return { statusCode: 500, headers, body: JSON.stringify({ error: 'OPENAI_API_KEY не задан.' }) };
                }
                console.log('[Provider] openai (audio pipeline)');
                const res = await generateTextWithOpenAIAndAudio(openaiApiKey, prompt, audioBase64);
                text = typeof res === 'string' ? res : res.message;
                transcript = typeof res === 'object' ? res.transcript : undefined;
            } else {
                if (!geminiApiKey) {
                    return { statusCode: 500, headers, body: JSON.stringify({ error: 'GEMINI_API_KEY не задан.' }) };
                }
                console.log('[Provider] gemini (audio pipeline)');
                text = await generateTextWithGeminiAndAudio(geminiApiKey, prompt, audioBase64);
            }
            return { statusCode: 200, headers, body: JSON.stringify({ generatedText: text, provider, transcript }) };

        } else if (contentType && contentType.startsWith('application/json')) {
            const body = JSON.parse(event.body);
            const prompt = body.prompt;
            if (!prompt) throw new Error("Промпт не предоставлен.");
            requestParts.push(prompt);

        } else {
            throw new Error(`Неподдерживаемый или отсутствующий Content-Type: ${contentType}`);
        }

        // Текстовый путь
        let text;
        if (provider === 'openai') {
            if (!openaiApiKey) {
                return { statusCode: 500, headers, body: JSON.stringify({ error: 'OPENAI_API_KEY не задан.' }) };
            }
            console.log('[Provider] openai (text pipeline)');
            text = await generateTextWithOpenAI(openaiApiKey, requestParts[0]);
        } else {
            if (!geminiApiKey) {
                return { statusCode: 500, headers, body: JSON.stringify({ error: 'GEMINI_API_KEY не задан.' }) };
            }
            console.log('[Provider] gemini (text pipeline)');
            text = await generateTextWithGemini(geminiApiKey, requestParts[0]);
        }

        return { statusCode: 200, headers, body: JSON.stringify({ generatedText: text, provider }) };

    } catch (error) {
        console.error('Ошибка в функции:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message || 'Внутренняя ошибка сервера.' }),
        };
    }
};
