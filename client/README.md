# CollabBoard Client

React + Vite front end for CollabBoard.

The client is responsible for:

- authentication screens
- landing page and dashboard
- kanban board UI
- card search, tag filtering, and status filtering
- card assignee and due date editing
- global and board-specific activity pages
- recent activity panel
- drag-and-drop with dnd-kit
- Socket.IO connection lifecycle
- applying incoming realtime board events

---

## Local Development

```bash
npm install
npm run dev
```

The Vite app usually runs on:

```text
http://localhost:5173
```

If another process is already using that port, Vite may choose another one. Make sure the server `CLIENT_ORIGIN` env var includes the browser origin you use.

---

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_URL` | `http://localhost:5050/api/v1` | REST API base URL |
| `VITE_SOCKET_URL` | `http://localhost:5050` | URL for the Socket.IO server |

Create a local env file from the example:

```bash
cp .env.example .env
```

Vite reads these values at build time, so production env changes require a fresh deploy.

---

## Realtime Client Flow

`src/hooks/useSocket.js` owns the Socket.IO client instance.

It provides:

- `connected` - whether the socket is currently connected
- `connectionError` - last connection failure message
- `emitWithAck(eventName, payload)` - Promise wrapper around Socket.IO ack callbacks
- `onSocketEvent(eventName, handler)` - subscribe/unsubscribe helper

`src/pages/BoardPage.jsx` uses the hook to:

1. connect with the JWT from auth context
2. join `board:<boardId>` through `board:join`
3. show presence in the board header
4. emit card/list mutations when connected
5. fall back to REST when disconnected
6. re-fetch the full board after reconnect
7. apply incoming events from other collaborators
8. append realtime activity events to the board timeline

See `../docs/06-realtime-architecture.md` for the server-side contract.

---

## Build and Lint

```bash
npm run build
npm run lint
```

Both commands should pass before deployment.
