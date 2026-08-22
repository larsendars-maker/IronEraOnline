# Iron Era Online v0.7 — Full Website

Это уже не один HTML-экран: проект состоит из серверного приложения, WebSocket, лобби, авторизации, комнат, игрового клиента и профиля.

## Страницы
- `/` — главная сайта
- `/lobby` — мультиплеерное лобби
- `/game?room=ROOM_ID` — игра комнаты
- `/profile` — профиль и история кампаний

## Онлайн
Node.js + Express + WebSocket. Сервер хранит комнаты и игровой мир, рассылает состояние игрокам и запускает ИИ/тики на сервере.

## База
При наличии `DATABASE_URL` используется PostgreSQL:
- `ie_users` — аккаунты
- `ie_rooms` — сохранённые комнаты

Без `DATABASE_URL` сайт запускается в памяти, но комнаты будут сброшены при перезапуске.

## Render
Runtime: Node
Build Command: `npm install`
Start Command: `npm start`

Папка сайта:
```text
package.json
server.js
render.yaml
public/
  index.html
  css/site.css
  css/game.css
  js/site.js
  js/lobby.js
  js/game.js
  js/profile.js
  pages/lobby.html
  pages/game.html
  pages/profile.html
```

## Игровой цикл
Авторизация → лобби → создание/вход в комнату → выбор свободной страны → готовность → старт → карта/армии/производство/технологии/дипломатия → события/ИИ → сохранение.
