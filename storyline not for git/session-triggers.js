// ===============================================
// ТРИГГЕРЫ STORYLINE ДЛЯ УПРАВЛЕНИЯ СЕССИЯМИ
// ===============================================

// -----------------------------------------------
// 1. ОСНОВНОЙ ТРИГГЕР ДИАЛОГА (с поддержкой сессий)
// -----------------------------------------------
// Используйте вместо предыдущего триггера
function dialogTriggerWithSessions() {
    // 1) Собираем ввод и накапливаем диалог
    function escapeStringForPrompt(str) {
        if (typeof str !== 'string') return "";
        return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }
    const player = GetPlayer();
    const currentInput = escapeStringForPrompt(player.GetVar("UserResponse") || "");
    const previousDialogue = player.GetVar("DialogueFull") || "";
    const fullDialogue = (previousDialogue + ' ' + currentInput).trim();
    player.SetVar("DialogueFull", fullDialogue);

    // 2) Получаем или создаём sessionId
    let sessionId = player.GetVar("SessionId") || null;
    if (!sessionId) {
        sessionId = 'sess_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now().toString(36);
        player.SetVar("SessionId", sessionId);
    }

    // 3) Промпты
    const systemPrompt = `
Ты играешь роль сотрудника Евгения в учебном диалоге. На самом деле ты коуч. 

Твоя задача — помогать руководителю пройти все шаги диалога по схеме ПРОВД: Поведение, Результат, Отношение, Вопрос, Договорённость.

Ты отвечаешь как Женя, но в каждой реплике мягко направляешь руководителя: даёшь ему пространство раскрыть нужный элемент структуры.

Всегда отвечай кратко (1–2 предложения). Только реплика Жени, без пояснений.
`;
    const finalPrompt = `
Вот как руководитель разговаривал с Евгением до этого:
"${fullDialogue}"

Сейчас он сказал:
"${currentInput}"

Ответь как Евгений — но так, чтобы помочь ему перейти к следующему шагу в диалоге по схеме ПРОВД.
`;

    // 4) Отправка с sessionId
    (function () {
        window.__wr = window.__wr || { readySet: new WeakSet(), busy: false };

        if (!window.__wr._readyListenerInstalled) {
            window.addEventListener('message', function (e) {
                if (e && e.data && e.data.type === 'bridgeReady') {
                    try { window.__wr.readySet.add(e.source); } catch (_) {}
                }
            });
            window.__wr._readyListenerInstalled = true;
        }

        const frame = (function findWebrecorder() {
            const iframes = Array.from(document.querySelectorAll('iframe'));
            return iframes.find(fr => {
                const src = (fr.getAttribute('src') || fr.src || '').toLowerCase();
                return src.includes('webrecorder');
            }) || iframes[0];
        })();

        if (!frame || !frame.contentWindow) {
            alert('Не найден iframe webrecorder.');
            return;
        }
        const win = frame.contentWindow;

        if (window.__wr.busy) return;
        window.__wr.busy = true;

        function waitForReadyOrTimeout(targetWin, timeoutMs) {
            if (window.__wr.readySet.has(targetWin)) return Promise.resolve();
            return new Promise((resolve) => {
                let done = false;
                const handler = (e) => {
                    if (!done && e.source === targetWin && e.data && e.data.type === 'bridgeReady') {
                        done = true;
                        window.removeEventListener('message', handler);
                        resolve();
                    }
                };
                window.addEventListener('message', handler);
                setTimeout(() => {
                    if (!done) {
                        done = true;
                        window.removeEventListener('message', handler);
                        resolve();
                    }
                }, timeoutMs || 1500);
            });
        }

        const finishOnResponse = (e) => {
            if (e.source !== win || !e.data || !e.data.type) return;
            if (e.data.type === 'geminiResponse' || e.data.type === 'error') {
                window.removeEventListener('message', finishOnResponse);
                window.__wr.busy = false;
            }
        };
        window.addEventListener('message', finishOnResponse);

        waitForReadyOrTimeout(win, 1500).then(() => {
            try {
                win.postMessage({
                    type: 'startRecordingWithPrompt',
                    payload: {
                        prompt: finalPrompt,
                        system: systemPrompt,
                        sessionId: sessionId
                    }
                }, '*');
                setTimeout(() => {
                    try { win.postMessage({ type: 'recorderSend' }, '*'); } catch (_) {}
                }, 30);
            } catch (_) {
                window.__wr.busy = false;
            }
            setTimeout(() => { window.__wr.busy = false; }, 15000);
        });
    })();
}

