# Iron Era Online v1.8.1 — Render Fixed

Исправления этой версии:
- `server/legacy/engine.js` теперь правильно раздаёт `public/` из корня проекта;
- исправлен `ENOENT ... server/legacy/public/index.html`;
- добавлен `dbOnline` и безопасный fallback в memory mode при проблемах PostgreSQL;
- сохранены существующие комнаты/игра;
- Render entrypoint остаётся `server.js` → `server/index.js`;
- Node ограничен `>=20 <23` для более предсказуемого запуска.

Render:
- Build: `npm install`
- Start: `npm start`

После деплоя `/health` должен показывать:
```json
{"ok":true,"db":"memory"}
```
или
```json
{"ok":true,"db":"online"}
```

Основная структура:
```text
IronEraOnline/
├── package.json
├── server.js
├── render.yaml
├── README.md
├── server/
│   ├── index.js
│   ├── legacy/
│   │   └── engine.js
│   ├── config/
│   ├── api/
│   ├── websocket/
│   ├── auth/
│   ├── lobby/
│   ├── persistence/
│   ├── utils/
│   └── game/
├── shared/
├── data/
└── public/
```
