# Release Plan & Version Roadmap: Kaj (কাজ)

## Release Strategy

- **Versioning**: Semantic Versioning (`MAJOR.MINOR.PATCH`).
- **Human-in-the-Loop Approval**: Always ask the user for explicit confirmation before releasing any MAJOR or MINOR versions.
- **Spec-Driven Governance**: Every release candidate must pass strict Spec Guardian verification (0 untested criteria, 0 hash drift).
- **Automated 6-Gate Release Pipeline**: Enforced via `release_manager.py`.

---

## Roadmap & Milestones (Latest at Top)

### Release `v1.0.1`: Architectural Stability, Security & Recurrence Hardening

- **Status**: 🚀 RELEASE CANDIDATE
- **Focus**: Resolves multi-request transport reuse crash in MCP HTTP daemon, patches CORS/CSRF vulnerabilities, enforces idempotent task completion and recurrence rollover on PATCH/status transitions, eliminates date/monthly recurrence drift, adds dynamic calendar date fetching on horizon navigation, upgrades muted text contrast to WCAG AA >= 4.5:1, and replaces blocking modal dialogs with non-blocking error notifications.
- **Deliverables**:
  - [x] **C1 Fix**: Fresh `McpServer` instance per HTTP request on `POST /mcp` eliminating transport connection collisions.
  - [x] **C2 Fix**: Strict loopback-only CORS and Origin validation across all `/api/*`, `/events`, and `/mcp` endpoints; Content-Type enforcement on mutating requests; explicit 404 for unknown API routes.
  - [x] **H1 & H2 Fix**: Idempotent `completeTask` and automatic repeat rollover trigger when `status` transitions to `done` via `updateTask` (PATCH or MCP).
  - [x] **H3 & H4 Fix**: Removal of unsupported `daily` option in `TaskModal` and strict calendar date validation in `DateStringSchema`.
  - [x] **H5 Fix**: Dynamic range refetching in `CalendarView` across month and week navigations.
  - [x] **H6 & H7 Fix**: Proper 404 return on missing task reopen/restore; project reorder ID validation; monthly recurrence anchor tracking preventing month-end date degradation.
  - [x] **H8 Fix**: Calendar projection for recurring `due_date` instances alongside `action_date`.
  - [x] **UI & Test Hardening**: Replaced raw `alert()` with non-blocking error toast; ensured all text tokens meet WCAG AA >= 4.5:1 contrast; made Playwright tests fail on console/page errors.
- **Exit Criteria**: 100% active criteria verified in Spec Guardian (57/57), 54 unit & integration tests + 12 Playwright E2E tests passing, clean working tree, version bumped to `1.0.1`.

### Release `v1.0.0`: Production Baseline Release

- **Status**: ✅ RELEASED
- **Focus**: Complete full-width Bento × Chronos dark-mode task management system with Model Context Protocol (MCP) daemon, SQLite WAL engine, dual date scheduling, and interactive Calendar.
- **Deliverables**:
  - [x] **TASK-001**: 6-Column Kanban board with In Progress sub-columns (Today, This Week, This Month) and Tracking column for blocked items.
  - [x] **TASK-002**: Task data attributes, priority horizons, recurrence rules, and Zod schema validation.
  - [x] **TASK-003**: Independence of status workflows and planning priority horizons.
  - [x] **TASK-004**: Spawn-on-complete recurrence rollover with end-of-month date clamping.
  - [x] **TASK-005**: Dual-date scheduling with independent Action Date (`▶`) and Due Date (`⚑`).
  - [x] **PROJ-001**: Project entity management and draggable/button swimlane ordering.
  - [x] **PROJ-002**: Default Unassigned Inbox top swimlane.
  - [x] **MCP-001**: Standard 11-tool Model Context Protocol suite for external agents.
  - [x] **MCP-002**: Dual transport support: Streamable HTTP (`POST /mcp`) and stdio (`dist/mcp/stdio.js`) with live SSE synchronization (`/events`).
  - [x] **MCP-003**: Tool safety annotations, soft-delete protection (`deleted_at`), and DNS rebinding origin guard.
  - [x] **UI-001**: Bento full-width 6-column layout, collapsible swimlane pods, dashed tracking cards, and fluid HTML5 drag-and-drop.
  - [x] **UI-002**: Chronos dark-mode palette (`#0E1111`, `#121718`, `#1C2224`, `#10B981`, `#EAB308`) with WCAG AAA accessible contrast.
  - [x] **UI-003**: Interactive Calendar view with Month and Week grids, dual-date badges, filter toggles, Unscheduled sidebar, and drag-and-drop scheduling across days.
  - [x] **UI-004**: Light-dismiss task editor `<dialog closedby="any">` and Completed Archive drawer with 1-click restore.
- **Exit Criteria**: 100% active criteria verified in Spec Guardian (57/57), 44 unit & integration tests + 12 Playwright E2E tests passing, clean working tree, version bumped to `1.0.0`.
