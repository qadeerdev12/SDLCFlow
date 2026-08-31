# 04 — API Specification

**Project:** SDLCFlow
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

> Current implementation note: REST and Socket.IO mutations enforce board roles. Member management and board activity endpoints are implemented.

---

## 2. REST endpoints

### 2.1 Auth

| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| POST | `/auth/register` | – | `{ name, email, password }` | `201 { user, token }` |
| POST | `/auth/login` | – | `{ email, password }` | `200 { user, token }` |
| GET | `/auth/me` | ✅ | – | `200 { user }` |
| GET | `/auth/profile` | ✅ | – | `200 { user, stats }` |
| PATCH | `/auth/profile` | ✅ | `{ name?, email? }` | `200 { user }` |
| PATCH | `/auth/password` | ✅ | `{ currentPassword, newPassword }` | `200 { updated: true }` |
| DELETE | `/auth/me` | ✅ | `{ password }` | `200 { deleted: true }` |

`user` never includes `passwordHash`.
Profile email updates reject duplicate emails with `409 EMAIL_TAKEN`. Password updates require the current password and a new password of at least 8 characters.
Deleting an account removes owned boards and their lists/cards/comments/activity, removes the user from shared boards, clears their card assignments, and deletes their comments/activity records.

### 2.2 Board templates

| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| GET | `/board-templates` | ✅ | – | `200 { templates }` |

Templates are read-only starter blueprints for new boards. Each template includes
display metadata plus list names and starter card previews. Creating a board
from a template is handled by `POST /boards` in the next implementation step.

### 2.3 Boards

| Method | Path | Min role | Body | Returns |
|---|---|---|---|---|
| GET | `/boards` | member | – | `200 { boards: [...] }` (boards I belong to) |
| POST | `/boards` | any auth | `{ name, emoji?, color?, templateId? }` | `201 { board, lists, cards }` (creator becomes owner) |
| GET | `/boards/:boardId` | member | – | `200 { board, lists, cards }` (full initial load) |
| PATCH | `/boards/:boardId` | admin | `{ name?, emoji?, color? }` | `200 { board, activity }` |
| DELETE | `/boards/:boardId` | owner | – | `200 { deleted: true }` |

If `templateId` is omitted, `POST /boards` creates an empty board and returns
empty `lists` and `cards` arrays. If `templateId` matches a catalog template,
the server creates the board plus starter lists/cards in one request. Template
icon/color become defaults unless the request provides explicit `emoji` or
`color` values.

### 2.4 Members

| Method | Path | Min role | Body | Returns |
|---|---|---|---|---|
| GET | `/boards/:boardId/members` | member | – | `200 { members }` |
| POST | `/boards/:boardId/members` | admin | `{ email, role? }` | `201 { members, activity }` |
| PATCH | `/boards/:boardId/members/:userId` | owner | `{ role }` | `200 { members, activity }` |
| DELETE | `/boards/:boardId/members/:userId` | admin | – | `200 { members, activity }` |

Member rules:
- Owners and admins can add members.
- Admins can only add regular members; owners can add members or admins.
- Only owners can change roles.
- Ownership transfer is not available yet.
- Admins cannot remove owners.
- A board must keep at least one owner.

### 2.5 Activity

| Method | Path | Min role | Body | Returns |
|---|---|---|---|---|
| GET | `/boards/:boardId/activities` | member | – | `200 { activities }` |

Activity records store `actor`, `action`, `targetType`, `targetId`, `targetTitle`, optional `metadata`, and timestamps. The endpoint returns the latest board activity first.

### 2.6 Board chat

| Method | Path | Min role | Body | Returns |
|---|---|---|---|---|
| GET | `/boards/:boardId/messages` | member | – | `200 { messages }` |
| POST | `/boards/:boardId/messages` | member | `{ body }` | `201 { message }` |
| DELETE | `/boards/:boardId/messages/:messageId` | member/owner/admin | – | `200 { message, activity }` |
| DELETE | `/boards/:boardId/messages` | owner | – | `200 { deletedCount, activity }` |

Messages are scoped to a board and populated with `sender { name, email }`.
Members, admins, and owners can delete only messages they sent. Deleted messages
remain as placeholders with `deletedAt/deletedBy`, so open clients keep a stable
conversation shape. Owners can clear the full board chat; cleared messages are
hidden from future history loads. Normal chat is stored separately from activity
so conversation does not flood the audit timeline, but moderation actions create
activity records.

### 2.7 Lists

