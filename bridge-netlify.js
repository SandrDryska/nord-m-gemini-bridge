// bridge-netlify.js

const PARENT_WINDOW_ORIGIN = '*'; // В продакшене замените на origin вашего LMS

let mediaRecorder;
let audioChunks = [];
let currentAudioPrompt = "";
let recordedAudioBlob = null; // Будет хранить записанный Blob для прослушивания/отправки
let audioPreviewElement = null; // Элемент для проигрывания

// --- Функции обратной связи со Storyline ---
function postStatusToParent(type, payload) {
    const message = { type, payload };
    try { if (window.top) window.top.postMessage(message, PARENT_WINDOW_ORIGIN); } catch (_) {}
    try { if (window.parent && window.parent !== window) window.parent.postMessage(message, PARENT_WINDOW_ORIGIN); } catch (_) {}
    console.log(`Sending to parent: ${type}`, payload);
}

// --- Логика записи и управления аудио ---

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        recordedAudioBlob = null; // Сбрасываем предыдущую запись

        mediaRecorder.ondataavailable = event => {
            audioChunks.push(event.data);
        };

        // МОДИФИКАЦИЯ: Теперь onstop не отправляет, а сохраняет аудио и уведомляет Storyline
        mediaRecorder.onstop = () => {
            recordedAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            postStatusToParent('recordingState', { status: 'recorded', message: 'Запись завершена. Готово к прослушиванию или отправке.' });
        };
        
        mediaRecorder.start();
        postStatusToParent('recordingState', { status: 'recording', message: 'Идет запись...' });

    } catch (err) {
        postStatusToParent('error', { context: 'mic_access', message: `Ошибка доступа к микрофону: ${err.message}` });
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop(); // Это вызовет onstop
    } else {
        postStatusToParent('error', { context: 'recorder_stop', message: 'Запись не была активна.' });
    }
}

// НОВАЯ ФУНКЦИЯ: Прослушивание
function playPreview() {
    if (!recordedAudioBlob) {
        postStatusToParent('error', { context: 'playback', message: 'Нет записанного аудио для прослушивания.' });
        return;
    }
    if (!audioPreviewElement) {
        audioPreviewElement = new Audio();
        audioPreviewElement.onended = () => postStatusToParent('playbackState', { status: 'stopped' });
    }
    audioPreviewElement.src = URL.createObjectURL(recordedAudioBlob);
    audioPreviewElement.play();
    postStatusToParent('playbackState', { status: 'playing' });
}

// НОВАЯ ФУНКЦИЯ: Отправка сохраненного аудио
function sendRecordedAudio() {
    if (!recordedAudioBlob) {
        postStatusToParent('error', { context: 'send_audio', message: 'Нет записанного аудио для отправки.' });
        return;
    }
    // Используем существующую функцию отправки
    sendAudioToBackend(currentAudioPrompt, recordedAudioBlob);
    recordedAudioBlob = null; // Очищаем после отправки
}


// --- Обработчик сообщений от Storyline ---
window.addEventListener('message', (event) => {
    // Безопасность: if (PARENT_WINDOW_ORIGIN !== '*' && event.origin !== PARENT_WINDOW_ORIGIN) return;
    if (!event.data || !event.data.type) return;

    const { type, payload } = event.data;

    switch (type) {
        // --- ПАЙПЛАЙН: ТОЛЬКО ТЕКСТ ---
        case 'sendTextOnly':
            postStatusToParent('bridgeStatus', `Текстовый запрос получен: "${payload}". Отправка...`);
            sendTextToBackend(payload);
            break;

        // --- ПАЙПЛАЙН С АУДИО ---
        case 'setAudioPrompt':
            currentAudioPrompt = payload;
            postStatusToParent('bridgeStatus', `Промпт для аудио "${payload}" установлен.`);
            break;
        case 'startRecording':
            startRecording();
            break;
        case 'stopRecording':
            stopRecording();
            break;
        // НОВЫЕ КОМАНДЫ ДЛЯ УПРАВЛЕНИЯ АУДИО
        case 'playPreview':
            playPreview();
            break;
        case 'sendRecordedAudio':
            sendRecordedAudio();
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

        console.log('[Bridge] Raw response:', data);
        if (data && typeof data.provider !== 'undefined') console.log(`[Bridge] Provider used: ${data.provider}`);
        if (data && Object.prototype.hasOwnProperty.call(data, 'transcript')) {
            console.log(`[Bridge] Transcript: ${data.transcript}`);
            postStatusToParent('transcription', data.transcript ?? '');
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
    postStatusToParent('recordingState', { status: 'processing', message: 'Отправка аудио на сервер...' });
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

        console.log('[Bridge] Raw response:', data);
        if (data && typeof data.provider !== 'undefined') console.log(`[Bridge] Provider used: ${data.provider}`);
        if (data && Object.prototype.hasOwnProperty.call(data, 'transcript')) {
            console.log(`[Bridge] Transcript: ${data.transcript}`);
            postStatusToParent('transcription', data.transcript ?? '');
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
