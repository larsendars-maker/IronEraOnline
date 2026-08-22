# Iron Era Online v1.8 — Modular Project

Теперь проект разделён на понятные зоны: серверная логика, данные, общий протокол и клиент.

## Главный принцип
- `server/` — логика сервера и игровой движок.
- `data/` — изменяемый игровой контент.
- `shared/` — общий контракт сервера и клиента.
- `public/` — интерфейс и клиент.

## Render
Build: `npm install`
Start: `npm start`

`server.js` в корне является совместимым entrypoint и импортирует `server/index.js`.

## Что уже перенесено
- страны в `data/countries`;
- технологии в `data/technologies`;
- юниты в `data/units`;
- фокус generic в `data/focuses`;
- сценарии в `data/scenarios`;
- клиентский код разделён на `core/site/lobby/game`.

Оставшийся production engine временно находится в `server/legacy/engine.js`: это намеренная миграционная прослойка, чтобы архитектурный рефакторинг не ломал текущую рабочую игру. Следующий шаг — выносить по одному модулю из legacy в `server/game/*`.
