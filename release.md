# Release Plan & Version Roadmap: Kaj (কাজ)

## Release Strategy

- **Versioning**: Semantic Versioning (`MAJOR.MINOR.PATCH`).
- **Human-in-the-Loop Approval**: Always ask the user for explicit confirmation before releasing any MAJOR or MINOR versions.
- **Spec-Driven Governance**: Every release candidate must pass strict Spec Guardian verification (0 untested criteria, 0 hash drift).
- **Automated 6-Gate Release Pipeline**: Enforced via `release_manager.py`.
- **Mandatory Post-Release Daemon Restart**: Rebuild (`npm run build`) and restart the daemon (`npm run daemon:restart`) upon completing any release.

---

## Roadmap & Milestones (Latest at Top)

### Release `v3.2.0`: Daily Non-VIP Telegram Digest, 90-Day Auto-Purge Telemetry Snapshots & Cockpit Creator Percentages

- **Status**: ✅ RELEASED
- **Focus**: Adds a scheduled `08:00` daily brief In Progress Today task digest for non-VIP Telegram members (`NOTIF-002`), automates 90-day retention auto-purge for completed tasks while preserving Desktop Cockpit historical charts via atomic `completed_telemetry_snapshots` (`TASK-010`, `UI-013`), and enhances stacked creator telemetry bars with `count (%)` inline labels (`UI-012`).
- **Deliverables**:
  - [x] **NOTIF-002 / Scheduled Daily Non-VIP In Progress Today Digest**: Added `src/server/telegram/digest.ts`, concise `formatDailyBriefTaskList`, schema v3 `telegram_digest_dispatches` table for restart-safe once-daily delivery at `08:00` (`KAJ_TELEGRAM_DAILY_DIGEST_ENABLED`), strict `action_date === today` top ordering across active `in_progress_today` tasks (excluding `todo` and VIP members), and `POST /api/telegram/daily-digest`.
  - [x] **TASK-010 & UI-013 / 90-Day Completed Task Auto-Purge & Telemetry Snapshots**: Added `src/server/retention.ts` (`KAJ_DONE_RETENTION_DAYS=90`), atomic `completed_telemetry_snapshots` persistence across weekly/project/creator charts, startup/periodic purge scheduling, `POST /api/completed/purge`, and Completed Archive purge banner + manual purge control.
  - [x] **UI-012 / Creator Stacked Bar Count & Percentage Labels**: Updated `CockpitTelemetryDeck.tsx` stacked creator segments to display `count (%)` inline labels with accessible contrast.
- **Exit Criteria**: 100% active criteria verified in Spec Guardian (148/148 across 33 active specs), 111 unit/integration tests + 61 Playwright E2E tests passing, clean working tree, version bumped to `3.2.0`.

### Release `v3.1.0`: Global Repeating Triage Toggle, Cockpit Creator Chart Telemetry & Root Config Consolidation

- **Status**: ✅ RELEASED
- **Focus**: Adds a global toggle to hide repeating tasks in Triage across all project swimlanes (`UI-011`), promotes the Desktop Cockpit stacked creator chart above Weekly Velocity with latest-week-first ordering and inline segment counts (`UI-012`), and consolidates root configuration by merging Vitest into `vite.config.ts`, migrating Telegram bot configuration (`TG-001`) to `.env`, and adding IDE file nesting.
- **Deliverables**:
  - [x] **UI-011 / Global Repeating Triage Visibility Toggle**: Added `RepeatingTriageToggle` in the sticky desktop Triage header and mobile triage/pods views, hiding recurring `triage` items across all swimlanes with `localStorage` persistence while keeping non-triage and Calendar recurring items visible.
  - [x] **UI-012 / Desktop Cockpit Creator Chart Order & Segment Counts**: Positioned the stacked completed-tasks-by-creator chart above Weekly Velocity (`CockpitTelemetryDeck.tsx`), ordered weekly rows with the latest week on top, and rendered inline completion counts inside each non-zero creator segment.
  - [x] **TG-001 & Root Config Consolidation**: Merged `vitest.config.ts` into `vite.config.ts`, moved Telegram runtime configuration and `scripts/daemon-ctl.sh` toggles to `.env` (with optional `KAJ_TELEGRAM_CONFIG` JSON fallback), updated `.env.example`/`README.md`/`ADR.md`, and configured `.vscode/settings.json` IDE file nesting.
