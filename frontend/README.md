# 🗺️ Map App — Live Users

Real-time map showing all connected users' locations using WebSockets.

## Architecture

```
frontend (React + Leaflet) ←── WebSocket ──→ backend (Node.js + ws)
```

- **Frontend**: React + react-leaflet for the map, native WebSocket API
- **Backend**: Express + ws library, in-memory user store
- **No database needed** — all state is ephemeral (per-session)

## How it works

1. User opens the app → browser connects via WebSocket to the backend
2. Backend assigns a UUID to each connection
3. Browser requests geolocation permission → sends lat/lng via WS on every GPS update
4. Backend broadcasts each user's position to all other connected clients
5. When a user disconnects, all others are notified and the marker is removed

## Quick Start (Local Dev)

### Backend
```bash
cd backend
npm install
npm run dev      # starts on port 3001 with nodemon
```

### Frontend
```bash
cd frontend
npm install
npm start        # starts on port 3000, proxies API to 3001
```

Open http://localhost:3000 — allow location access when prompted.

## Docker (Production)

```bash
docker-compose up --build
```

Frontend → http://localhost:3000  
Backend → http://localhost:3001

## Environment Variables

### Frontend
| Variable | Default | Description |
|---|---|---|
| `REACT_APP_WS_URL` | `ws://<hostname>:3001` | WebSocket server URL |

### Backend
| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Server port |

## WebSocket Message Protocol

| Type | Direction | Payload |
|---|---|---|
| `INIT` | Server → Client | `{ userId, users[] }` — on connect |
| `UPDATE_LOCATION` | Client → Server | `{ lat, lng }` — on GPS update |
| `USER_UPDATED` | Server → All others | `{ user: { id, lat, lng } }` |
| `USER_LEFT` | Server → All others | `{ userId }` |

## Features

- ✅ Real-time location sharing via WebSocket
- ✅ Your marker (green, pulsing) vs others (red)
- ✅ Coordinate panel with live updates
- ✅ Online user count
- ✅ Dark map theme
- ✅ Auto-fly to your position on load
- ✅ Mobile responsive
- ✅ No database required
