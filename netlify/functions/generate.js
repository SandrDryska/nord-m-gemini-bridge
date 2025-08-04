// netlify/functions/generate.js

const { GoogleGenerativeAI } = require("@google/generative-ai");
const busboy = require('busboy');

const ALLOWED_ORIGIN = "*"; // В продакшене установите конкретный домен.

// Хелпер для парсинга multipart/form-data в среде serverless
function parseMultipartForm(event) {
    // ... (код этой функции не меняется)
    return new Promise((resolve, reject) => {
        const bb = busboy({
            headers: { 'content-type': event.headers['content-type'] || event.headers['Content-Type'] }
        });

        const result = {
            files: [],
            fields: {}
        };

        bb.on('file', (fieldname, file, G, G, G) => {
            const chunks = [];
            file.on('data', (chunk) => chunks.push(chunk));
            file.on('end', () => {
                result.files.push({
                    fieldname,
                    content: Buffer.concat(chunks),
                    mimeType: file.mimeType
                });
            });
        });

        bb.on('field', (fieldname, val) => {
            result.fields[fieldname] = val;
        });
        
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
    
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'API ключ не сконфигурирован.' }) };
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        let prompt;
        let requestParts = [];

        const contentType = event.headers['content-type'] || event.headers['Content-Type'];

        // --- ИСПРАВЛЕНИЕ ЗДЕСЬ ---
        // Добавлена проверка, что contentType не является null или undefined
        if (contentType && contentType.startsWith('multipart/form-data')) {
            // Аудио + Текст
            const parsed = await parseMultipartForm(event);
            prompt = parsed.fields.prompt;
            const audioFile = parsed.files.find(f => f.fieldname === 'audio');

            if (!audioFile) {
                throw new Error("Аудиофайл не найден в запросе.");
            }

            requestParts.push(prompt);
            requestParts.push({
                inlineData: {
                    data: audioFile.content.toString('base64'),
                    mimeType: audioFile.mimeType,
                },
            });

        } else if (contentType && contentType.startsWith('application/json')) {
            // Только Текст
            const body = JSON.parse(event.body);
            prompt = body.prompt;
            if (!prompt) throw new Error("Промпт не предоставлен.");
            requestParts.push(prompt);

        } else {
            // Если Content-Type отсутствует или имеет неожиданное значение
            throw new Error(`Неподдерживаемый или отсутствующий Content-Type: ${contentType}`);
        }

        const result = await model.generateContent(requestParts);
        const response = await result.response;
        const text = response.text();

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ generatedText: text }),
        };

    } catch (error) {
        console.error('Ошибка в функции:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message || 'Внутренняя ошибка сервера.' }),
        };
    }
};