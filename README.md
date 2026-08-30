# CollabBoard

CollabBoard is a real-time project management board for planning and shipping work with a focused Jira-style workflow.

The app currently supports:

- email/password authentication with JWT
- project boards with visual identity
- list and card creation
- drag-and-drop card and list ordering
- card detail editing with descriptions
- list/card rename and delete
- board rename and delete
- Socket.IO-powered board rooms
- realtime card/list sync between collaborators
- presence indicators for who is viewing a board

---

## Tech Stack

| Layer | Choice |
|---|---|
| Client | React, Vite, Tailwind CSS |
| Drag and drop | dnd-kit |
| Realtime | Socket.IO |
| Server | Node.js, Express |
| Database | MongoDB, Mongoose |
| Auth | JWT |

---

## Project Structure

```text
client/
  src/
    components/      shared UI components
    context/         auth and theme providers
    hooks/           client hooks, including useSocket
    lib/             API client, board color helpers, positioning helpers
    pages/           route-level screens

server/
  src/
    config/          database setup
    controllers/     REST route handlers
    middleware/      auth middleware
    models/          Mongoose models
    routes/          Express routers
    services/        shared mutation logic for REST and sockets
    socket.js        Socket.IO auth, board rooms, presence, events

docs/
  01-PRD.md
  02-system-design.md
  03-data-model.md
  04-api-spec.md
  05-sprint-plan.md
  06-realtime-architecture.md
```

---

## Local Development

Install dependencies separately for the server and client:

```bash
cd server
npm install
npm run dev
```

```bash
cd client
npm install
npm run dev
```

Default local URLs:

| App | URL |
|---|---|
| Client | `http://localhost:5173` |
| Server | `http://localhost:5050` |

---

## Environment Variables

Server:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `5050` | HTTP and Socket.IO server port |
| `MONGO_URI` | none | MongoDB connection string |
| `JWT_SECRET` | none | JWT signing and verification secret |
| `CLIENT_ORIGIN` | `http://localhost:5173,http://127.0.0.1:5173` | comma-separated list of allowed client origins |

Client:

| Variable | Default | Purpose |
|---|---|---|
| `VITE_SOCKET_URL` | `http://localhost:5050` | Socket.IO server URL |

The REST API URL is currently hardcoded in `client/src/lib/api.js`; before deployment, move it to a `VITE_API_URL` variable.

---

## Realtime Model

Realtime writes use Socket.IO when connected and fall back to REST when disconnected.

The server follows this rule for every card/list mutation:

1. Verify the socket JWT.
2. Verify membership for the board room.
3. Persist the change through `server/src/services/boardMutationService.js`.
4. Ack the sender with the saved document.
5. Broadcast the saved document to other sockets in `board:<boardId>`.

Read [docs/06-realtime-architecture.md](docs/06-realtime-architecture.md) before changing socket events.

---

## Verification

```bash
cd client
npm run build
npm run lint
```

Known lint status: `npm run lint` currently reports Fast Refresh warnings in `AuthContext.jsx` and `ThemeContext.jsx` because those files export both providers and hooks. Production builds pass.