- **Exit Criteria**: 100% active criteria verified in Spec Guardian (135/135 across 30 active specs), 101 unit/integration tests + 58 Playwright E2E tests passing, clean working tree, version bumped to `3.1.0`.

### Release `v3.0.0`: Verified Encrypted Recovery, Automated Workflow Promotions & Urgent Today Visuals

- **Status**: ✅ RELEASED
- **Focus**: Introduces verified offline encrypted SQLite recovery with forward schema migrations (`BACKUP-002`) and unified `KAJ_DB_PATH` configuration, automates rule-driven task promotions across `triage` → `todo` → `in_progress_today` (`TASK-007`, `TASK-008`, `TASK-009`) enforcing Monday-to-Sunday weeks, and highlights today-action cards in high-contrast crimson (`UI-010`).
- **Deliverables**:
  - [x] **BACKUP-002 / Verified Encrypted Recovery CLI**: Added `npm run recover` (`scripts` / `src/server/backup/recover.ts` & `recover-cli.ts`) with `--verify-only` dry-run mode, `AES-256-GCM` decryption + SQLite `PRAGMA quick_check` / `integrity_check` in staging, `.pre-restore-*.bak` rollback snapshots, and README documentation.
  - [x] **Schema Migrations & `KAJ_DB_PATH` Standardization**: Implemented transactional `PRAGMA user_version` forward migrations during recovery with an architecture decision record (`ADR-008` in `ADR.md`) and standardized `KAJ_DB_PATH` resolution across runtime and recovery utilities.
  - [x] **TASK-007 / Recurring Period Triage-to-Todo Promotion**: Automatically promotes active recurring `triage` tasks matching the current Monday-start ISO week or month to `todo` on startup, 15-minute intervals, and `/api/board` fetch.
  - [x] **TASK-009 / Current Monday-Start Week Triage Promotion**: Automatically promotes any active `triage` task whose `action_date` falls within the current Monday–Sunday week to `todo`, codifying the Monday week-start rule in `AGENTS.md` and `.agents/rules/calendar-week.md`.
  - [x] **TASK-008 & UI-010 / Today Action Auto-Promotion & Red Card Highlight**: Automatically moves active tasks with `action_date === today` into `in_progress_today` and renders dark crimson `#4A1215` card surfaces with `border-red-500/70` and >= 4.5:1 WCAG contrast across Kanban Compact/Minimal, Desktop Cockpit, and Mobile cards.
- **Exit Criteria**: 100% active criteria verified in Spec Guardian (128/128 across 28 active specs), 95 unit/integration tests + 51 Playwright E2E tests passing, clean working tree, version bumped to `3.0.0`.

### Release `v2.9.0`: Automated Daily Encrypted Database Backup & Brief Telegram Notifications

- **Status**: ✅ RELEASED
- **Focus**: Adds automated daily encrypted SQLite backups to a user-specified cloud sync directory (Google Drive) using Node built-in AES-256-GCM encryption with atomic SQLite hot snapshots (`VACUUM INTO`), 7-day rolling window retention, strict directory isolation without scanning external folders, and brief Telegram notifications on backup completion and failures.
- **Deliverables**:
  - [x] **BACKUP-001 / AC-BACKUP-001.1**: Generates exactly one encrypted backup file `kaj-backup-DD-MM-YYYY.db.enc` per calendar day using AES-256-GCM encryption without locking concurrent database operations via `VACUUM INTO`.
  - [x] **BACKUP-001 / AC-BACKUP-001.2**: Implements automated 7-day rolling retention, pruning only `kaj-backup-*.db.enc` older than 7 calendar days within `KAJ_BACKUP_DIR`.
  - [x] **BACKUP-001 / AC-BACKUP-001.3**: Brief Telegram success notification (`✅ Kaj Backup Successful: kaj-backup-DD-MM-YYYY.db.enc`), strictly omitting directory paths.
  - [x] **BACKUP-001 / AC-BACKUP-001.4**: Brief Telegram failure alert (`⚠️ Kaj Backup Failed: Backup directory not accessible or not found. Please check Google Drive.`), throttled to once per day.
  - [x] **BACKUP-001 / AC-BACKUP-001.5**: Strict directory isolation restricting all read, write, and pruning operations strictly to `KAJ_BACKUP_DIR` without traversing parent or external cloud storage directories.
  - [x] **Standalone Decryption Utility**: Added portable `scripts/decrypt-backup.js` for zero-dependency offline database restoration.
  - [x] **Configuration & Runtime Loading**: Added `.env.example` template and automatic `.env` loading in `src/server/index.ts` via Node built-in `process.loadEnvFile()`.
