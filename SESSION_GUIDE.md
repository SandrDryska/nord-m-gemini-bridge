# 🎯 Руководство по WebRecorder для Storyline

*Простое подключение ИИ к вашим курсам без сложного программирования*

---

## 🤔 Что это такое?

**WebRecorder** — это готовый инструмент, который превращает ваш обычный Storyline-курс в интерактивный диалог с искусственным интеллектом! 

### ✨ Что умеет WebRecorder:
- 💬 **Текстовый чат**: пользователь пишет → ИИ отвечает
- 🎤 **Голосовой диалог**: пользователь говорит → ИИ слышит, понимает и отвечает
- 🧠 **Память разговора**: ИИ помнит, что говорилось раньше (как в ChatGPT)
- 🎭 **Ролевые игры**: ИИ может играть роль коллеги, клиента, наставника
- 🔧 **Простое управление**: всё настраивается обычными триггерами Storyline

### 🎯 Идеально для:
- Тренировки переговоров и продаж
- Практики сложных разговоров
- Ролевых игр с коллегами/клиентами  
- Обучения коммуникативным навыкам
- Симуляции реальных рабочих ситуаций

---

## 🚀 Быстрый старт: что добавить на слайд

### Шаг 1: Добавьте WebObject
Вставьте на слайд **Web Object** и укажите URL: `webrecorder/index.html` (или опубликованную ссылку на него)

### Шаг 2: Создайте переменные Storyline
Откройте **Manage Project Variables** и создайте эти переменные (тип: **Text**):

| Переменная | Назначение | Обязательна? |
|------------|------------|--------------|
| **SessionId** | Запоминает текущий разговор | Да (для памяти ИИ) |
| **UserResponse** | Текст, который вводит пользователь | Да |
| **AIFeedback** | Ответ ИИ (показывается пользователю) | Да |
| **transcription** | Расшифровка речи (если используете голос) | Нет |

### Шаг 3: Готово!
Теперь можно добавлять триггеры и создавать диалоги 🎉

---

## 📚 Как это работает? (можно пропустить)

Общение между Storyline и WebRecorder происходит через специальные "сообщения":

### 📤 Команды (что вы отправляете WebRecorder):
- **`startRecordingWithPrompt`** — настроить, что и как спросить у ИИ
- **`recorderSend`** — отправить запрос (голос или текст)
- **`startNewSession`** — начать новый разговор
- **`resetSession`** — забыть предыдущие реплики, но не завершать разговор  
- **`endSession`** — полностью завершить разговор

### 📥 События (что WebRecorder сообщает вам):
- **`bridgeReady`** — "Я готов к работе!"
- **`geminiResponse`** — "Вот ответ ИИ"
- **`transcription`** — "Вот что сказал пользователь" (при записи голоса)
- **`error`** — "Что-то пошло не так"

---

## 🛠️ Готовые скрипты — скопируйте и используйте!

**Не пугайтесь кода!** Просто копируйте нужный скрипт и вставляйте в триггер **Execute JavaScript**. Всё будет работать автоматически.

### 🔥 Скрипт №1: Отправить текст ИИ
*Используйте в триггере кнопки "Отправить"*

```javascript
(function(){
  const player = GetPlayer();
  const sessionId = player.GetVar('SessionId') || '';
  const prompt = String(player.GetVar('UserResponse') || '');
  const ifr = Array.from(document.querySelectorAll('iframe')).find(fr => (fr.getAttribute('src')||fr.src||'').toLowerCase().includes('webrecorder')) || document.querySelector('iframe');
  if (!ifr || !ifr.contentWindow) { alert('WebRecorder не найден'); return; }
  function send(){
    ifr.contentWindow.postMessage({ type: 'startRecordingWithPrompt', payload: { prompt, sessionId } }, '*');
    setTimeout(()=>{ ifr.contentWindow.postMessage({ type: 'recorderSend' }, '*'); }, 30);
  }
  function onReady(e){ if (e.source===ifr.contentWindow && e.data && e.data.type==='bridgeReady'){ window.removeEventListener('message', onReady); send(); } }
  window.addEventListener('message', onReady);
  setTimeout(send, 800);
})();
```

### 🆕 Скрипт №2: Начать новый разговор
*Используйте при входе на слайд или в кнопке "Начать заново"*

```javascript
(function(){
  const player = GetPlayer();
  const sessionId = 'sess_' + Math.random().toString(36).substr(2,9) + '_' + Date.now().toString(36);
  player.SetVar('SessionId', sessionId);
  const ifr = Array.from(document.querySelectorAll('iframe')).find(fr => (fr.getAttribute('src')||fr.src||'').toLowerCase().includes('webrecorder')) || document.querySelector('iframe');
  if (ifr && ifr.contentWindow) ifr.contentWindow.postMessage({ type: 'startNewSession' }, '*');
})();
```

### 🔄 Скрипт №3: Сбросить память ИИ
*ИИ забудет что говорилось раньше, но разговор продолжится*

