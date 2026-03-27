# Kanban Board — Design & Architecture

## 1. System Overview

A real-time, multi-user Kanban board with three columns (To Do, In Progress, Done). Users can concurrently create, edit, move, and reorder tasks. The system resolves conflicts deterministically and propagates all changes to connected clients within 200 ms on localhost.

---

## 2. Architecture

```
┌───────────────────────────────────────────────────────────┐
│                       Frontend (React 18)                  │
│  ┌──────────┐  ┌───────────────┐  ┌────────────────────┐  │
│  │ Board UI  │  │ Zustand Store │  │  Offline Queue     │  │
│  │ (dnd-kit) │  │ (optimistic)  │  │  (LocalStorage)    │  │
│  └────┬──────┘  └───────┬───────┘  └─────────┬──────────┘  │
│       │                 │                     │             │
│       └─────────────────┴──────────┬──────────┘             │
│                                    │                        │
│                         Socket.IO Client / REST API         │
└────────────────────────────────────┬───────────────────────┘
                                     │ WebSocket + HTTP
┌────────────────────────────────────▼───────────────────────┐
│                       Backend (Node.js / Express)          │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  Socket.IO Server                                      │ │
│  │  ├── task.handler.ts    (business logic calls)         │ │
│  │  └── presence.handler.ts (user presence)              │ │
│  ├── REST API (/api/tasks)                                │ │
│  └── Task Service (conflict resolution + fractional idx)  │ │
└────────────────────────────────────┬───────────────────────┘
                                     │
┌────────────────────────────────────▼───────────────────────┐
│                    PostgreSQL Database                      │
│  tasks(id, title, description, column_name, position,      │
│         version, created_at, updated_at)                   │
└────────────────────────────────────────────────────────────┘
```

---

## 3. Task Ordering Algorithm

### Strategy: Fractional Indexing (O(1) amortized)

Each task stores a `position` field as a floating-point number string. Positions are real numbers that can be subdivided indefinitely.

**Operations:**
- **Insert at end:** `lastPosition + 1.0`
- **Insert at beginning:** `firstPosition - 1.0`
- **Insert between two tasks:** `(prev + next) / 2` (midpoint)

**Rebalancing:** When the gap between two adjacent positions falls below `1e-9` (floating-point precision limit), the entire column is rebalanced with evenly spaced integer positions. This is O(n) but happens extremely rarely — amortized O(1) per move.

**Why not array indexing?** Re-indexing an array on every move is O(n) per operation. Fractional indexing makes each insert O(1) with only occasional O(n) rebalance.

---

## 4. Conflict Resolution Strategy

### 4.1 Version-Based Optimistic Locking

Every task has a monotonically increasing `version` integer. Clients send their known version with every mutation. The server uses row-level locking (`FOR UPDATE`) to serialize concurrent writes.

A **conflict** is detected when `clientVersion < serverVersion` at the time of write.

### 4.2 Conflict Scenarios

#### Scenario 1: Concurrent Move + Edit (`move_edit`)

- **User A** moves Task X from "To Do" → "Done" → server version increments to v2
- **User B** (with stale v1) edits Task X's title

**Resolution:** Both changes are preserved.
- The server applies the content changes (title/description) on top of the server's current column position.
- The conflict type `move_edit` is returned; the caller is notified their version was stale but changes were applied.
- Both clients receive the merged task via `task:updated` broadcast.

#### Scenario 2: Concurrent Move + Move (`move_move`)

- **User A** moves Task X to "In Progress" → server wins, version v2
- **User B** (with stale v1) tries to move Task X to "Done"

**Resolution:** Server (first writer) wins. Last-write-wins would cause non-determinism; instead, the **first committed move wins**.
- User B's move is rejected; they receive `task:conflict` with `conflictType: 'move_move'`
- User B's UI is reconciled to the server's authoritative state
- A conflict notification toast is displayed to the losing user

**Rationale:** Move+Move is a zero-sum conflict — a task can only be in one column. We choose first-writer-wins for determinism. Both users observe a consistent final state.

#### Scenario 3: Concurrent Reorder

- **User A** reorders tasks in "To Do"
- **User B** adds a new task to "To Do" simultaneously

**Resolution:** Both operations succeed. Fractional indexing ensures new positions never collide:
- User A's reorder assigns a midpoint position between existing tasks
- User B's new task gets `lastPosition + 1.0`
- Final order is determined by the numeric position field; all clients see the same ordering

---

## 5. Offline Support

### Queue-Based Replay

When the WebSocket disconnects:
1. The UI enters **read-only + queued writes** mode (visual indicator in header)
2. Any user action (create/edit/move/delete) is added to an in-memory queue (`offlineQueue` in Zustand)
3. Optimistic UI updates still apply so the user's view remains responsive

On reconnect:
1. Socket.IO automatically reconnects
2. `board:sync` event requests the full authoritative board state
3. Queued actions are replayed in order via WebSocket
4. The server processes each action as normal — including conflict detection
5. The local state is reconciled with the server response

---

## 6. Real-Time Sync Architecture

### WebSocket Message Separation

WebSocket handlers are **strictly separated from business logic**:

```
src/websocket/
  handlers/
    task.handler.ts      ← validates input, calls task.service.ts
    presence.handler.ts  ← manages presence map, broadcasts
  index.ts               ← Socket.IO setup only
```

Business logic lives exclusively in `src/services/task.service.ts`.

### Event Flow

```
Client A emits task:move
    → task.handler.ts validates input
    → task.service.moveTask() acquires row lock, resolves conflict, writes atomically
    → io.emit('task:moved', resolvedTask) → all clients update
    → if conflict: io.to(loserSocketId).emit('task:conflict', ...)
```

---

## 7. Database Design

```sql
CREATE TABLE tasks (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title       TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description TEXT NOT NULL DEFAULT '',
  column_name TEXT NOT NULL CHECK (column_name IN ('todo','inprogress','done')),
  position    TEXT NOT NULL,           -- fractional index as string
  version     INTEGER NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_column_position ON tasks(column_name, position);
```

### Atomic Writes

All multi-step operations (move with potential rebalance) use `BEGIN`/`COMMIT` transactions with `SELECT ... FOR UPDATE` row-level locking. This prevents partial writes if the server crashes mid-operation.

---

## 8. Optimistic UI

1. **Immediate response:** The UI applies changes locally before the server confirms
2. **Reconciliation:** When the server response arrives, the store is updated with the authoritative version (which may differ if a conflict was resolved)
3. **Conflict notification:** If the server rejected or modified the client's action, a toast notification informs the user

---

## 9. Security

- All WebSocket and REST inputs are validated with **Zod** schemas server-side
- The server never trusts client-provided IDs for new resources (UUIDs are server-generated)
- Column values are restricted via `CHECK` constraints in the database
- Task title and description have max-length constraints
