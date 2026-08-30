# 04 — API Specification

**Project:** CollabBoard
**Status:** Draft v1.0

Defines the contract between client and server: the REST API (request/response work) and the Socket.IO event protocol (live updates). Building to this contract first means the front-end and back-end can be developed against a shared, stable interface.

---

## 1. Conventions

- **Base URL:** `/api/v1`
- **Auth:** `Authorization: Bearer <JWT>` header on all protected REST routes.
- **Content type:** `application/json`.
- **Success envelope:**
  ```json
  { "data": { /* ... */ } }
  ```
- **Error envelope:**
  ```json
  { "error": { "code": "FORBIDDEN", "message": "Members cannot delete boards." } }
  ```

### Status codes
| Code | Meaning |
|---|---|
| 200 | OK |
| 201 | Created |
| 400 | Validation error |
| 401 | Missing/invalid token |
| 403 | Authenticated but not permitted (role) |
| 404 | Not found / not a member |
| 409 | Conflict (e.g. email already registered) |
| 500 | Server error |

> Note: requesting a board you're not a member of returns **404**, not 403 — we don't reveal that a board exists to non-members.

> Current implementation note: board update/delete are owner-only. List and card mutations currently require board membership, but full owner/admin/member role enforcement is still a Sprint 5 follow-up.

---

## 2. REST endpoints

### 2.1 Auth

| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| POST | `/auth/register` | – | `{ name, email, password }` | `201 { user, token }` |
| POST | `/auth/login` | – | `{ email, password }` | `200 { user, token }` |
| GET | `/auth/me` | ✅ | – | `200 { user }` |

`user` never includes `passwordHash`.

### 2.2 Boards

| Method | Path | Min role | Body | Returns |
|---|---|---|---|---|
| GET | `/boards` | member | – | `200 { boards: [...] }` (boards I belong to) |
| POST | `/boards` | any auth | `{ name, emoji?, color? }` | `201 { board }` (creator becomes owner) |
| GET | `/boards/:boardId` | member | – | `200 { board, lists, cards }` (full initial load) |
| PATCH | `/boards/:boardId` | owner | `{ name?, emoji?, color? }` | `200 { board }` |
| DELETE | `/boards/:boardId` | owner | – | `200 { deleted: true }` |

### 2.3 Members

| Method | Path | Min role | Body | Returns |
|---|---|---|---|---|
| POST | `/boards/:boardId/members` | admin | `{ email, role }` | `200 { board }` |
| PATCH | `/boards/:boardId/members/:userId` | owner | `{ role }` | `200 { board }` |
| DELETE | `/boards/:boardId/members/:userId` | admin | – | `200 { board }` |

### 2.4 Lists

| Method | Path | Min role | Body | Returns |
|---|---|---|---|---|
| POST | `/boards/:boardId/lists` | member | `{ title, position }` | `201 { list }` |
| PATCH | `/boards/:boardId/lists/:listId` | member | `{ title?, position? }` | `200 { list }` |
| DELETE | `/boards/:boardId/lists/:listId` | member | – | `200 { deleted: true }` |

### 2.5 Cards

| Method | Path | Min role | Body | Returns |
|---|---|---|---|---|
| POST | `/boards/:boardId/cards` | member | `{ listId, title, position }` | `201 { card }` |
| PATCH | `/boards/:boardId/cards/:cardId` | member | `{ title?, description?, list?, position? }` | `200 { card }` |
| DELETE | `/boards/:boardId/cards/:cardId` | member | – | `200 { deleted: true }` |

> Card **move** = a `PATCH` changing `listId` and/or `position`. The same operation is also available over sockets (below) for low-latency drags; both paths run the same service function.

---

## 3. Socket.IO protocol

### 3.1 Connection & auth
Client connects with the JWT in the handshake:
```js
io(SERVER_URL, { auth: { token } });
```
Server middleware verifies the token on `connection`; invalid tokens are rejected before any events are processed.

### 3.2 Rooms
A client joins one room per open board: `board:<boardId>`. Membership + role are verified on join.

### 3.3 Client → Server events
Each emits with an **ack callback** so the client knows the result.

All mutation acks use this envelope:

```json
{ "ok": true, "data": { } }
```

Errors use:

```json
{ "ok": false, "error": { "code": "VALIDATION", "message": "..." } }
```

| Event | Payload | Server action | Ack data |
|---|---|---|---|
| `board:join` | `{ boardId }` | verify membership → join room | `{ boardId, presence }` |
| `card:create` | `{ boardId, listId, title, position }` | verify membership, persist, broadcast | `{ card }` |
| `card:move` | `{ boardId, cardId, list, position }` | verify membership, persist, broadcast | `{ card }` |
| `card:update` | `{ boardId, cardId, updates }` | verify membership, persist, broadcast | `{ card }` |
| `card:delete` | `{ boardId, cardId }` | verify membership, persist, broadcast | `{ deleted: true }` |
| `list:create` | `{ boardId, title, position }` | verify membership, persist, broadcast | `{ list }` |
| `list:move` | `{ boardId, listId, position }` | verify membership, persist, broadcast | `{ list }` |
| `list:update` | `{ boardId, listId, updates }` | verify membership, persist, broadcast | `{ list }` |
| `list:delete` | `{ boardId, listId }` | verify membership, persist, broadcast | `{ deleted: true }` |

### 3.4 Server → Client events (broadcast to the board room, excluding sender)

| Event | Payload | Meaning |
|---|---|---|
| `card:created` | `{ boardId, card }` | a card was added |
| `card:moved` | `{ boardId, card }` | a card moved |
| `card:updated` | `{ boardId, card }` | a card's fields changed |
| `card:deleted` | `{ boardId, cardId }` | a card was removed |
| `list:created` | `{ boardId, list }` | a list was added |
| `list:moved` | `{ boardId, list }` | a list moved |
| `list:updated` | `{ boardId, list }` | a list changed |
| `list:deleted` | `{ boardId, listId }` | a list was removed |
| `presence:update` | `{ boardId, users: [{ user, socketCount, lastSeen }] }` | who is currently on the board |
| `board:error` | `{ code, message }` | a server-side problem with a prior event sent without ack |

### 3.5 Ordering of guarantees
- Server **persists before broadcasting** (system-design §3).
- Broadcasts exclude the originating socket (it already applied the change optimistically).
- On any failure, the server NACKs the sender via ack and broadcasts nothing.

---

## 4. Example: a card move end-to-end

1. User drags card → client updates UI optimistically.
2. Client emits `card:move { boardId, cardId, list, position }` with ack.
3. Server verifies JWT, board membership, role; computes/accepts the fractional `position`; updates the card document.
4. Server acks `{ ok: true }` to sender → sender keeps the change.
5. Server broadcasts `card:moved` to the rest of `board:<boardId>` → their UIs update.
6. If step 3 fails, server acks `{ ok: false, error }` → sender rolls back; no broadcast.
