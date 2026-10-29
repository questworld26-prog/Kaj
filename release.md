# Release Plan & Version Roadmap: Kaj (কাজ)

## Release Strategy

- **Versioning**: Semantic Versioning (`MAJOR.MINOR.PATCH`).
- **Human-in-the-Loop Approval**: Always ask the user for explicit confirmation before releasing any MAJOR or MINOR versions.
- **Spec-Driven Governance**: Every release candidate must pass strict Spec Guardian verification (0 untested criteria, 0 hash drift).
- **Automated 6-Gate Release Pipeline**: Enforced via `release_manager.py`.

---

## Roadmap & Milestones (Latest at Top)

### Release `v2.1.0`: Telegram Bot Daemon, Recurrence Scheduling & Multi-Modal Task Completion

- **Status**: 🚀 RELEASE CANDIDATE
- **Focus**: Adds a native deterministic Telegram bot service running inside the Kaj background daemon for remote task creation and search without local LLM overhead; introduces explicit recurrence scheduling (day of the week, day of the month, day of the year); and delivers multi-modal task completion interactions (1-click circular card checkboxes on desktop, direct "Mark Complete" modal action, and mobile swipe-to-complete gestures).
- **Deliverables**:
  - [x] **TG-001**: Configurable deterministic Telegram bot integration (`src/server/telegram.ts`) with feature toggle flag, `telegram.config.json` credential loader, shorthand parsing (`#Project`, `!today`, `@date`, `due:date`, `wait:note`), `/search` query handler with inline buttons, `/today` horizon list, and daemon control CLI (`npm run telegram:on|off|status`).
  - [x] **TASK-002 / AC-TASK-002.3**: Recurrence customization supporting explicit repeat days (`repeat_day_of_week` 0-6, `repeat_day_of_month` 1-31, `repeat_day_of_year` MM-DD) in schemas, SQLite migrations, task rollover engine, and interactive Task Modal selectors.
  - [x] **UI-007**: Omnipresent top search filter across Kanban and Calendar views with real-time text matching and clear button, plus default Minimal card density on mobile devices.
  - [x] **UI-008**: Multi-modal task completion interactions:
    - [x] **AC-UI-008.1**: Circular completion checkboxes on desktop cards (Compact and Minimal views) with emerald hover micro-interactions and 1-click archiving.
    - [x] **AC-UI-008.2**: Explicit "✓ Mark Complete" button in the task edit modal dialog for immediate completion.
    - [x] **AC-UI-008.3**: Mobile touch swipe-to-complete gesture with emerald reveal background and 75px completion threshold.
  - [x] **Daemon Management**: macOS LaunchAgent auto-start integration (`scripts/daemon-ctl.sh install|uninstall`) ensuring Kaj runs automatically on laptop boot.
- **Exit Criteria**: 100% active criteria verified in Spec Guardian (86/86), 68 unit & integration tests + 31 Playwright E2E tests passing, clean working tree, version bumped to `2.1.0`.

### Release `v2.0.0`: Responsive Mobile Execution Cockpit & Touch Action Sheets

- **Status**: ✅ RELEASED
- **Focus**: Introduces full responsive mobile layout architecture on viewports < 768px featuring a 4-tab execution dock, pinned Today Focus Plate, dedicated Tracking container, collapsible project swimlanes with quick filters, 7-day mobile calendar with one-tap scheduling, and a thumb-friendly bottom action sheet for instant status changes and project reassignment—while keeping the desktop 6-column Bento layout 100% untouched.
- **Deliverables**:
  - [x] **UI-006 / AC-UI-006.1**: Viewport-adaptive navigation rendering a sticky 4-tab bottom dock (⚡ Cockpit, 📋 Pods, 📅 7-Day, 📥 Triage) on mobile (< 768px) and preserving desktop 6-column Kanban and top nav on viewports >= 768px.
  - [x] **UI-006 / AC-UI-006.2**: Mobile Execution Cockpit featuring an accented Today Focus Plate for `in_progress_today` tasks, dashed Tracking container for blocked items, and collapsible This Week and This Month horizon accordions.
  - [x] **UI-006 / AC-UI-006.3**: Mobile Pods tab with horizontal project filter chips, collapsible project swimlanes with task counts, pod reordering (`↑`/`↓`), and intra-pod status filters.
  - [x] **UI-006 / AC-UI-006.4**: Mobile 7-Day Calendar view with horizontal date strip, daily agenda with Action (`▶`) and Due (`⚑`) indicators, and slide-up Unscheduled Tasks drawer with one-tap scheduling buttons (`+ ▶ Action`, `+ ⚑ Due`).
  - [x] **UI-006 / AC-UI-006.5**: One-thumb bottom action sheet replacing desktop drag-and-drop on mobile, enabling moving tasks across columns (`triage`, `todo`, `in_progress_today`, `in_progress_week`, `in_progress_month`, `tracking`), reassigning project pods, or completing tasks.
  - [x] **Desktop Preservation**: Strict CSS scoping ensuring zero layout or behavioral regressions on desktop/tablet viewports >= 768px.
- **Exit Criteria**: 100% active criteria verified in Spec Guardian (72/72), 35 unit & integration tests + 23 Playwright E2E tests passing, clean working tree, version bumped to `2.0.0`.

### Release `v1.1.0`: Intra-Column Reordering, Card Density Modes, In-Progress Hero Chamber & ADRs

- **Status**: ✅ RELEASED
- **Focus**: Adds intra-column drag-and-drop task reordering, streamlines card density display options into Compact and Minimum modes, introduces the consolidated In Progress Hero Chamber with horizon icons (Today ⚡, This Week 📅, This Month 🗓), formalizes the project's Architecture Decision Records (ADR.md), and eliminates distracting flashing indicators.
- **Deliverables**:
  - [x] **TASK-006**: Intra-column drag-and-drop task reordering and atomic SQLite reordering API (`POST /api/tasks/reorder`) broadcasting SSE `task:reordered`.
  - [x] **UI-005**: Streamlined 2-mode card density display controls: **Compact** (~65px default, inline dates, hidden status dropdowns) and **Minimum** (~36px ultra-dense single-line row) persisted in `localStorage`.
  - [x] **UI-001 / AC-UI-001.6**: Consolidated In Progress Hero Chamber spanning 3 columns with prominent `[IN PROGRESS]` badge, accented `⚡ Today` focus plate, and `📅 This Week` / `🗓 This Month` sub-columns.
  - [x] **ADR Foundation**: Comprehensive `ADR.md` documenting 9 foundational architectural decisions, alternatives, and trade-offs.
  - [x] **UI Polish**: Removal of pulsing green beacon next to Today for a clean, calm dashboard experience.
- **Exit Criteria**: 100% active criteria verified in Spec Guardian (66/66), 59 unit & integration tests + 18 Playwright E2E tests passing, clean working tree, version bumped to `1.1.0`.

### Release `v1.0.1`: Architectural Stability, Security & Recurrence Hardening

- **Status**: ✅ RELEASED
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
