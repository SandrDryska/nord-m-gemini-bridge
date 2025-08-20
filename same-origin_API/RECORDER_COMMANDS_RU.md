# WebRecorder API — Команды JavaScript

> **Справочник по программному управлению веб-рекордером из Storyline**

Эти команды позволяют полностью автоматизировать работу с ИИ без использования кнопок веб-объекта. Все команды выполняются через триггер «Execute JavaScript» в Storyline.

## 📋 Содержание
- [Инициализация](#инициализация)
- [Управление записью](#управление-записью)
- [Отправка запросов](#отправка-запросов)
- [Управление сессиями](#управление-сессиями)
- [Дополнительные настройки](#дополнительные-настройки)
- [Отладка и события](#отладка-и-события)
- [Готовые сценарии](#готовые-сценарии)

## Инициализация

### Базовая инициализация
**Когда использовать:** Один раз при загрузке слайда  
**Триггер:** "When timeline starts"

```javascript
(function(){
  var iframe = Array.from(document.getElementsByTagName('iframe')).find(function(f){
    try { return (f.src||'').indexOf('same-origin_API') !== -1; } catch(e){ return false; }
  });
  if (iframe && iframe.contentWindow && iframe.contentWindow.WebRecorder) {
    iframe.contentWindow.WebRecorder.init({ 
      autosync: true,    // Читать переменные Storyline
      mode: 'mixed',     // Универсальный режим
      autosend: true     // Автоотправка при изменении SR_Prompt
    });
  }
})();
```

### Расширенная инициализация
**Когда использовать:** Для SCORM Cloud или специальных настроек

```javascript
(function(){
  var iframe = Array.from(document.getElementsByTagName('iframe')).find(function(f){
    try { return (f.src||'').indexOf('same-origin_API') !== -1; } catch(e){ return false; }
  });
  if (iframe && iframe.contentWindow && iframe.contentWindow.WebRecorder) {
    var WR = iframe.contentWindow.WebRecorder;
    WR.init({ autosync: true, mode: 'mixed' });
    WR.setEndpoint('https://ваш-сайт.netlify.app/.netlify/functions/generate');
    WR.setAutosend(true);
    WR.debug(true); // Включить логи для отладки
    
    // Создать новую сессию, если её нет
    var player = GetPlayer();
    if (!player.GetVar('SR_SessionId')) {
      WR.newSessionId('lesson');
    }
  }
})();
```

### Параметры инициализации
| Параметр | Тип | Описание |
|----------|-----|----------|
| `autosync` | boolean | Автоматическое чтение переменных Storyline |
| `mode` | string | Режим: 'text', 'voice', 'mixed' |
| `autosend` | boolean | Автоотправка при изменении SR_Prompt |
| `endpoint` | string | URL бэкенд-функции |

## Управление записью

### Запись голоса
```javascript
// Начать запись
iframe.contentWindow.WebRecorder.startRecording()
  .then(() => console.log('Запись началась'))
  .catch(err => console.error('Ошибка записи:', err));

// Остановить запись
iframe.contentWindow.WebRecorder.stopRecording();

// Прослушать записанное аудио
iframe.contentWindow.WebRecorder.play();
```

### Полный цикл записи
**Сценарий:** Запись → Прослушивание → Отправка

```javascript
// Кнопка "Начать запись"
function startVoiceInput() {
  var WR = iframe.contentWindow.WebRecorder;
  WR.setPrompt('Опишите проблему голосом'); // Контекст для ИИ
  WR.startRecording();
}

// Кнопка "Остановить и прослушать"
function stopAndPreview() {
  var WR = iframe.contentWindow.WebRecorder;
  WR.stopRecording();
  setTimeout(() => WR.play(), 500); // Небольшая задержка
}

// Кнопка "Отправить голосовое сообщение"
function sendVoice() {
  iframe.contentWindow.WebRecorder.send();
}
```

## Отправка запросов

### Универсальная отправка
```javascript
// Автоматический выбор: голос (если есть) или текст
iframe.contentWindow.WebRecorder.send()
  .then(result => {
    console.log('Ответ получен:', result.generatedText);
    // Ответ автоматически записан в SR_Response
  })
  .catch(error => {
    console.error('Ошибка отправки:', error.message);
  });
```

### Принудительные режимы
```javascript
// Только текст (игнорировать аудио)
var WR = iframe.contentWindow.WebRecorder;
WR.setMode('text');
WR.send();

// Только голос (требуется запись)
WR.setMode('voice');
WR.send();

// Вернуть универсальный режим
WR.setMode('mixed');
```

### Отправка с параметрами
```javascript
// Установить промпт и отправить
var WR = iframe.contentWindow.WebRecorder;
WR.setPrompt('Объясни квантовую физику простыми словами');
WR.setSystem('Ты — учитель физики для школьников');
WR.send();
```

### Быстрые команды
```javascript
// Отправить текст одной командой
function sendQuickText(prompt) {
  var WR = iframe.contentWindow.WebRecorder;
  WR.setPrompt(prompt);
  WR.setMode('text');
  WR.send();
}

// Использование
sendQuickText('Привет! Как дела?');
```

## Управление сессиями

### Создание и настройка сессий
```javascript
// Создать новую сессию с автоматическим ID
var sessionId = iframe.contentWindow.WebRecorder.newSessionId('урок-1');
console.log('Создана сессия:', sessionId);

// Установить конкретный ID сессии
iframe.contentWindow.WebRecorder.setSessionId('курс-математика-урок-5');

// Комплексная настройка сессии
iframe.contentWindow.WebRecorder.setSession({
  id: 'диалог-с-ии-помощником',
  resetContext: false,  // Сохранить историю
  endSession: false     // Продолжить сессию
});
```

### Управление контекстом
```javascript
// Очистить историю диалога (но сохранить сессию)
iframe.contentWindow.WebRecorder.resetContext();

// Завершить сессию при следующей отправке
iframe.contentWindow.WebRecorder.endSession();

// Проверить текущую сессию
var currentSession = GetPlayer().GetVar('SR_SessionId');
if (!currentSession) {
  iframe.contentWindow.WebRecorder.newSessionId('новая-сессия');
}
```

### Сценарии использования сессий
```javascript
// Начало урока — новая сессия
function startLesson(lessonName) {
  var WR = iframe.contentWindow.WebRecorder;
  WR.newSessionId('урок-' + lessonName);
  WR.setSystem('Ты — персональный наставник по теме: ' + lessonName);
}

// Переход к новой теме — сброс контекста
function newTopic() {
  iframe.contentWindow.WebRecorder.resetContext();
}

// Конец урока — завершение сессии
function endLesson() {
  var WR = iframe.contentWindow.WebRecorder;
  WR.setPrompt('Спасибо за урок! Подведи итоги.');
  WR.endSession();
  WR.send();
}
```

## Дополнительные настройки

### Настройка поведения ИИ
```javascript
// Установить роль ассистента
iframe.contentWindow.WebRecorder.setSystem('Ты — строгий экзаменатор по математике');

// Изменить промпт программно
iframe.contentWindow.WebRecorder.setPrompt('Задай мне сложную задачу');

// Настроить автоотправку
iframe.contentWindow.WebRecorder.setAutosend(true); // Отправлять при изменении SR_Prompt
iframe.contentWindow.WebRecorder.setAutosend(false); // Только по кнопке/команде
```

### Технические настройки
```javascript
// Изменить endpoint для SCORM Cloud
iframe.contentWindow.WebRecorder.setEndpoint('https://мой-сайт.netlify.app/.netlify/functions/generate');

// Настроить формат аудио
iframe.contentWindow.WebRecorder.setAudioFormat('webm'); // Рекомендуется
iframe.contentWindow.WebRecorder.setAudioFormat('oggopus'); // Альтернатива

// Включить отладку
iframe.contentWindow.WebRecorder.debug(true); // Логи в консоли
iframe.contentWindow.WebRecorder.debug(false); // Отключить логи
```

### Режимы работы
```javascript
// Только текстовое общение
iframe.contentWindow.WebRecorder.setMode('text');

// Только голосовое общение
iframe.contentWindow.WebRecorder.setMode('voice');

// Универсальный режим (рекомендуется)
iframe.contentWindow.WebRecorder.setMode('mixed');
```

## Отладка и события

### Мониторинг событий
**Когда использовать:** Для отладки и создания индикаторов прогресса

```javascript
// Слушатель всех событий от WebRecorder
window.addEventListener('message', function(e) {
  var data = e.data || {};
  if (!data.type || !data.type.startsWith('SR_')) return;
  
  switch(data.type) {
    case 'SR_ready':
      console.log('✅ WebRecorder готов к работе');
      break;
      
    case 'SR_status':
      console.log('📊 Статус:', data.payload);
      // Можно обновить индикатор прогресса
      updateProgressIndicator(data.payload);
      break;
      
    case 'SR_response':
      console.log('🤖 Ответ ИИ:', data.payload);
      // Ответ уже записан в SR_Response
      break;
      
    case 'SR_transcription':
      console.log('🎤 Транскрипт:', data.payload);
      // Показать пользователю, что "услышал" ИИ
      break;
  }
});
```

### Функции отладки
```javascript
// Включить подробные логи
function enableDebugMode() {
  iframe.contentWindow.WebRecorder.debug(true);
  console.log('🔍 Режим отладки включен');
}

// Проверить состояние API
function checkAPIStatus() {
  var iframe = document.querySelector('iframe[src*="same-origin_API"]');
  if (!iframe) {
    console.error('❌ Iframe не найден');
    return false;
  }
  
  if (!iframe.contentWindow.WebRecorder) {
    console.error('❌ WebRecorder не загружен');
    return false;
  }
  
  console.log('✅ API готов к работе');
  return true;
}

// Показать текущие настройки
function showCurrentSettings() {
  var player = GetPlayer();
  console.log('📋 Текущие настройки:');
  console.log('SR_Prompt:', player.GetVar('SR_Prompt'));
  console.log('SR_SessionId:', player.GetVar('SR_SessionId'));
  console.log('SR_AutoSend:', player.GetVar('SR_AutoSend'));
  console.log('SR_Mode:', player.GetVar('SR_Mode'));
}
```

## Готовые сценарии

### Универсальный помощник
```javascript
// Функция для быстрого доступа к API
function getWebRecorder() {
  var iframe = Array.from(document.getElementsByTagName('iframe')).find(function(f){
    try { return (f.src||'').indexOf('same-origin_API') !== -1; } catch(e){ return false; }
  });
  return iframe && iframe.contentWindow && iframe.contentWindow.WebRecorder;
}

// Быстрая отправка текста
function askAI(question) {
  var WR = getWebRecorder();
  if (!WR) return false;
  
  WR.setPrompt(question);
  WR.setMode('text');
  return WR.send();
}

// Начать голосовой диалог
function startVoiceChat() {
  var WR = getWebRecorder();
  if (!WR) return false;
  
  WR.setMode('voice');
  return WR.startRecording();
}
```

### Обучающий ассистент
```javascript
// Настройка ИИ как преподавателя
function setupTeacherAI(subject) {
  var WR = getWebRecorder();
  if (!WR) return;
  
  WR.newSessionId('урок-' + subject);
  WR.setSystem(`Ты — опытный преподаватель ${subject}. 
    Объясняй сложные темы простым языком, 
    приводи примеры и проверяй понимание.`);
  WR.setAutosend(true);
}

// Проверка знаний
function startQuiz(topic) {
  var WR = getWebRecorder();
  WR.setPrompt(`Задай мне 3 вопроса по теме "${topic}" для проверки знаний`);
  WR.send();
}

// Объяснение ошибки
function explainMistake(userAnswer, correctAnswer) {
  var WR = getWebRecorder();
  WR.setPrompt(`Мой ответ: "${userAnswer}". Правильный ответ: "${correctAnswer}". Объясни мою ошибку.`);
  WR.send();
}
```

### Интерактивный диалог
```javascript
// Начало диалога
function startConversation(character) {
  var WR = getWebRecorder();
  WR.newSessionId('диалог-' + character);
  WR.setSystem(`Ты играешь роль ${character}. Веди диалог в характере.`);
  WR.setPrompt('Привет! Давай поговорим.');
  WR.send();
}

// Продолжение диалога (автоматически)
function enableAutoChat() {
  var WR = getWebRecorder();
  WR.setAutosend(true);
  // Теперь достаточно менять SR_Prompt
}

// Завершение диалога
function endConversation() {
  var WR = getWebRecorder();
  WR.setPrompt('Спасибо за интересный разговор! Попрощайся.');
  WR.endSession();
  WR.send();
}
```

## 📝 Важные примечания

### Ограничения браузеров
- **Запись голоса** требует пользовательского жеста (клик кнопки)
- **Автовоспроизведение** аудио может быть заблокировано
- **Same-origin** обязателен для чтения переменных Storyline

### Особенности ИИ-провайдеров
- **Провайдер** выбирается на бэкенде через `AI_PROVIDER`
- **Параметры модели** (temperature, maxTokens) работают только с Yandex GPT
- **Транскрипция** доступна не у всех провайдеров

### Производительность
- **Автоотправка** имеет дебаунс 300мс для предотвращения спама
- **Сессии** сохраняются в Netlify Blobs (ограничение ~1MB на сессию)
- **Большие аудиофайлы** могут увеличить время обработки

### Безопасность
- **API ключи** хранятся только на бэкенде
- **CORS** настроен для работы с любыми доменами
- **Логи отладки** могут содержать чувствительную информацию
