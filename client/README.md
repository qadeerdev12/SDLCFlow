# CollabBoard Client

React + Vite front end for CollabBoard.

The client is responsible for:

- authentication screens
- landing page and dashboard
- kanban board UI
- card search, tag filtering, and status filtering
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
| `VITE_SOCKET_URL` | `http://localhost:5050` | URL for the Socket.IO server |

The REST API base URL currently lives in `src/lib/api.js`:

```js
const BASE_URL = "http://localhost:5050/api/v1";
```

Before deployment, move this to a `VITE_API_URL` environment variable so the same build can point at local, staging, or production APIs.

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

See `../docs/06-realtime-architecture.md` for the server-side contract.

---

## Build and Lint

```bash
npm run build
npm run lint
```

Known lint status: the project currently has Fast Refresh warnings in the auth/theme context files because those files export both providers and hooks. This does not block production builds, but it should be cleaned up before final polish.
