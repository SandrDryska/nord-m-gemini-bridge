# Storyline Bridge AI

Интеграция искусственного интеллекта в курсы Articulate Storyline. Добавляет текстовый и голосовой диалог с ИИ в интерактивные курсы.

## Возможности

- Текстовый и голосовой диалог
- Память разговора (контекст сессии)
- Ролевые сценарии (система промптов)
- Три ИИ-провайдера: Gemini, OpenAI, Yandex
- REST API через Netlify Functions

## Структура проекта

```
nord-m-gemini-bridge/
├── netlify/
│   ├── functions/
│   │   ├── generate.js          (основной обработчик запросов)
│   │   └── providers/           (интеграция с ИИ)
│   │       ├── gemini.js
│   │       ├── openai.js
│   │       └── yandex.js
├── for LMS/
│   └── same-origin_API/
│       ├── index.html           (веб-компонент для Storyline)
│       ├── recorder-bridge.js   (JS API)
│       └── test.html            (тестирование)
├── netlify.toml
└── package.json
```

## Использование в Storyline

### 1. Добавьте веб-объект на слайд

Web Object с путем:
```
for LMS/same-origin_API/index.html
```

Веб-объект всегда локальный, так как публикуется вместе с курсом. API запросы идут на Netlify Functions автоматически.

### 2. Создайте переменные

- `SR_Prompt` - вопрос/ввод пользователя
- `SR_System` - инструкция для ИИ (роль, контекст)
- `SR_SessionId` - ID сессии (для сохранения истории)
- `SL_Response` - ответ ИИ

### 3. Используйте API в триггерах

API WebRecorder доступен через iframe:

```
WR.setPrompt(text)        - установить вопрос
WR.setSystem(text)        - установить системный промпт
WR.setSessionId(id)       - установить сессию для истории
WR.send()                 - отправить запрос
WR.setMode('text'|'voice'|'mixed')  - выбрать режим
```

События: `SR_response`, `SR_transcription`, `SR_status`

## Развертывание

### Локально

```bash
npm install
netlify dev
```

### На Netlify

1. Подключите репозиторий на Netlify
2. Установите переменные окружения (Settings -> Environment):

```
AI_PROVIDER=gemini          (gemini | openai | yandex)
GEMINI_API_KEY=...
OPENAI_API_KEY=...
YANDEX_API_KEY=...
YANDEX_FOLDER_ID=...
NETLIFY_SITE_ID=...
NETLIFY_BLOBS_TOKEN=...
```

3. Деплой автоматический при push

## Конфигурация

### Выбор ИИ провайдера

Переменная окружения `AI_PROVIDER`:
- `gemini` (по умолчанию)
- `openai`
- `yandex`

### Параметры сессии

В `netlify/functions/generate.js`:
- `SESSION_TTL_MINUTES` - время жизни сессии (мин)
- `MAX_MESSAGES_IN_SESSION` - макс. сообщений в истории

## API endpoint

POST `/.netlify/functions/generate`

Content-Type: `application/json` или `multipart/form-data`

Параметры:
- `prompt` - текст запроса (обязателен)
- `system` - системный промпт
- `sessionId` - ID сессии для истории
- `audio` - аудиофайл (для голосового ввода)
- `endSession` - завершить сессию
- `resetContext` - очистить историю

## Документация

- `for LMS/SESSION_GUIDE.md` - подробное руководство WebRecorder
- `for LMS/same-origin_API/USAGE_SCENARIOS_RU.md` - примеры сценариев
- `for LMS/same-origin_API/test.html` - тестирование функций

## Отладка

Включить логирование:
```
WR.debug(true)
```

Посмотреть сообщения в консоли браузера (F12).