- **Exit Criteria**: 100% active criteria verified in Spec Guardian (107/107 across 23 active specs), 78 unit/integration tests + 47 Playwright E2E tests passing, clean working tree, version bumped to `2.9.0`.

### Release `v2.8.0`: Telegram DD-MM/DD-MM-YYYY Date Shorthand & Universal UI DD-MM-YYYY Display

- **Status**: ✅ RELEASED
- **Focus**: Adds intuitive `DD-MM` (with current year inference) and `DD-MM-YYYY` shorthand parsing for action and due dates in the Telegram bot, formats bot replies and summaries using `DD-MM-YYYY`, and standardizes `DD-MM-YYYY` date display across all UI views (Kanban cards, Mobile cards, Desktop Cockpit, Completed drawer, and Task Modal helper hints) while preserving canonical ISO `YYYY-MM-DD` SQLite persistence.
- **Deliverables**:
  - [x] **TG-001 / AC-TG-001.4**: Extended Telegram shorthand parser (`src/server/telegram/parser.ts`) to support `@DD-MM`, `@DD-MM-YYYY`, `due:DD-MM`, and `due:DD-MM-YYYY` with calendar validation and current year inference, retaining ISO `YYYY-MM-DD` compatibility.
  - [x] **TG-001 / Bot Reply Formatting**: Formatted action and due dates in Telegram replies and task summaries as `DD-MM-YYYY` via `formatTaskSummary` in `src/server/telegram/formatters.ts`.
  - [x] **UI-001 & UI-005 / Kanban Display**: Formatted action date (`▶`) and due date (`⚑`) badges on compact and minimal Kanban cards as `DD-MM-YYYY` in `src/client/components/SwimlaneBoard.tsx`.
  - [x] **UI-006 & UI-009 / Mobile & Cockpit Display**: Formatted date badges in `src/client/components/mobile/MobileTaskCard.tsx` and `src/client/components/cockpit/CockpitExecutionDeck.tsx` as `DD-MM-YYYY`.
  - [x] **UI-004 / Modal & Archive Display**: Added `DD-MM-YYYY` formatted hints to TaskModal date inputs and formatted completion dates in `src/client/components/CompletedDrawer.tsx`.
  - [x] **Shared Utilities**: Introduced deterministic zero-skew date formatters `formatDisplayDateDMY` and `formatTimestampDMY` in `src/shared/types.ts`.
- **Exit Criteria**: 100% active criteria verified in Spec Guardian (102/102 across 22 active specs), 46 unit tests + 27 integration tests + 47 Playwright E2E tests passing, clean working tree, version bumped to `2.8.0`.

### Release `v2.7.0`: Automated Telegram Notifications, VIP Seen/Triaged Alerts & Task Completion Dispatch

- **Status**: ✅ RELEASED
- **Focus**: Formalizes automated Telegram notifications under dedicated specification `NOTIF-001`, dispatches real-time `Seen/Triaged: <task>` Telegram notifications to VIP users when their tasks in the Unassigned Inbox triage section are triaged to any other column or project, and dispatches automated task completion notifications to the creator via Telegram ID resolution from `user_names`.
- **Deliverables**:
  - [x] **NOTIF-001 / AC-NOTIF-001.1**: Automated Telegram notification dispatched to task creator (`created_by`) upon task completion, mapping creator name to numeric Telegram ID via `telegram.config.json` (`user_names`).
  - [x] **NOTIF-001 / AC-NOTIF-001.2**: Automated `Seen/Triaged: <task>` Telegram notification dispatched to VIP creator when their task moves out of the Unassigned Inbox (`project_id == null` and `status == "triage"`) into any other column or project swimlane.
  - [x] **Event Bus Architecture (`src/server/events.ts`)**: Added `"triaged"` event payload tracking both updated task and previous task state for accurate transition detection.
  - [x] **Telegram Notification Engine (`src/server/telegram.ts` & `formatters.ts`)**: Implemented `handleTaskTriagedNotification` with VIP verification (`isVipUser`) and `formatTaskTriagedNotification` formatting destination status/project.
- **Exit Criteria**: 100% active criteria verified in Spec Guardian (102/102 across 22 active specs), 46 unit tests + 27 integration tests + 47 Playwright E2E tests passing, clean working tree, version bumped to `2.7.0`.

