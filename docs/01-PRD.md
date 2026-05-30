# 01 — Product Requirements Document (PRD)

**Project:** CollabBoard
**Status:** Draft v1.0
**Owner:** Qadeer Afzal

---

## 1. Overview

CollabBoard is a real-time collaborative Kanban board. Teams create boards, organise work into lists and cards, and see each other's changes instantly. It is built primarily as a portfolio piece to demonstrate real-time systems, authorization, and data modelling — so the engineering reasoning is treated as a first-class deliverable, not just the feature set.

### Problem statement
Small teams need a shared, live view of work in progress. A page-refresh-to-see-changes app breaks the collaborative experience. CollabBoard solves the narrow problem of **keeping every viewer's board in sync in real time**, with appropriate access controls.

---

## 2. Goals and non-goals

### Goals
- Demonstrate real-time multi-user synchronisation that is correct (no lost updates within MVP assumptions).
- Enforce role-based permissions consistently across REST and WebSocket layers.
- Ship a deployed, documented, demonstrable application.
- Keep scope small enough to reach a working core in ~4 weeks of part-time work.

### Non-goals (explicitly out of scope)
- Not a feature-complete Trello/Jira competitor.
- No offline-first / full CRDT conflict resolution (documented as a known limitation).
- No mobile native apps (responsive web only).
- No billing, organisations, or multi-tenancy beyond per-board membership.
- No file attachments in MVP.

---

## 3. Target users & personas

| Persona | Description | Primary need |
|---|---|---|
| **Board owner** | Creates a board, invites others | Control membership and roles |
| **Admin** | Trusted collaborator | Manage lists/cards and members (not delete board) |
| **Member** | Day-to-day contributor | Create and move cards, see live updates |
| **Viewer (stretch)** | Read-only stakeholder | See the board without editing |

---

## 4. User stories

Stories are grouped by epic. Each is tagged **[MVP]** or **[Stretch]** and has acceptance criteria in the sprint plan.

### Epic A — Authentication
- **A1 [MVP]** As a user, I can register with email + password so that I have an account.
- **A2 [MVP]** As a user, I can log in and stay logged in so that I don't re-authenticate constantly.
- **A3 [MVP]** As a user, I can log out so that my session ends on a shared device.

### Epic B — Boards & membership
- **B1 [MVP]** As an owner, I can create a board so that my team has a shared workspace.
- **B2 [MVP]** As an owner/admin, I can add members to a board with a role so that access is controlled.
- **B3 [MVP]** As a member, I can see all boards I belong to so that I can navigate to my work.
- **B4 [Stretch]** As an owner/admin, I can invite by email so that non-users can join.
- **B5 [MVP]** As an owner, I can delete a board so that I can clean up.

### Epic C — Lists & cards
- **C1 [MVP]** As a member, I can create/rename/delete lists so that I can structure the workflow.
- **C2 [MVP]** As a member, I can create/edit/delete cards so that I can track tasks.
- **C3 [MVP]** As a member, I can drag a card within or between lists so that I can update status.
- **C4 [MVP]** As a member, I can reorder lists so that I can organise columns.
- **C5 [Stretch]** As a member, I can assign a card, add labels, and a due date.

### Epic D — Real-time collaboration
- **D1 [MVP]** As a viewer of a board, I see other users' card/list changes within ~1 second without refreshing.
- **D2 [MVP]** As a viewer, I can see who else is currently on the board (presence).
- **D3 [Stretch]** As a viewer, I see card comments appear live.

### Epic E — Activity & comments (stretch)
- **E1 [Stretch]** As a member, I can comment on a card.
- **E2 [Stretch]** As a member, I can see an activity log of changes on a board.

---

## 5. Functional requirements

1. The system shall authenticate users via JWT and protect all board data behind auth.
2. The system shall scope every board's data to its members only.
3. The system shall enforce role permissions (see system-design §6) on every state-changing operation, on both REST and socket layers.
4. The system shall persist a change to the database **before** broadcasting it to other clients.
5. The system shall broadcast board changes only to clients subscribed to that board's room.
6. The system shall maintain a stable ordering of lists and cards under concurrent reordering (see system-design §5).

---

## 6. Non-functional requirements

| Category | Requirement |
|---|---|
| **Performance** | Live updates visible to other clients within ~1s under normal conditions. Initial board load < 1.5s for a board with ≤ 200 cards. |
| **Security** | Passwords hashed (bcrypt). JWT verified on every request and socket handshake. Input validated server-side. No secrets in client. |
| **Reliability** | Socket client auto-reconnects; on reconnect, client re-fetches board state to re-sync. |
| **Usability** | Responsive layout (desktop-first, usable on tablet). Drag-and-drop keyboard-accessible via dnd-kit. |
| **Maintainability** | Clear client/server separation; documented API; typed where practical. |
| **Observability** | Server request + socket-event logging; basic error tracking. |

---

## 7. Success criteria (MVP "done")

The MVP is complete when, in a deployed environment:
- Two browsers logged in as different users on the same board see each other's card moves live.
- A member cannot perform an owner-only action (verified on the server, not just hidden in UI).
- Card order is preserved correctly after reload, including after concurrent moves.
- The app is deployed with a public URL, a README, an architecture diagram, and a short demo GIF.

---

## 8. Assumptions & constraints

- Single region, single server instance for MVP (horizontal scaling documented but not built — see system-design §7).
- Board size assumed small (teams, not thousands of cards).
- "Last write wins" is an acceptable conflict policy for MVP and is documented as such.
- Built part-time alongside certification study; scope is sized to ~6 one-week sprints.
