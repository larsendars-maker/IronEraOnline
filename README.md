# Iron Era Online v0.4 — HOI2-inspired web prototype

Новый прототип: политическая карта с провинциями, игроками, никнеймами, онлайн-счётчиком, real-time WebSocket, чатом и серверным ИИ.

## Структура
- server.js — authoritative game server
- public/index.html — интерфейс
- public/style.css — визуальный стиль
- public/app.js — клиент
- package.json — зависимости
- render.yaml — Render Blueprint

## Render
Web Service:
- Runtime: Node
- Build: `npm install`
- Start: `npm start`
- Free для тестирования

Render официально поддерживает входящие WebSocket-соединения для Web Services. Для публичного HTTPS клиента используется `wss://`.

## Важно
Состояние мира сейчас хранится в памяти одного Node.js процесса. Это специально для первого онлайн-прототипа. Для постоянных партий и масштабирования следующим шагом нужна PostgreSQL/Redis синхронизация.