### Release `v2.6.0`: Desktop Cockpit VIP Triage Plate, Configurable VIP Users & Creator Search Filtering

- **Status**: ✅ RELEASED
- **Focus**: Adds dedicated Desktop Cockpit VIP Triage Plate positioned directly above the Today Focus Plate for unassigned triage tasks created by VIP users, introduces configurable VIP user designations in `telegram.config.json` via `[VIP]` flag in `user_names` or object notation with `GET /api/vip-users` endpoint, and extends omnipresent top search and backend search across task creator (`created_by`).
- **Deliverables**:
  - [x] **UI-009 / AC-UI-009.6**: Dedicated VIP Triage Plate (`cockpit-vip-triage-plate`) positioned directly above the Today Focus Plate in Desktop Cockpit, displaying unassigned tasks (`project_id == null`) in status `triage` created by VIP users with 1-click status promotion (`⚡ Today`) and completion controls.
  - [x] **TG-001 / AC-TG-001.8**: Configurable VIP designation in `telegram.config.json` supporting both `[VIP]` string indicators in `user_names` values (e.g. `"847921997": "Oblix [VIP]"`) and object mappings (`{ "name": "Oblix", "vip": true }`), exposing resolved VIP identities via `GET /api/vip-users` and `GET /api/telegram/status`.
  - [x] **UI-007 / AC-UI-007.6**: Omnipresent search matching across task author/creator (`created_by`) in real-time on desktop and mobile viewports, synchronized with SQLite `LIKE` queries in `GET /api/tasks`, MCP task search tool, and Telegram bot `/search` commands.
- **Exit Criteria**: 100% active criteria verified in Spec Guardian (100/100), 44 unit tests + 27 integration tests + 47 Playwright E2E tests passing, clean working tree, version bumped to `2.6.0`.

### Release `v2.5.1`: Airtight Bi-Directional Spec Guardian & 1-Test-to-1-AC Anti-Stacking Governance


- **Status**: ✅ RELEASED
- **Focus**: Upgrades Spec Guardian to the airtight bi-directional Spec-Driven Development standard with full `[PLANNED]` roadmap lifecycle support, completes reverse codebase traceability across all source modules, enforces strict 1-Test-to-1-AC cardinality across the entire unit, integration, and Playwright E2E test suites (0 stacked tags), and formally aligns specification documentation.
- **Deliverables**:
  - [x] **Spec Guardian Engine (`tools/guardian.py`)**: Airtight bi-directional spec auditor supporting `[PLANNED]` lifecycle, premature implementation detection (`PREMATURE_IMPL`), reverse traceability (missing bindings in source and tests, orphan tags), Layer 1 anti-stacking (1-test-to-1-AC), Layer 4 AC backtick-identifier token verification, monotonic ratchet regression prevention, and aligned Markdown/terminal reports.
  - [x] **Source Reverse Traceability (`src/`)**: Bound missing architectural source files (`src/client/main.tsx`, `src/server/db.ts`, `src/server/events.ts`, `src/shared/types.ts`) achieving 100% source module spec coverage.
  - [x] **Test Traceability & Anti-Stacking (`tests/`)**: Bound missing integration tests in `api.test.ts` and decomposed stacked Playwright test cases (`tests/e2e/ui.test.ts`) across Calendar (`UI-003`), Task Modal (`UI-004`), and Desktop Cockpit (`UI-009`), achieving 100% 1-test-to-1-AC cardinality (0 stacked tags).
  - [x] **Specification Documentation (`specs/README.md` & `AGENTS.md`)**: Documented the 5 EARS syntax patterns, roadmap lifecycle, bi-directional traceability, and 1-test-to-1-AC rules.
- **Exit Criteria**: 100% active criteria verified in Spec Guardian (97/97), 43 unit tests + 27 integration tests + 45 Playwright E2E tests passing, clean working tree, version bumped to `2.5.1`.

### Release `v2.5.0`: Desktop Cockpit Execution Screen, Performance Telemetry & Codebase Modularization

