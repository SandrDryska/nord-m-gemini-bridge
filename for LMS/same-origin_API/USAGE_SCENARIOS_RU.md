# Руководство по использованию в Articulate Storyline (Same‑Origin)

Этот файл содержит пошаговые инструкции для трёх типовых сценариев работы с веб‑объектом `same-origin_API/index.html` и API `window.WebRecorder`.

Вся логика выполняется в триггерах Storyline «Execute JavaScript». Предполагается, что веб‑объект загружается с того же домена (same‑origin), чтобы был доступ к `parent.GetPlayer()`.

— — —

## Предварительные шаги (общие для всех сценариев)

- Добавьте на слайд Web Object, указывающий на `same-origin_API/index.html`.
- Создайте при необходимости переменные Storyline для приёма результатов (опционально):
  - `SL_Response` (Text) — для текстового ответа модели
  - `SL_Transcript` (Text) — для текста распознавания аудио (если провайдер возвращает транскрипт)
  - `SL_Status` (Text) — для статуса/отладки
- На событие «When timeline starts» добавьте триггер «Execute JavaScript» и вставьте:

```javascript
(function(){
  function SR_getIframe(){
    return Array.from(document.getElementsByTagName('iframe')).find(function(f){
      try { return (f.src||'').indexOf('same-origin_API') !== -1; } catch(e){ return false; }
    });
  }
  var iframe = SR_getIframe();
  if (!iframe || !iframe.contentWindow || !iframe.contentWindow.WebRecorder) return;

  var WR = iframe.contentWindow.WebRecorder;
  WR.init({ autosync: true, mode: 'mixed' }); // mixed: если есть запись — отправится аудио, иначе текст
  WR.debug(false); // при необходимости включите true для подробных логов

  // Подписка на события от веб‑объекта и запись в переменные Storyline (если созданы)
  window.addEventListener('message', function(e){
    var d = e.data || {}; if (!d.type) return;
    var p = window.GetPlayer && window.GetPlayer();
    if (!p || !p.SetVar) return;
    if (d.type === 'SR_response')      p.SetVar('SL_Response', String(d.payload && d.payload.message || ''));
    if (d.type === 'SR_transcription') p.SetVar('SL_Transcript', String(d.payload || ''));
    if (d.type === 'SR_status')        p.SetVar('SL_Status', String(d.payload || ''));
  });
})();
```

Примечания:
- Переменные `SR_*` (например, `SR_Prompt`, `SR_System`, `SR_SessionId`) могут устанавливаться либо напрямую из Storyline, либо через вызовы API `WebRecorder.setPrompt()/setSystem()/setSessionId()`.
- Провайдер выбирается на бэкенде переменной окружения Netlify `AI_PROVIDER`. Фронтенд‑флаг `setProvider()` носит справочный характер.

— — —

## Сценарий 1. Один запрос → один ответ (без истории)

Условия: есть `prompt` и `system`. Режим — `mixed`. История не хранится (пустой `SR_SessionId`).

Шаги:
1) Убедитесь, что `SR_SessionId` пуст (история не нужна):
```javascript
(function(){
  var p = window.GetPlayer && window.GetPlayer();
  if (p && p.SetVar) p.SetVar('SR_SessionId', '');
})();
```

2) Задайте системный промпт и пользовательский промпт:
```javascript
(function(){
  var iframe = Array.from(document.getElementsByTagName('iframe')).find(f=>{try{return (f.src||'').indexOf('same-origin_API')!==-1;}catch(e){return false;}});
  if (!iframe) return; var WR = iframe.contentWindow.WebRecorder;
  WR.setSystem('Вы — полезный ассистент. Отвечайте кратко и по делу.');
  WR.setPrompt('Объясни разницу между UI и UX простыми словами.');
})();
```

3) При необходимости запишите голос (через кнопки веб‑объекта или кодом):
```javascript
// Начать запись: WR.startRecording();  Остановить: WR.stopRecording();  Прослушать: WR.play();
```

4) Отправьте запрос:
```javascript
(function(){
  var iframe = Array.from(document.getElementsByTagName('iframe')).find(f=>{try{return (f.src||'').indexOf('same-origin_API')!==-1;}catch(e){return false;}});
  if (!iframe) return; iframe.contentWindow.WebRecorder.send();
})();
```

Результат:
- Ответ появится в консоли и в переменной `SL_Response` (если создали и подключили обработчик событий).

— — —

## Сценарий 2. Диалог с сохранением истории

