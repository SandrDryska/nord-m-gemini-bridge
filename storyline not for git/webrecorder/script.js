// --- КОНФИГУРАЦИЯ ---
// URL бэкенда. Укажите ваш сайт Netlify, если хост отличается.
const BACKEND_URL = 'https://nord-m-gemini.netlify.app/.netlify/functions/generate';
const PARENT_WINDOW_ORIGIN = '*';

// --- DOM ЭЛЕМЕНТЫ ---
const btnRecord = document.getElementById('btnRecord');
const btnPlay = document.getElementById('btnPlay');
const btnSend = document.getElementById('btnSend');
const statusText = document.getElementById('statusText');
const preview = document.getElementById('preview');

// --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ---
let mediaRecorder;
let audioChunks = [];
let recordedBlob = null;
let currentPrompt = "";
let currentSystem = "";
let currentModelName = "";
let currentModelUri = "";
let currentTemperature = undefined;
let currentMaxTokens = undefined;
let preferredMimeType = '';
let currentSessionId = null; // ID текущей сессии

// --- ФУНКЦИИ ---

/**
 * Генерирует UUID для новой сессии
 */
function generateSessionId() {
    return 'sess_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now().toString(36);
}

/**
 * Получает или создаёт sessionId
 */
function getOrCreateSessionId() {
    if (!currentSessionId) {
        currentSessionId = generateSessionId();
        console.log('[WebRecorder] Создана новая сессия:', currentSessionId);
        // Уведомляем Storyline о новой сессии
        postStatusToParent('sessionCreated', { sessionId: currentSessionId });
    }
    return currentSessionId;
}

function ensureSupport() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        statusText.textContent = 'Микрофон не поддерживается в этом окружении.';
        console.log('[WebRecorder] getUserMedia not supported');
        btnRecord.disabled = true;
        return false;
    }
    if (typeof MediaRecorder === 'undefined') {
        statusText.textContent = 'MediaRecorder не поддерживается в этом окружении.';
        console.log('[WebRecorder] MediaRecorder not supported');
        btnRecord.disabled = true;
        return false;
    }
    return true;
}

/**
 * Отправляет статусное сообщение в Storyline.
 */
function postStatusToParent(type, payload) {
    const message = { type, payload };
    try { if (window.top) window.top.postMessage(message, PARENT_WINDOW_ORIGIN); } catch (_) {}
    try { if (window.parent && window.parent !== window) window.parent.postMessage(message, PARENT_WINDOW_ORIGIN); } catch (_) {}
    console.log(`[Bridge] Sending to parent: ${type}`, payload);
}

/**
 * Инициализация и запуск записи.
 */
async function startRecording() {
    console.log('[WebRecorder] startRecording clicked');
    if (!ensureSupport()) return;
    statusText.textContent = 'Запрос доступа к микрофону...';
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Предпочтительно OGG/Opus для SpeechKit, fallback — WebM/Opus
        const ogg = 'audio/ogg;codecs=opus';
        const webm = 'audio/webm;codecs=opus';
        preferredMimeType = MediaRecorder.isTypeSupported(ogg) ? ogg : (MediaRecorder.isTypeSupported(webm) ? webm : '');
        mediaRecorder = preferredMimeType ? new MediaRecorder(stream, { mimeType: preferredMimeType }) : new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = event => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = () => {
            statusText.textContent = 'Запись завершена. Можно прослушать или отправить.';
            const blobType = preferredMimeType || 'audio/webm';
            recordedBlob = new Blob(audioChunks, { type: blobType });
            // подготовим предпрослушивание
            preview.src = URL.createObjectURL(recordedBlob);
            btnPlay.disabled = false;
            btnSend.disabled = false;
            // позволяем начать новую запись
            btnRecord.onclick = startRecording;
        };
        
        mediaRecorder.start();
        console.log('[WebRecorder] MediaRecorder started');
        btnRecord.classList.add('recording');
        btnRecord.onclick = stopRecording; // Меняем действие кнопки
        statusText.textContent = 'Идет запись... Нажмите, чтобы остановить.';

    } catch (err) {
        console.error("Microphone access error:", err);
        statusText.textContent = 'Ошибка доступа к микрофону!';
        postStatusToParent('error', { context: 'mic_access', message: err.message });
        recordButton.disabled = true;
    }
}

/**
 * Остановка записи.
 */
function stopRecording() {
    console.log('[WebRecorder] stopRecording clicked');
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        btnRecord.classList.remove('recording');
        statusText.textContent = 'Запись остановлена.';
    }
}

function playPreview() {
    if (!recordedBlob) return;
    preview.style.display = 'block';
    preview.currentTime = 0;
    preview.play();
}

/**
 * Отправка данных на бэкенд (Netlify).
 */