- **Status**: ✅ RELEASED
- **Focus**: Adds dedicated Desktop Cockpit execution view with real-time performance telemetry charts (Weekly Velocity bars, Project Distribution Donut, and Creator-segmented horizontal stacked completion graph), view navigation switcher in the desktop top command bar, reordered Execution Deck with Upcoming Horizons above Tracking, and extensive senior engineering modularization of core monolithic files across client and server.
- **Deliverables**:
  - [x] **UI-009 / AC-UI-009.1**: Desktop navigation switcher in top command bar seamlessly toggling between Cockpit, Kanban Board, and Calendar.
  - [x] **UI-009 / AC-UI-009.2**: Split 2-column Desktop Cockpit layout featuring Today Focus Plate, Upcoming Horizons (This Week & This Month), and Tracking & Blockers containers.
  - [x] **UI-009 / AC-UI-009.3**: ISO weekly velocity bar chart visualizing tasks completed across the last 6 weeks with current week accenting.
  - [x] **UI-009 / AC-UI-009.4**: SVG donut chart illustrating distribution of completed tasks across project swimlanes with color tokens.
  - [x] **UI-009 / AC-UI-009.5**: Horizontal stacked creator bar chart attributing completed tasks to their respective authors (`created_by`) across weekly intervals.
  - [x] **Core Modularization**: Decomposed monolithic files (`MobileViews.tsx` reduced from 1,228 to 227 lines, `TaskModal.tsx` reduced from 930 to 573 lines, `DesktopCockpit.tsx` to 83 lines, `telegram.ts` to 424 lines, and extracted pure recurrence logic into `recurrence.ts`).
- **Exit Criteria**: 100% active criteria verified in Spec Guardian (97/97), 43 unit tests + 27 integration tests + 37 Playwright E2E tests passing, clean working tree, version bumped to `2.5.0`.

### Release `v2.3.0`: Telegram Creator Attribution, Notes Formatting Toolbar & Task Creator Editing

- **Status**: ✅ RELEASED
- **Focus**: Adds native creator attribution tracking (`created_by`), user name mapping in `telegram.config.json` for deterministic Telegram bot task creation, inline text formatting toolbar for task details & notes, and direct creator editing inside the Task Modal.
- **Deliverables**:
  - [x] **TG-001 / AC-TG-001.7**: User name mapping dictionary (`user_names`) in `telegram.config.json` mapping numeric Telegram user IDs to friendly names, recording creator attribution in `created_by`, and surfacing creator in Telegram summaries.
  - [x] **TASK-002 / AC-TASK-002.6**: Schema and SQLite database column migration for `created_by` attribute, preserved across task updates and surfaced on board cards and mobile views.
  - [x] **UI-004 / AC-UI-004.2 & AC-UI-004.5**: Collapsible text formatting toolbar in Task Details & Notes (bold, italic, underline, bullet list, numbered list) and dedicated `created_by` input in task editor dialog.
- **Exit Criteria**: 100% active criteria verified in Spec Guardian (92/92), 43 unit tests + 27 integration tests + 36 Playwright E2E tests passing, clean working tree, version bumped to `2.3.0`.

### Release `v2.2.0`: Triage Recurrence Rollover, Period Indicator Tags, Quick Click-to-Create & Emoji Prefix Picker

- **Status**: ✅ RELEASED
- **Focus**: Routes spawned instances of completed recurring tasks into `triage` with automatic execution period tags `[x]` (ISO week number for weekly, month for monthly, year for yearly), adds click-to-create affordances directly from Kanban column cells and Calendar day dates, and introduces a built-in emoji prefix picker popover for task titles.
- **Deliverables**:
  - [x] **TASK-004**: Spawns next instance of completed recurring tasks directly into `triage` with execution period indicator `[x]` appended (`[W45]`/`[45]` for weekly, `[11]` for monthly, `[2027]` for yearly), inheriting base title while cleanly stripping prior tags.
  - [x] **UI-001 / AC-UI-001.7**: Direct click-to-create affordance on Kanban column cells and empty areas pre-populating target column status and project swimlane.
  - [x] **UI-003 / AC-UI-003.6**: Click-to-create affordance on Calendar day cells (Month and Week grids) pre-populating clicked date as task action date.
  - [x] **UI-004 / AC-UI-004.4**: Task editor modal emoji prefix picker with categorized palette to quickly prepend or replace emoji indicators on task titles.
  - [x] **MCP-001 / `complete_task`**: Synchronized tool documentation with the new `triage` rollover behavior.
- **Exit Criteria**: 100% active criteria verified in Spec Guardian (89/89), 41 unit & integration tests + 34 Playwright E2E tests passing, clean working tree, version bumped to `2.2.0`.

### Release `v2.1.0`: Telegram Bot Daemon, Recurrence Scheduling & Multi-Modal Task Completion

- **Status**: ✅ RELEASED
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