Условия: есть `prompt` и `system`. Режим — `mixed`. История сохраняется в пределах одной сессии.

Шаги:
1) При запуске слайда создайте ID сессии, если его нет:
```javascript
(function(){
  function SR_getIframe(){
    return Array.from(document.getElementsByTagName('iframe')).find(function(f){
      try { return (f.src||'').indexOf('same-origin_API') !== -1; } catch(e){ return false; }
    });
  }
  var p = window.GetPlayer && window.GetPlayer();
  var sid = p && p.GetVar ? p.GetVar('SR_SessionId') : '';
  var iframe = SR_getIframe();
  if (!iframe || !iframe.contentWindow || !iframe.contentWindow.WebRecorder) return;
  if (!sid) iframe.contentWindow.WebRecorder.newSessionId('sr'); // сгенерируем и синхронизируем в SR_SessionId
})();
```

2) Задайте `system` один раз для всей сессии:
```javascript
(function(){
  var iframe = Array.from(document.getElementsByTagName('iframe')).find(f=>{try{return (f.src||'').indexOf('same-origin_API')!==-1;}catch(e){return false;}});
  if (!iframe) return; var WR = iframe.contentWindow.WebRecorder;
  WR.setSystem('Вы — дружелюбный ассистент в образовательном курсе. Поддерживайте диалог.');
})();
```

3) Каждый ход пользователя:
- Обновляйте `prompt` (и при необходимости пишите голос), затем отправляйте:
```javascript
(function(){
  var iframe = Array.from(document.getElementsByTagName('iframe')).find(f=>{try{return (f.src||'').indexOf('same-origin_API')!==-1;}catch(e){return false;}});
  if (!iframe) return; var WR = iframe.contentWindow.WebRecorder;
  WR.setPrompt('Мой следующий вопрос: чем отличается API от SDK?');
  // При голосовом вводе добавьте WR.startRecording()/WR.stopRecording() до отправки
  WR.send();
})();
```

4) Повторяйте шаг 3 столько, сколько нужно. История будет учитываться автоматически по сохранённому `SR_SessionId`.

Дополнительно:
- Чтобы очистить контекст перед следующим запросом в рамках той же сессии: `WR.resetContext();`
- Чтобы завершить сессию при ближайшей отправке (данные будут удалены, ответ не генерируется): `WR.endSession(); WR.send();`

— — —

## Сценарий 3. Диалог с последующим анализом диалога

Условия: как в Сценарии 2 (диалог с историей). После завершения диалога — дополнительная отправка с другим `system/prompt` для анализа всей беседы.

Шаги:
1) Ведите диалог как в Сценарии 2 (создайте/держите `SR_SessionId`, задайте общий `system`, делайте ходы с `prompt` и `send`).

2) Когда диалог окончен, запустите анализ с тем же `SR_SessionId` (чтобы модель «видела» контент диалога):
```javascript
(function(){
  var iframe = Array.from(document.getElementsByTagName('iframe')).find(f=>{try{return (f.src||'').indexOf('same-origin_API')!==-1;}catch(e){return false;}});
  if (!iframe) return; var WR = iframe.contentWindow.WebRecorder;
  WR.setMode('text'); // для анализа обычно достаточно текста
  WR.setSystem('Ты — аналитик диалогов. Выполни структурированный разбор беседы.');
  WR.setPrompt('Проанализируй ход диалога: выдели цели пользователя, принятые решения, спорные моменты и рекомендации по улучшению.');
  WR.send();
})();
```

3) (Опционально) После получения ответа аналитики — завершите сессию и удалите историю:
```javascript
(function(){
  var iframe = Array.from(document.getElementsByTagName('iframe')).find(f=>{try{return (f.src||'').indexOf('same-origin_API')!==-1;}catch(e){return false;}});
  if (!iframe) return; var WR = iframe.contentWindow.WebRecorder;
  WR.endSession();
  WR.send(); // следующий запрос завершит сессию и вернёт сервисное сообщение без генерации ответа
})();
```

— — —

## Полезные советы

- Если хотите автоматизировать отправку по изменению `SR_Prompt`, включите автосенд: `WR.setAutosend(true)`.
- `SR_AudioFormat` должен соответствовать реальному контейнеру записи. Сейчас рекордер пишет `audio/webm` (WebM/Opus) — оставляйте `webm`.
- Большинство браузеров требуют пользовательского жеста перед началом записи с микрофона.
- Для надёжности проверяйте наличие `iframe.contentWindow.WebRecorder` перед вызовами.
