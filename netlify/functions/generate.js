// netlify/functions/generate.js
const fetch = require('node-fetch'); // для Node.js < 18
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Определите разрешенные origins. Для тестирования можно '*', но будьте осторожны.
// Для Storyline, запускаемого локально, origin может быть 'null'.
// Для LMS - это будет домен вашей LMS.
// Вы можете получить его из event.headers.origin в самой функции при запросе.
const ALLOWED_ORIGINS = [
    "null", // Для локального тестирования Storyline (file://)
    "https://your-lms-domain.com", // Замените на домен вашей LMS
    "https://app.netlify.com", // Для тестов из интерфейса Netlify
    // Добавьте сюда домен, с которого вы сейчас тестируете (например, если он статичен)
    // Или используйте '*' для тестирования, НО ЭТО НЕБЕЗОПАСНО ДЛЯ ПРОДАКШЕНА С API КЛЮЧАМИ
    // Лучше всего динамически проверять event.headers.origin и разрешать только нужные.
    // "https://timely-smakager-d28608.netlify.app" // Сам ваш сайт, если он тоже делает запросы
];


exports.handler = async (event, context) => {
    // Определяем origin текущего запроса
    const requestOrigin = event.headers.origin;
    let accessControlAllowOriginHeader = "";

    // Проверяем, входит ли origin запроса в список разрешенных
    // Или если мы разрешаем все для тестирования (не рекомендуется для продакшена)
    // if (ALLOWED_ORIGINS.includes(requestOrigin) || ALLOWED_ORIGINS.includes("*")) {
    //   accessControlAllowOriginHeader = requestOrigin; // Отражаем origin запроса
    // }
    // ДЛЯ ТЕСТИРОВАНИЯ сейчас поставим '*', потом поменяем на более безопасный вариант
    accessControlAllowOriginHeader = "*";


    // Обработка OPTIONS-запроса (preflight)
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204, // No Content
            headers: {
                'Access-Control-Allow-Origin': accessControlAllowOriginHeader,
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
            },
            body: '',
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: { 'Access-Control-Allow-Origin': accessControlAllowOriginHeader },
            body: JSON.stringify({ error: 'Method Not Allowed' }),
        };
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("GEMINI_API_KEY не установлен!");
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': accessControlAllowOriginHeader },
            body: JSON.stringify({ error: 'API ключ не сконфигурирован на сервере.' }),
        };
    }

    let prompt;
    try {
        const body = JSON.parse(event.body);
        prompt = body.prompt;
        if (!prompt) {
            return {
                statusCode: 400,
                headers: { 'Access-Control-Allow-Origin': accessControlAllowOriginHeader },
                body: JSON.stringify({ error: 'Промпт не предоставлен в теле запроса.' }),
            };
        }
    } catch (e) {
        return {
            statusCode: 400,
            headers: { 'Access-Control-Allow-Origin': accessControlAllowOriginHeader },
            body: JSON.stringify({ error: 'Некорректный JSON в теле запроса.' }),
        };
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
                'Access-Control-Allow-Origin': accessControlAllowOriginHeader,
            },
            body: JSON.stringify({ generatedText: text }),
        };
    } catch (error) {
        console.error('Ошибка при вызове Gemini API:', error);
        let errorMessage = 'Не удалось сгенерировать ответ от AI.';
        if (error.message) {
            errorMessage += ` Детали: ${error.message}`;
        }
        return {
            statusCode: 500,
            headers: {
                "Content-Type": "application/json",
                'Access-Control-Allow-Origin': accessControlAllowOriginHeader,
            },
            body: JSON.stringify({ error: errorMessage }),
        };
    }
};
