# Iron Era Online v1.0 — Render Safe Build

Основной full-website проект:

```text
IronEraOnline/
├── package.json
├── server.js
├── render.yaml
├── README.md
└── public/
    ├── index.html
    ├── css/
    │   ├── site.css
    │   └── game.css
    ├── js/
    │   ├── site.js
    │   ├── lobby.js
    │   ├── game.js
    │   └── profile.js
    ├── pages/
    │   ├── lobby.html
    │   ├── game.html
    │   └── profile.html
    └── assets/
```

### Render
Build:
`npm install`

Start:
`npm start`

### Главное исправление этого билда
Если `DATABASE_URL` отсутствует, неверен или PostgreSQL временно недоступен, сервер НЕ падает при старте. Он автоматически запускается в memory mode.

`/health` показывает:
- `db: "online"` — PostgreSQL доступен
- `db: "memory"` — игра работает без PostgreSQL

Это важно для Render: временная ошибка базы больше не должна превращаться в `Exited with status 1 while running your code`.

После исправления `DATABASE_URL` сохранения можно включить без изменения игрового кода.


## Render v1.0.1 fix
Исправлена критическая ошибка старта:
`ReferenceError: server_path is not defined`

Причина была в случайно попавшей в `server.js` строке Python-кода.
В v1.0.1 этой строки нет.

После деплоя в Render ожидаемый запуск:
```text
npm start
> iron-era-online@1.0.1 start
> node server.js
Iron Era Online v1.0 listening on <PORT>
```

## v1.0.2
This build explicitly removes the accidental Python statement that caused:
`ReferenceError: server_path is not defined`

The deployed package should report:
`iron-era-online@1.0.2`
and `node server.js`.