async function sendAudioToBackend(prompt, audioBlob) {
    if (!audioBlob) return;
    const formData = new FormData();
    formData.append('prompt', prompt);
    if (currentSystem && currentSystem.trim().length > 0) {
        formData.append('system', currentSystem);
    }
    // Добавляем sessionId для поддержки сессий
    const sessionId = getOrCreateSessionId();
    formData.append('sessionId', sessionId);
    
    formData.append('audio', audioBlob, 'recording.webm');
    // Пробрасываем формат для STT в бекенд (oggopus | webm)
    try {
        const fmt = (preferredMimeType && typeof preferredMimeType === 'string')
            ? (preferredMimeType.includes('ogg') ? 'oggopus' : (preferredMimeType.includes('webm') ? 'webm' : ''))
            : '';
        if (fmt) formData.append('audioFormat', fmt);
    } catch (_) {}

    // Необязательная диагностика полезна при проблемах с загрузкой
    if (true) {
        console.log('--- [NeuroCode FormData Inspection] ---');
        for (const [key, value] of formData.entries()) {
            console.log(`Key: "${key}"`);
            if (value instanceof Blob) {
                console.log(`  Value is a Blob. Name: "${value.name}", Size: ${value.size} bytes, Type: "${value.type}"`);
            } else {
                console.log(`  Value: "${String(value).substring(0, 200)}..."`);
            }
        }
        console.log('--- [End of Inspection] ---');
    }

    try {
        const response = await fetch(BACKEND_URL, {
            method: 'POST',
            body: formData,
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || `Ошибка сервера: ${response.status}`);
        }
        console.log('[WebRecorder] Raw response:', data);
        if (data && typeof data.provider !== 'undefined') console.log(`[WebRecorder] Provider used: ${data.provider}`);
        if (data && Object.prototype.hasOwnProperty.call(data, 'transcript')) {
            // Прямой вызов Storyline API для установки переменной
            try {
                if (window.parent && window.parent.GetPlayer) {
                    const player = window.parent.GetPlayer();
                    player.SetVar('transcription', data.transcript ?? '');
                    // Дублируем транскрипт в UserResponse, чтобы одна переменная использовалась и для текстового сценария
                    player.SetVar('UserResponse', data.transcript ?? '');
                }
            } catch (e) {
                console.log('Storyline API не доступен:', e);
            }
        }
        // Передаём текст ответа модели в Storyline
        try { if (window.parent && window.parent.GetPlayer) window.parent.GetPlayer().SetVar('AIFeedback', data.generatedText ?? ''); } catch (_) {}
        postStatusToParent('geminiResponse', data.generatedText);
        statusText.textContent = 'Отправлено успешно.';
        resetToInitialState();

    } catch (error) {
        console.error("Backend request error:", error);
        postStatusToParent('error', { context: 'backend_request', message: error.message });
        statusText.textContent = 'Ошибка при диагностике. Попробуйте снова.';
        resetToInitialState();
    }
}

/**
 * Сброс состояния к начальному.
 */
function resetToInitialState() {
    btnRecord.disabled = false;
    btnRecord.classList.remove('recording');
    btnRecord.onclick = startRecording;
    btnPlay.disabled = true;
    btnSend.disabled = true;
}

