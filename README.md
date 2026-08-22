# Iron Era Online v0.9 — Full Website Fixed

## Structure
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

## Fixed in v0.9
- Full-site structure kept exactly as requested.
- Game room sends a world snapshot before country selection, so the map is not blank.
- Player is NOT inserted into the match until a country is explicitly chosen.
- Nickname and country are both mandatory and checked on the server.
- Occupied countries are blocked.
- Reconnect/rejoin preserves the player session.
- WebSocket heartbeat and automatic reconnect.
- Auth button disappears on the landing page when already logged in.
- Lobby, profile and game use separate JS/CSS modules.
- Tabs use explicit data-tab keys instead of depending on translated button text.
- Units are rendered from the actual country state.
- National events have choices and server-side effects.
- AI countries continue production/research/wars.
- PostgreSQL is used when `DATABASE_URL` is provided.

## Render
Build: `npm install`
Start: `npm start`
Runtime: Node

Optional PostgreSQL: set `DATABASE_URL` in Render Environment.

VPN note: there is no IP/VPN/country block. HTTPS/WSS works through Render's reverse proxy; the server uses no IP-based login rules.
