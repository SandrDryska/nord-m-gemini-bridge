// netlify/functions/generate.js

const { GoogleGenerativeAI } = require("@google/generative-ai");
const busboy = require('busboy');

const ALLOWED_ORIGIN = "*"; // Для разработки. В продакшене установите конкретный домен.

// Хелпер для парсинга multipart/form-data в среде serverless
function parseMultipartForm(event) {
    return new Promise((resolve, reject) => {
        const bb = busboy({
            headers: { 'content-type': event.headers['content-type'] || event.headers['Content-Type'] }
        });

        const result = {
            files: [],
            fields: {}
        };

        bb.on('file', (fieldname, file) => {
            const chunks = [];
            let fileMimeType = '';
            
            file.on('data', (chunk) => {
                if (!fileMimeType && file.mimeType) {
                    fileMimeType = file.mimeType;
                }
                chunks.push(chunk);
            });
            
            file.on('end', () => {
                result.files.push({
                    fieldname,
                    content: Buffer.concat(chunks),
                    mimeType: fileMimeType
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

        let requestParts = [];
        const contentType = event.headers['content-type'] || event.headers['Content-Type'];

        if (contentType && contentType.startsWith('multipart/form-data')) {
            console.log('[Backend Debug] Multipart-запрос получен. Начинаю парсинг...');
            const parsed = await parseMultipartForm(event);
            const prompt = parsed.fields.prompt;
            const audioFile = parsed.files.find(f => f.fieldname === 'audio');

            // --- ОТЛАДОЧНЫЕ ЛОГИ ---
            if (audioFile) {
                console.log(`[Backend Debug] ✅ Найден аудиофайл. Размер: ${audioFile.content.length} байт, MIME-тип: ${audioFile.mimeType}`);
            } else {
                console.error('[Backend Debug] ❌ ОШИБКА: Аудиофайл НЕ НАЙДЕН в запросе!');
            }
            if (prompt) {
                console.log('[Backend Debug] ✅ Найден промпт.');
            } else {
                console.error('[Backend Debug] ❌ ОШИБКА: Промпт НЕ НАЙДЕН в запросе!');
            }
            // --- КОНЕЦ ОТЛАДОЧНЫХ ЛОГОВ ---
            
            if (!audioFile || !prompt) {
                throw new Error("Неполные данные в multipart-запросе.");
            }

            requestParts.push(prompt);
            requestParts.push({
                inlineData: {
                    data: audioFile.content.toString('base64'),
                    mimeType: audioFile.mimeType || 'audio/webm',
                },
            });

        } else if (contentType && contentType.startsWith('application/json')) {
            console.log('[Backend Debug] Получен JSON-запрос.');
            const body = JSON.parse(event.body);
            const prompt = body.prompt;
            if (!prompt) throw new Error("Промпт не предоставлен.");
            requestParts.push(prompt);

        } else {
            throw new Error(`Неподдерживаемый или отсутствующий Content-Type: ${contentType}`);
        }
        
        console.log(`[Backend Debug] Отправляю в Gemini API запрос из ${requestParts.length} частей.`);
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