| Method | Path | Min role | Body | Returns |
|---|---|---|---|---|
| POST | `/boards/:boardId/lists` | member | `{ title, position }` | `201 { list, activity }` |
| PATCH | `/boards/:boardId/lists/:listId` | member | `{ title?, position? }` | `200 { list, activity }` |
| DELETE | `/boards/:boardId/lists/:listId` | member | – | `200 { deleted: true, activity }` |

### 2.8 Cards

| Method | Path | Min role | Body | Returns |
|---|---|---|---|---|
| POST | `/boards/:boardId/cards` | member | `{ listId, title, position, tag?, status?, assignee?, dueDate? }` | `201 { card, activity }` |
| PATCH | `/boards/:boardId/cards/:cardId` | member | `{ title?, description?, tag?, status?, assignee?, dueDate?, list?, position? }` | `200 { card, activity }` |
| DELETE | `/boards/:boardId/cards/:cardId` | member | – | `200 { deleted: true, activity }` |

> Card **move** = a `PATCH` changing `listId` and/or `position`. The same operation is also available over sockets (below) for low-latency drags; both paths run the same service function.
> `assignee` must be `null`, empty, or a user id that already belongs to the board. `dueDate` accepts an ISO date/date-time string or `null`.

### 2.9 Comments

| Method | Path | Min role | Body | Returns |
|---|---|---|---|---|
| GET | `/boards/:boardId/cards/:cardId/comments` | member | – | `200 { comments }` |
| POST | `/boards/:boardId/cards/:cardId/comments` | member | `{ body }` | `201 { comment, activity }` |

Comments are scoped by both board and card. The server verifies board membership first, then verifies the card belongs to that board before reading or writing comments.

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
| `card:create` | `{ boardId, listId, title, position, tag?, status?, assignee?, dueDate? }` | verify membership, persist, broadcast | `{ card, activity }` |
| `card:move` | `{ boardId, cardId, list, position }` | verify membership, persist, broadcast | `{ card, activity }` |
| `card:update` | `{ boardId, cardId, updates }` | verify membership, persist, broadcast | `{ card, activity }` |
| `card:delete` | `{ boardId, cardId }` | verify membership, persist, broadcast | `{ deleted: true, activity }` |
| `comment:create` | `{ boardId, cardId, body }` | verify membership, persist, broadcast | `{ comment, activity }` |
| `message:create` | `{ boardId, body }` | verify membership, persist, broadcast | `{ message }` |
| `chat:typing` | `{ boardId, typing }` | verify membership, broadcast ephemeral status | `{ typing }` |
| `message:delete` | `{ boardId, messageId }` | verify role/ownership, soft-delete, broadcast | `{ message, activity }` |
| `chat:clear` | `{ boardId }` | verify owner, clear visible history, broadcast | `{ deletedCount, activity }` |
| `list:create` | `{ boardId, title, position }` | verify membership, persist, broadcast | `{ list, activity }` |
| `list:move` | `{ boardId, listId, position }` | verify membership, persist, broadcast | `{ list, activity }` |
| `list:update` | `{ boardId, listId, updates }` | verify membership, persist, broadcast | `{ list, activity }` |
| `list:delete` | `{ boardId, listId }` | verify membership, persist, broadcast | `{ deleted: true, activity }` |

### 3.4 Server → Client events (broadcast to the board room, excluding sender)

| Event | Payload | Meaning |
|---|---|---|
| `card:created` | `{ boardId, card }` | a card was added |
| `card:moved` | `{ boardId, card }` | a card moved |
| `card:updated` | `{ boardId, card }` | a card's fields changed |
| `card:deleted` | `{ boardId, cardId }` | a card was removed |
| `comment:created` | `{ boardId, cardId, comment }` | a card comment was added |
| `message:created` | `{ boardId, message }` | a board chat message was added |
| `chat:typing` | `{ boardId, user, typing }` | a board member started or stopped typing |
| `message:deleted` | `{ boardId, message }` | a board chat message was deleted |
| `chat:cleared` | `{ boardId, deletedCount }` | visible board chat history was cleared |
| `list:created` | `{ boardId, list }` | a list was added |
| `list:moved` | `{ boardId, list }` | a list moved |
| `list:updated` | `{ boardId, list }` | a list changed |
| `list:deleted` | `{ boardId, listId }` | a list was removed |
| `members:updated` | `{ boardId, members }` | board membership changed |
| `activity:created` | `{ boardId, activity }` | a board activity record was added |
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