// --- СЛУШАТЕЛЬ СООБЩЕНИЙ ОТ STORYLINE ---
window.addEventListener('message', (event) => {
    if (!event.data || !event.data.type) return;

    const { type, payload } = event.data;
    console.log('[WebRecorder] Incoming message:', type);

    if (type === 'startRecordingWithPrompt') {
        if (typeof payload === 'string') {
            currentPrompt = payload;
            currentSystem = '';
            console.log('[WebRecorder] currentPrompt set (string)');
        } else if (payload && typeof payload === 'object') {
            currentPrompt = payload.prompt || '';
            currentSystem = payload.system || '';
            // Поддержка sessionId из Storyline
            if (payload.sessionId) {
                currentSessionId = payload.sessionId;
                console.log('[WebRecorder] sessionId установлен из Storyline:', currentSessionId);
            }
            // Поддержка выбора модели и параметров генерации
            currentModelName = payload.modelName || '';
            currentModelUri = payload.modelUri || '';
            currentTemperature = (payload.temperature !== undefined && !Number.isNaN(Number(payload.temperature))) ? Number(payload.temperature) : undefined;
            currentMaxTokens = (payload.maxTokens !== undefined && !Number.isNaN(Number(payload.maxTokens))) ? Number(payload.maxTokens) : undefined;
            console.log('[WebRecorder] currentPrompt/system/model set (object)');
        }
        // UI готов к записи уже по умолчанию
    } else if (type === 'startNewSession') {
        // Команда для принудительного создания новой сессии
        currentSessionId = generateSessionId();
        console.log('[WebRecorder] Создана новая сессия по команде:', currentSessionId);
        postStatusToParent('sessionCreated', { sessionId: currentSessionId });
        statusText.textContent = 'Начата новая сессия диалога.';
    } else if (type === 'endSession') {
        // Команда для завершения текущей сессии
        if (currentSessionId) {
            // Отправляем команду завершения на сервер
            fetch(BACKEND_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: '',
                    sessionId: currentSessionId,
                    endSession: true
                }),
            })
            .then(async (r) => {
                const data = await r.json();
                console.log('[WebRecorder] Сессия завершена на сервере:', data);
                postStatusToParent('sessionEnded', { sessionId: currentSessionId });
                currentSessionId = null;
                statusText.textContent = 'Сессия диалога завершена.';
            })
            .catch(err => {
                console.error('[WebRecorder] Ошибка завершения сессии:', err);
                postStatusToParent('error', { context: 'end_session', message: String(err) });
            });
        } else {
            postStatusToParent('sessionEnded', { sessionId: null });
            statusText.textContent = 'Нет активной сессии для завершения.';
        }
    } else if (type === 'resetSession') {
        // Команда для сброса контекста текущей сессии
        if (currentSessionId) {
            fetch(BACKEND_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: '',
                    sessionId: currentSessionId,
                    resetContext: true
                }),
            })
            .then(async (r) => {
                const data = await r.json();
                console.log('[WebRecorder] Контекст сессии сброшен:', data);
                postStatusToParent('sessionReset', { sessionId: currentSessionId });
                statusText.textContent = 'Контекст диалога сброшен.';
            })
            .catch(err => {
                console.error('[WebRecorder] Ошибка сброса сессии:', err);
                postStatusToParent('error', { context: 'reset_session', message: String(err) });
            });
        } else {
            statusText.textContent = 'Нет активной сессии для сброса.';
        }
    } else if (type === 'recorderSend') {
        // Универсальная отправка: если есть запись — шлём аудио, если нет — шлём текст (финальный промпт)
        if (recordedBlob) {
            console.log('[WebRecorder] Sending audio...');
            sendAudioToBackend(currentPrompt, recordedBlob);
        } else {
            console.log('[WebRecorder] No audio, sending text...');
            try {
                if (window.parent && window.parent.GetPlayer) {
                    const player = window.parent.GetPlayer();
                    const userResp = player.GetVar('UserResponse') || player.GetVar('UserResponce') || '';
                    const promptToSend = (currentPrompt && currentPrompt.length > 0) ? currentPrompt : (userResp || '').toString();
                    if (!promptToSend || promptToSend.trim().length === 0) {
                        statusText.textContent = 'Нет ни аудио, ни текста для отправки.';
                        postStatusToParent('error', { context: 'no_input', message: 'Нет ни аудио, ни текста для отправки.' });
                        return;
                    }
                    fetch(BACKEND_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            prompt: promptToSend,
                            system: currentSystem || undefined,
                            sessionId: getOrCreateSessionId(),
                            modelName: currentModelName || undefined,
                            modelUri: currentModelUri || undefined,
                            temperature: currentTemperature,
                            maxTokens: currentMaxTokens,
                        }),
                    })
                    .then(async (r) => {
                        const data = await r.json();
                        if (!r.ok) throw new Error(data.error || `Ошибка сервера: ${r.status}`);
                        try { player.SetVar('AIFeedback', data.generatedText ?? ''); } catch (_) {}
                        postStatusToParent('geminiResponse', data.generatedText);
                        statusText.textContent = 'Отправлено успешно.';
                    })
                    .catch(err => {
                        postStatusToParent('error', { context: 'backend_request_text', message: String(err) });
                        statusText.textContent = 'Ошибка отправки текста.';
                    });
                }
            } catch (e) {
                console.log('Storyline API не доступен:', e);
            }
        }
    }
});

// --- ИНИЦИАЛИЗАЦИЯ ОБРАБОТЧИКОВ КНОПОК ---
// Скрипт подключен внизу страницы, поэтому элементы уже доступны
try {
    btnRecord.onclick = startRecording;
    btnPlay.onclick = playPreview;
    // btnSend управляется Storyline, кнопка скрыта
} catch (e) {
    console.log('Init handlers error:', e);
}

// На случай, если скрипт подключён выше DOM
document.addEventListener('DOMContentLoaded', () => {
    try {
        btnRecord.onclick = startRecording;
        btnPlay.onclick = playPreview;
    } catch (e) {
        console.log('DOMContentLoaded bind error:', e);
    }
});

// --- ИНИЦИАЛИЗАЦИЯ ---
postStatusToParent('bridgeReady', true);