const PARENT_WINDOW_ORIGIN = '*'; // В продакшене замените на origin вашего LMS

let mediaRecorder;
let audioChunks = [];
let currentTextPrompt = "";

// --- Функции обратной связи со Storyline ---

/**
 * Отправляет статусное сообщение в родительское окно.
 * @param {string} type - Тип сообщения (например, 'recordingState', 'bridgeStatus', 'error').
 * @param {any} payload - Полезная нагрузка.
 */
function postStatusToParent(type, payload) {
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type, payload }, PARENT_WINDOW_ORIGIN);
    }
    // Логируем для отладки
    console.log(`Sending to parent: ${type}`, payload);
}

// --- Логика записи аудио (теперь запускается командами) ---

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = []; // Очищаем массив перед новой записью

        mediaRecorder.ondataavailable = event => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = () => {
            postStatusToParent('recordingState', { status: 'processing', message: 'Запись остановлена, обрабатывается...' });
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            sendDataToBackend(currentTextPrompt, audioBlob);
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

// 1. Слушаем сообщения от Storyline
window.addEventListener('message', (event) => {
    // ВАЖНО: Проверка Origin для безопасности!
    // if (PARENT_WINDOW_ORIGIN !== '*' && event.origin !== PARENT_WINDOW_ORIGIN) return;

    if (!event.data || !event.data.type) return;

    const { type, payload } = event.data;

    switch (type) {
        case 'sendPromptToGemini':
            currentTextPrompt = payload;
            postStatusToParent('bridgeStatus', `Текстовый промпт получен: "${payload}". Мост готов к записи.`);
            break;
        case 'startRecording':
            startRecording();
            break;
        case 'stopRecording':
            stopRecording();
            break;
    }
});

// 2. Отправляем данные на бэкенд (без изменений)
async function sendDataToBackend(prompt, audioBlob) {
    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('audio', audioBlob, 'recording.webm');

    try {
        const response = await fetch('/.netlify/functions/generate', {
            method: 'POST',
            body: formData,
        });

        const responseBodyText = await response.text();
        if (!response.ok) {
            throw new Error(`Ошибка сервера: ${response.status}. Ответ: ${responseBodyText}`);
        }
        
        const data = JSON.parse(responseBodyText);
        // Отправляем финальный результат
        postStatusToParent('geminiResponse', data.generatedText);
        // Возвращаем мост в состояние ожидания
        postStatusToParent('recordingState', { status: 'idle', message: 'Готов к новой записи.' });

    } catch (error) {
        postStatusToParent('error', { context: 'backend_request', message: error.message });
        postStatusToParent('recordingState', { status: 'idle', message: 'Ошибка, готов к новой попытке.' });
    }
}

// Сообщаем, что мост готов к работе при загрузке
postStatusToParent('bridgeReady', true);
postStatusToParent('recordingState', { status: 'idle', message: 'Готов к записи.' });