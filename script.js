// script.js

const PARENT_WINDOW_ORIGIN = '*'; // В продакшене замените на origin вашего LMS

let mediaRecorder;
let audioChunks = [];
let currentAudioPrompt = ""; // Промпт, который будет отправлен вместе с аудио

// --- Функции обратной связи со Storyline ---
function postStatusToParent(type, payload) {
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type, payload }, PARENT_WINDOW_ORIGIN);
    }
    console.log(`Sending to parent: ${type}`, payload);
}

// --- Логика записи аудио ---
async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = []; // Очищаем массив

        mediaRecorder.ondataavailable = event => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = () => {
            postStatusToParent('recordingState', { status: 'processing', message: 'Обработка аудио...' });
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            sendAudioToBackend(currentAudioPrompt, audioBlob); // Используем специализированную функцию
        };
        
        mediaRecorder.start();
        postStatusToParent('recordingState', { status: 'recording', message: 'Идет запись...' });

    } catch (err) {
        postStatusToParent('error', { context: 'mic_access', message: `Ошибка доступа к микрофону: ${err.message}` });
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    } else {
        postStatusToParent('error', { context: 'recorder_stop', message: 'Запись не была активна.' });
    }
}

// --- Обработчик сообщений от Storyline ---
window.addEventListener('message', (event) => {
    // Безопасность: if (PARENT_WINDOW_ORIGIN !== '*' && event.origin !== PARENT_WINDOW_ORIGIN) return;
    if (!event.data || !event.data.type) return;

    const { type, payload } = event.data;

    switch (type) {
        // --- НОВЫЙ ПАЙПЛАЙН: ТОЛЬКО ТЕКСТ ---
        case 'sendTextOnly':
            postStatusToParent('bridgeStatus', `Текстовый запрос получен: "${payload}". Отправка...`);
            sendTextToBackend(payload);
            break;

        // --- ПАЙПЛАЙН С АУДИО ---
        case 'setAudioPrompt': // 1. Установить текст для аудио
            currentAudioPrompt = payload;
            postStatusToParent('bridgeStatus', `Промпт для аудио "${payload}" установлен. Мост готов к записи.`);
            break;
        case 'startRecording': // 2. Начать запись
            startRecording();
            break;
        case 'stopRecording':  // 3. Остановить и отправить
            stopRecording();
            break;
    }
});

// --- Функции отправки данных на бэкенд ---

/**
 * Пайплайн 1: Отправка только текстового промпта
 * @param {string} prompt - Текст для отправки.
 */
async function sendTextToBackend(prompt) {
    postStatusToParent('requestState', { status: 'processing', message: 'Отправка текстового запроса...' });
    try {
        const response = await fetch('/.netlify/functions/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ prompt }),
        });
        
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || `Ошибка сервера: ${response.status}`);
        }

        postStatusToParent('geminiResponse', data.generatedText);
        postStatusToParent('requestState', { status: 'idle', message: 'Готов к новому запросу.' });

    } catch (error) {
        postStatusToParent('error', { context: 'backend_request_text', message: error.message });
        postStatusToParent('requestState', { status: 'idle', message: 'Ошибка, готов к новой попытке.' });
    }
}

/**
 * Пайплайн 2: Отправка аудио и связанного с ним текста
 * @param {string} prompt - Текст, сопровождающий аудио.
 * @param {Blob} audioBlob - Аудиоданные.
 */
async function sendAudioToBackend(prompt, audioBlob) {
    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('audio', audioBlob, 'recording.webm');

    try {
        const response = await fetch('/.netlify/functions/generate', {
            method: 'POST',
            body: formData, // Content-Type будет установлен браузером как multipart/form-data
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || `Ошибка сервера: ${response.status}`);
        }

        postStatusToParent('geminiResponse', data.generatedText);
        postStatusToParent('recordingState', { status: 'idle', message: 'Готов к новой записи.' });

    } catch (error) {
        postStatusToParent('error', { context: 'backend_request_audio', message: error.message });
        postStatusToParent('recordingState', { status: 'idle', message: 'Ошибка, готов к новой попытке.' });
    }
}


// --- Инициализация моста ---
postStatusToParent('bridgeReady', true);
postStatusToParent('requestState', { status: 'idle', message: 'Готов к работе.' });
postStatusToParent('recordingState', { status: 'idle', message: 'Готов к записи.' });