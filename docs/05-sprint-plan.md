# 05 — Sprint Plan & SDLC

**Project:** CollabBoard
**Status:** Draft v1.0
**Cadence:** 1-week sprints, part-time (~6–10 hrs/sprint) alongside certification study

---

## 1. Methodology

A lightweight **Scrum-flavoured** process adapted for a solo developer. The point isn't ceremony for its own sake — it's to practise the rhythm employers use and to keep scope honest under limited time.

- **Sprints:** 1 week each. Short cycles force small, shippable increments.
- **Backlog:** the user stories from the PRD, broken into tasks.
- **Board:** CollabBoard tracks its own development (use Trello/GitHub Projects until CollabBoard can dogfood itself).
- **Solo ceremonies:**
  - *Planning* (15 min, start of sprint): pick the sprint goal + tasks.
  - *Review* (10 min, end): demo the increment to yourself; record a clip if it's demo-worthy.
  - *Retro* (5 min): one note on what to change next sprint.

### Definition of Ready (a task can be started)
- Maps to a PRD user story, has clear acceptance criteria, and dependencies are done.

### Definition of Done (a task is complete)
- Code works locally, handles the error path, is committed with a clear message, and the relevant doc is updated. For backend changes: authorization is enforced server-side, not just in the UI.

---

## 2. Milestone

| Milestone | When | Definition |
|---|---|---|
| **M1 — MVP core working** | End of Sprint 4 (target: end of July) | Two users see live card moves on a deployed-or-local board, with server-side RBAC. |
| **M2 — Polished & deployed** | End of Sprint 6 | Public URL, README + architecture diagram + demo GIF, stretch items as time allows. |

---

## 3. Sprint breakdown

### Sprint 0 — Setup & docs *(this sprint)*
**Goal:** repo, tooling, and design docs ready so building is friction-free.
- [ ] Initialise monorepo (`client/`, `server/`, `docs/`).
- [ ] Server: Express + Mongoose + Socket.IO skeleton; health-check route.
- [ ] Client: React + Vite + Tailwind skeleton; routing shell.
- [ ] MongoDB Atlas cluster + `.env.example` for both apps.
- [ ] Commit all five design docs (done).
- [ ] Set up the dev tracking board.
**Deliverable:** both apps boot; "hello" round-trips client → server → DB.

### Sprint 1 — Authentication (Epic A)
**Goal:** users can register, log in, and hit protected routes.
- [ ] User model + bcrypt hashing.
- [ ] `POST /auth/register`, `POST /auth/login`, `GET /auth/me`.
- [ ] JWT issue + verify middleware.
- [ ] Client: auth context, login/register pages, protected routes, token storage.
**Acceptance:** a logged-out user is redirected; a logged-in user reaches a (empty) dashboard.

### Sprint 2 — Boards, lists, cards via REST (Epics B, C — no real-time yet)
**Goal:** full CRUD and a board that renders from the REST API.
- [ ] Board, List, Card models + indexes.
- [ ] Board CRUD + membership endpoints; creator becomes owner.
- [ ] List & Card CRUD endpoints with fractional `position`.
- [ ] `GET /boards/:id` returns board + lists + cards (initial load).
- [ ] Client: board list page; board view rendering lists & cards (static).
**Acceptance:** create a board, add lists/cards, reload — data persists and renders.

### Sprint 3 — Drag & drop + card detail (Epic C continued)
**Goal:** reordering works and persists via REST.
- [ ] Integrate dnd-kit; drag cards within/between lists and reorder lists.
- [ ] Compute fractional midpoint position on drop; PATCH to server.
- [ ] Optimistic UI with rollback on failure.
- [ ] Card detail modal (title, description; assignee/labels if time).
**Acceptance:** drag a card, reload — new order is correct; failed move rolls back.

### Sprint 4 — Real-time + presence (Epic D) ★ MVP core
**Goal:** the headline feature — live multi-user sync.
- [ ] Socket.IO auth handshake (JWT); reject invalid.
- [ ] `board:join` / room membership verification.
- [ ] Socket handlers for `card:create/move/update/delete`, `list:create/move` — sharing the service layer with REST.
- [ ] Broadcast persisted changes to the board room (exclude sender).
- [ ] Presence: track + broadcast who's on the board (throttled).
- [ ] Client: `useSocket` hook; apply incoming events to board state; reconnect → re-fetch.
**Acceptance (M1):** two browsers as different users on one board see each other's moves within ~1s.

### Sprint 5 — RBAC hardening + members UI (Epic B)
**Goal:** authorization is correct and manageable.
- [ ] `requireRole` guard enforced on every REST + socket mutation.
- [ ] Members panel: add/remove members, change roles (per role matrix).
- [ ] UI hides unauthorised actions *and* server rejects them.
- [ ] Write a few tests for the permission matrix.
**Acceptance:** a member is blocked server-side from owner/admin-only actions.

### Sprint 6 — Polish, deploy, document (M2)
**Goal:** make it presentable and live.
- [ ] Loading/empty/error states; responsive pass.
- [ ] Deploy: client → Vercel, server → Render, DB → Atlas; configure CORS + env.
- [ ] README final pass: setup steps, architecture diagram, **30-sec demo GIF**.
- [ ] Stretch as time allows: comments, activity log, email invites.
- [ ] LinkedIn post in your usual format.
**Acceptance:** public URL works end-to-end; repo is interview-ready.

---

## 4. Backlog (stretch / post-MVP)
- Card comments (live) — Epic E1
- Activity log — Epic E2
- Email invitations — B4
- Refresh tokens
- Event replay on reconnect (instead of re-fetch)
- Position re-balance job + move toward lexicographic ranking
- Socket.IO Redis adapter (only if demonstrating horizontal scale)

---

## 5. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Real-time scope creep eats the timeline | Med | High | MVP core is Sprint 4; everything after is optional |
| Cert study squeezes build time | High | Med | Sprints 1–4 are the priority; 5–6 can slip into August |
| Drag-and-drop ordering bugs | Med | Med | Fractional positioning + a rebalance fallback; test reorders |
| Auth on sockets overlooked | Med | High | Handshake-level rejection built in Sprint 4, not bolted on later |

---

## 6. Tracking
Keep the dev board columns simple: **Backlog → Ready → In Progress → Done.** One sprint goal pinned at the top. Move your own cards — it's good practice for the product you're building.