// -----------------------------------------------
// 2. ТРИГГЕР НАЧАЛА НОВОЙ СЕССИИ
// -----------------------------------------------
// Используйте в начале нового сценария/кейса
function startNewSessionTrigger() {
    const player = GetPlayer();
    
    // Генерируем новый sessionId
    const sessionId = 'sess_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now().toString(36);
    player.SetVar("SessionId", sessionId);
    
    // Очищаем накопленный диалог
    player.SetVar("DialogueFull", "");
    
    console.log('[Storyline] Создана новая сессия:', sessionId);
    
    // Отправляем команду webrecorder'у
    const iframes = Array.from(document.querySelectorAll('iframe'));
    const frame = iframes.find(fr => {
        const src = (fr.getAttribute('src') || fr.src || '').toLowerCase();
        return src.includes('webrecorder');
    }) || iframes[0];
    
    if (frame && frame.contentWindow) {
        try {
            frame.contentWindow.postMessage({ type: 'startNewSession' }, '*');
        } catch (_) {}
    }
}

// -----------------------------------------------
// 3. ТРИГГЕР ЗАВЕРШЕНИЯ СЕССИИ
// -----------------------------------------------
// Используйте в конце сценария/кейса
function endSessionTrigger() {
    const player = GetPlayer();
    const sessionId = player.GetVar("SessionId");
    
    if (sessionId) {
        console.log('[Storyline] Завершение сессии:', sessionId);
        
        // Отправляем команду webrecorder'у
        const iframes = Array.from(document.querySelectorAll('iframe'));
        const frame = iframes.find(fr => {
            const src = (fr.getAttribute('src') || fr.src || '').toLowerCase();
            return src.includes('webrecorder');
        }) || iframes[0];
        
        if (frame && frame.contentWindow) {
            try {
                frame.contentWindow.postMessage({ type: 'endSession' }, '*');
            } catch (_) {}
        }
        
        // Очищаем sessionId в Storyline
        player.SetVar("SessionId", "");
        player.SetVar("DialogueFull", "");
    }
}

// -----------------------------------------------
// 4. ТРИГГЕР СБРОСА КОНТЕКСТА СЕССИИ
// -----------------------------------------------
// Используйте для "перезапуска" диалога без создания новой сессии
function resetSessionContextTrigger() {
    const player = GetPlayer();
    const sessionId = player.GetVar("SessionId");
    
    if (sessionId) {
        console.log('[Storyline] Сброс контекста сессии:', sessionId);
        
        // Очищаем накопленный диалог
        player.SetVar("DialogueFull", "");
        
        // Отправляем команду webrecorder'у
        const iframes = Array.from(document.querySelectorAll('iframe'));
        const frame = iframes.find(fr => {
            const src = (fr.getAttribute('src') || fr.src || '').toLowerCase();
            return src.includes('webrecorder');
        }) || iframes[0];
        
        if (frame && frame.contentWindow) {
            try {
                frame.contentWindow.postMessage({ type: 'resetSession' }, '*');
            } catch (_) {}
        }
    } else {
        console.log('[Storyline] Нет активной сессии для сброса');
    }
}

// -----------------------------------------------
// 5. ТРИГГЕР ПРОВЕРКИ СТАТУСА СЕССИИ
// -----------------------------------------------
// Полезно для отладки
function checkSessionStatusTrigger() {
    const player = GetPlayer();
    const sessionId = player.GetVar("SessionId");
    const dialogueFull = player.GetVar("DialogueFull");
    
    console.log('[Storyline] Session Status:');
    console.log('SessionId:', sessionId || 'НЕТ');
    console.log('DialogueFull length:', (dialogueFull || '').length, 'символов');
    
    alert(`Сессия: ${sessionId || 'НЕТ'}\nДиалог: ${(dialogueFull || '').length} символов`);
}

// ===============================================
// ИНСТРУКЦИИ ПО ИСПОЛЬЗОВАНИЮ В STORYLINE:
// ===============================================
/*
1. ПЕРЕМЕННЫЕ В STORYLINE:
   - SessionId (текст) - для хранения ID текущей сессии
   - DialogueFull (текст) - накопленный диалог (опционально, для совместимости)
   - UserResponse (текст) - ввод пользователя

2. ТРИГГЕРЫ:
   - В начале нового кейса: startNewSessionTrigger()
   - При отправке реплики: dialogTriggerWithSessions()
   - При завершении кейса: endSessionTrigger()
   - Для сброса диалога: resetSessionContextTrigger()

3. КОМАНДЫ WEBRECORDER:
   - startNewSession - создать новую сессию
   - endSession - завершить сессию на сервере
   - resetSession - сбросить контекст сессии
   - startRecordingWithPrompt - установить промпт с sessionId
   - recorderSend - отправить (аудио или текст)

4. НОВЫЕ СОБЫТИЯ ОТ WEBRECORDER:
   - sessionCreated { sessionId } - сессия создана
   - sessionEnded { sessionId } - сессия завершена
   - sessionReset { sessionId } - контекст сброшен

5. ОБРАТНАЯ СОВМЕСТИМОСТЬ:
   - Если не передавать sessionId, работает как раньше (без сессий)
   - Все старые триггеры продолжают работать
*/