```javascript
(function(){
  const ifr = Array.from(document.querySelectorAll('iframe')).find(fr => (fr.getAttribute('src')||fr.src||'').toLowerCase().includes('webrecorder')) || document.querySelector('iframe');
  if (ifr && ifr.contentWindow) ifr.contentWindow.postMessage({ type: 'resetSession' }, '*');
})();
```

### 🏁 Скрипт №4: Завершить разговор
*Используйте при выходе со слайда или в кнопке "Закончить"*

```javascript
(function(){
  const player = GetPlayer();
  const ifr = Array.from(document.querySelectorAll('iframe')).find(fr => (fr.getAttribute('src')||fr.src||'').toLowerCase().includes('webrecorder')) || document.querySelector('iframe');
  if (ifr && ifr.contentWindow) ifr.contentWindow.postMessage({ type: 'endSession' }, '*');
  player.SetVar('SessionId','');
})();
```

### 📥 Скрипт №5: Получать ответы ИИ
*Поставьте ОДИН раз "при входе на слайд" — он будет ловить все ответы ИИ*

```javascript
(function(){
  function onMsg(e){
    if (!e.data || !e.data.type) return;
    if (e.data.type==='geminiResponse') { try { GetPlayer().SetVar('AIFeedback', String(e.data.payload||e.data) ); } catch(_){} }
    if (e.data.type==='transcription') { try { GetPlayer().SetVar('transcription', String(e.data.payload||'') ); } catch(_){} }
  }
  window.addEventListener('message', onMsg);
})();
```

---

## 💡 Простой пример: как сделать диалог за 5 минут

### Что делаем:
Создаём слайд, где пользователь может написать сообщение коллеге-ИИ и получить ответ.

### Пошагово:

**1.** Добавляйте на слайд:
   - **Web Object** с WebRecorder
   - **Текстовое поле** для ввода (привяжите к переменной `UserResponse`)  
   - **Кнопку "Отправить"**
   - **Текстовое поле** для ответа ИИ (привяжите к переменной `AIFeedback`)

**2.** В триггере кнопки "Отправить" → **Execute JavaScript** вставляйте **Скрипт №1**

**3.** Добавляйте триггер **"When timeline starts"** → **Execute JavaScript** → **Скрипт №5**

**4.** Для начала нового разговора добавляйте **"When timeline starts"** → **Execute JavaScript** → **Скрипт №2**

**5.** Готово! 🎉 Теперь пользователь может писать, а ИИ отвечать.

---

## 📋 Справочник переменных

| Переменная | Что в неё класть | Кто заполняет |
|------------|------------------|---------------|
| **SessionId** | ID разговора (например: `sess_abc123_xyz`) | Скрипт №2 |
| **UserResponse** | Что написал пользователь | Пользователь/вы |
| **AIFeedback** | Ответ ИИ | Скрипт №5 |
| **transcription** | Расшифровка голоса | Скрипт №5 |

---

## 🎨 Продвинутые возможности

### 🎭 Задать роль ИИ
Хотите, чтобы ИИ играл конкретную роль? Измените **Скрипт №1**, добавив поле `system`:

```javascript
// Найдите эту строку в Скрипте №1:
ifr.contentWindow.postMessage({ type: 'startRecordingWithPrompt', payload: { prompt, sessionId } }, '*');

// Замените на:
ifr.contentWindow.postMessage({ 
  type: 'startRecordingWithPrompt', 
  payload: { 
    prompt, 
    sessionId,
    system: 'Ты строгий руководитель отдела продаж. Всегда говори по делу и требуй конкретики.' 
  } 
}, '*');
```

### 📊 Добавить кнопки управления
Можете добавить кнопки:
- **"Начать заново"** → **Скрипт №2**  
- **"Забыть предыдущее"** → **Скрипт №3**
- **"Завершить"** → **Скрипт №4**

---

## 💡 Полезные советы

### ✅ Что делать:
- Всегда используйте **Скрипт №5** для получения ответов
- Давайте ИИ чёткие роли и инструкции
- Тестируйте в разных браузерах
- Для голосового ввода разрешите доступ к микрофону

### ❌ Чего не делать:
- Не забывайте добавлять переменные Storyline
- Не запускайте несколько скриптов отправки одновременно
- Не используйте спецсимволы в переменных

---

## 🐛 Что делать, если не работает?

| Проблема | Решение |
|----------|---------|
| "Ничего не происходит при нажатии" | Проверьте, что WebObject загружен и есть все переменные |
| "Ответ не появляется" | Убедитесь, что добавили **Скрипт №5** |
| "Ошибка в консоли" | Откройте F12 → Console и пришлите текст ошибки |
| "ИИ не помнит контекст" | Проверьте, что переменная `SessionId` не пустая |

---

## 🚀 Готово к использованию!

Теперь у вас есть всё необходимое для создания интерактивных диалогов с ИИ в Storyline. Начинайте с простого примера, а затем добавляйте продвинутые функции по мере необходимости.

**Удачи в создании классных курсов! 🎓✨**