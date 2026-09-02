# SDLCFlow Client

React + Vite front end for SDLCFlow.

The client is responsible for:

- authentication screens
- landing page and dashboard
- identity-only project creation
- kanban board UI
- card search, tag filtering, and status filtering
- card comment threads
- board chat drawer with realtime messages, typing indicators, delivery retry, unread counts, moderation, and keyboard send
- card assignee and due date editing
- global and board-specific activity pages
- user profile editing, password changes, and account deletion
- app-wide toast notifications
- reusable in-app confirmation dialogs for destructive actions
- recent activity panel
- drag-and-drop with dnd-kit
- Socket.IO connection lifecycle
- applying incoming realtime board events
- applying incoming realtime chat messages

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
9. load and append board chat messages
10. show socket-only typing indicators for other board members
11. keep local delivery state for pending and failed chat sends
12. reset unread chat counts when the drawer opens

See `../docs/06-realtime-architecture.md` for the server-side contract.

---

## Workflow Templates

`src/components/NewBoardModal.jsx` keeps project creation focused on project
identity: name, icon, and color. New projects start with the default `General`
workflow and no starter cards, which keeps the model clear: project container
first, workflow templates inside the project.

`src/pages/BoardPage.jsx` renders project workflows as a horizontal switcher
above the board. The board keeps the full list/card snapshot in state, then
derives the active workflow's visible lists and cards for filters, drag/drop,
card details, and new list/card creation. This keeps realtime events simple
while letting the UI focus one project area at a time.

Owners and admins can add another workflow from the same template catalog while
viewing a board. The client calls `POST /boards/:boardId/workflows`, merges the
returned workflow/lists/cards into local state, and selects the new workflow
immediately. The server also broadcasts `workflow:created` to joined
collaborators; the board page merges that payload by id so duplicate REST and
socket updates stay harmless.

---

## Confirmation Dialogs

`src/components/ConfirmDialog.jsx` is the shared alert dialog for destructive
actions. Use it instead of `window.confirm` so delete and removal flows keep the
same styling, dark mode support, Escape behavior, and pending state.

Current usages include chat message deletion, clear chat, workflow list deletion,
board deletion, card deletion, and member removal.

---

## Build and Lint

```bash
npm run build
npm run lint
```

Both commands should pass before deployment.
