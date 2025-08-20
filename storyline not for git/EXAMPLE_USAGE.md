# Пример использования сессий в Storyline

## Сценарий: Диалог с коучем Женей

### Переменные в Storyline
Создайте эти переменные:
- **SessionId** (текст, начальное значение: пусто)
- **UserResponse** (текст, начальное значение: пусто)  
- **AIFeedback** (текст, начальное значение: пусто)

### Слайд 1: Начало кейса

**Триггер "При входе на слайд":**
```javascript
// Начинаем новую сессию диалога
function startNewSessionTrigger() {
    const player = GetPlayer();
    
    const sessionId = 'sess_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now().toString(36);
    player.SetVar("SessionId", sessionId);
    player.SetVar("DialogueFull", "");
    
    console.log('[Storyline] Создана новая сессия:', sessionId);
    
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

startNewSessionTrigger();
```

### Слайды 2-N: Диалог

**Триггер "При нажатии кнопки Отправить":**
```javascript
// Основной триггер диалога с поддержкой сессий
function dialogTriggerWithSessions() {
    function escapeStringForPrompt(str) {
        if (typeof str !== 'string') return "";
        return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }
    const player = GetPlayer();
    const currentInput = escapeStringForPrompt(player.GetVar("UserResponse") || "");
    const previousDialogue = player.GetVar("DialogueFull") || "";
    const fullDialogue = (previousDialogue + ' ' + currentInput).trim();
    player.SetVar("DialogueFull", fullDialogue);

    let sessionId = player.GetVar("SessionId") || null;
    if (!sessionId) {
        sessionId = 'sess_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now().toString(36);
        player.SetVar("SessionId", sessionId);
    }

    const systemPrompt = \`
Ты играешь роль сотрудника Евгения в учебном диалоге. На самом деле ты коуч. 

Твоя задача — помогать руководителю пройти все шаги диалога по схеме ПРОВД: Поведение, Результат, Отношение, Вопрос, Договорённость.

Ты отвечаешь как Женя, но в каждой реплике мягко направляешь руководителя: даёшь ему пространство раскрыть нужный элемент структуры.

Всегда отвечай кратко (1–2 предложения). Только реплика Жени, без пояснений.
\`;
    const finalPrompt = \`
Вот как руководитель разговаривал с Евгением до этого:
"\${fullDialogue}"

Сейчас он сказал:
"\${currentInput}"

Ответь как Евгений — но так, чтобы помочь ему перейти к следующему шагу в диалоге по схеме ПРОВД.
\`;

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

dialogTriggerWithSessions();
```

### Последний слайд: Завершение

**Триггер "При входе на слайд":**
```javascript
// Завершаем сессию
function endSessionTrigger() {
    const player = GetPlayer();
    const sessionId = player.GetVar("SessionId");
    
    if (sessionId) {
        console.log('[Storyline] Завершение сессии:', sessionId);
        
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
        
        player.SetVar("SessionId", "");
        player.SetVar("DialogueFull", "");
    }
}

endSessionTrigger();
```

## Дополнительно: Кнопка сброса диалога

**Триггер для кнопки "Начать заново":**
```javascript
// Сбрасываем контекст без завершения сессии
function resetSessionContextTrigger() {
    const player = GetPlayer();
    const sessionId = player.GetVar("SessionId");
    
    if (sessionId) {
        console.log('[Storyline] Сброс контекста сессии:', sessionId);
        
        player.SetVar("DialogueFull", "");
        
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

resetSessionContextTrigger();
```

## Результат

Теперь ваш диалог с Женей будет:

1. **Помнить предыдущие реплики** — Женя отвечает в контексте всей беседы
2. **Автоматически управлять памятью** — старые сообщения удаляются при превышении лимита
3. **Предоставлять гибкое управление** — можно сбросить контекст или завершить сессию

Женя станет намного более естественным собеседником, который понимает ход диалога и помогает продвигаться по структуре ПРОВД с учётом всего сказанного ранее!
