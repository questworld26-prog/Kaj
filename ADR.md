# Architecture Decision Records: Kaj (কাজ)

This document records the foundational architectural decisions, technical trade-offs, and design rationales for the **Kaj (কাজ)** task management system and Model Context Protocol (MCP) daemon.

---

## Status Legend

- **ACCEPTED**: Currently active architectural baseline in production.
- **SUPERSEDED**: Decision was valid at the time but replaced by a later record.
- **DEPRECATED**: Decision has been sunset and removed from the active system.

---

## Index of Architecture Decisions

1. [ADR-001: Low-Footprint Daemon with Node 26 Native `node:sqlite` in WAL Mode](#adr-001-low-footprint-daemon-with-node-26-native-nodesqlite-in-wal-mode)
2. [ADR-002: Dual Model Context Protocol (MCP) Transports (Streamable HTTP + stdio)](#adr-002-dual-model-context-protocol-mcp-transports-streamable-http--stdio)
3. [ADR-003: 6-Column Kanban Architecture with Consolidated In-Progress Hero Chamber](#adr-003-6-column-kanban-architecture-with-consolidated-in-progress-hero-chamber)
4. [ADR-004: Dual-Date Scheduling Model (Action Date vs. Due Date Decoupling)](#adr-004-dual-date-scheduling-model-action-date-vs-due-date-decoupling)
5. [ADR-005: Spawn-on-Complete Recurrence Rollover Engine](#adr-005-spawn-on-complete-recurrence-rollover-engine)
6. [ADR-006: Bento Layout & Chronos Dark-Mode Design System](#adr-006-bento-layout--chronos-dark-mode-design-system)
7. [ADR-007: Streamlined Card Density Architecture (Compact & Minimum Modes)](#adr-007-streamlined-card-density-architecture-compact--minimum-modes)
8. [ADR-008: Real-Time Event Synchronization via Server-Sent Events (SSE)](#adr-008-real-time-event-synchronization-via-server-sent-events-sse)
9. [ADR-009: Spec-Driven Development (SDD) & Automated Guardian Audit Gatekeeping](#adr-009-spec-driven-development-sdd--automated-guardian-audit-gatekeeping)
10. [ADR-010: Local Network Access & DNS Rebinding / CSRF Origin Guard](#adr-010-local-network-access--dns-rebinding--csrf-origin-guard)
11. [ADR-011: Responsive Mobile Execution Architecture (< 768px)](#adr-011-responsive-mobile-execution-architecture--768px)
12. [ADR-012: Deterministic Zero-LLM Telegram Bot Companion & Notifications](#adr-012-deterministic-zero-llm-telegram-bot-companion--notifications)
13. [ADR-013: Desktop Execution Cockpit & Lightweight SVG Weekly Telemetry](#adr-013-desktop-execution-cockpit--lightweight-svg-weekly-telemetry)
14. [ADR-014: Automated Daily Encrypted Backups with Strict Directory Isolation](#adr-014-automated-daily-encrypted-backups-with-strict-directory-isolation)
15. [ADR-015: Schema Versioning (`PRAGMA user_version`), Staged Migrations & WAL-Safe Recovery](#adr-015-schema-versioning-pragma-user_version-staged-migrations--wal-safe-recovery)

---

## ADR-001: Low-Footprint Daemon with Node 26 Native `node:sqlite` in WAL Mode

- **Status**: ACCEPTED
- **Date**: 2026-10-27
- **Deciders**: Systems Architect, Backend Engineering

### Context & Problem Statement

Kaj runs as an always-on background daemon on macOS and developer workstations. Many local productivity tools consume 300–800 MB RSS by bundling Chromium (Electron), heavy ORM layers (Prisma), or running separate database server processes (PostgreSQL/MySQL). Kaj requires a background memory footprint under ~95 MB RSS while handling concurrent reads and writes from both the web UI and external AI agent processes.

### Considered Options

1. **Node 26 built-in `node:sqlite` in WAL mode** (Zero external native C++ bindings, zero bundled server process).
2. **`better-sqlite3` native addon** (Fast, but requires node-gyp native compilation and increases bundle attack surface).
3. **Embedded PostgreSQL / DuckDB** (High memory overhead, 150–250 MB baseline RSS).
4. **Prisma / TypeORM with SQLite** (Heavy query engines consuming 40–80 MB overhead alone).

### Decision Outcome

Chosen **Option 1**: Use Node 26 native built-in `node:sqlite` configured with:

```sql
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;
```

The web dashboard is served directly by `Hono` as pre-compiled static assets (Preact + Vite), with zero Chromium or Electron runtime running in the daemon.

### Consequences

- **Positive**: Background memory stays strictly between **~75–92 MB RSS** under production agent traffic.
- **Positive**: Zero external C++ native compile step during `npm install`.
- **Positive**: WAL mode allows concurrent readers without blocking writes.
- **Negative**: Requires Node.js v26+ for stable built-in `node:sqlite`.

---

## ADR-002: Dual Model Context Protocol (MCP) Transports (Streamable HTTP + stdio)

- **Status**: ACCEPTED
- **Date**: 2026-10-27
- **Deciders**: Systems Architect, AI Integration Engineer

### Context & Problem Statement

Autonomous AI agents (such as Google Antigravity, Claude Desktop, Cursor, and custom CLI agents) need to query and manipulate tasks and projects. Different AI hosts communicate over different transports: web-based and networked agents prefer HTTP (`Streamable HTTP`), while desktop orchestrators expect process-spawned `stdio` JSON-RPC streams. Running two disconnected servers risks database lock contention and memory ballooning.

### Considered Options

1. **Dual Transport Architecture**: A persistent HTTP server (`POST /mcp` on `127.0.0.1:4820`) plus a lightweight stdio CLI proxy (`dist/mcp/stdio.js`) that proxies requests to the daemon over HTTP, falling back to direct SQLite WAL access if the daemon is offline.
2. **stdio-only CLI**: Forces agent commands to spawn a separate Node process per call, causing high process-spawn latency (~180ms per invocation).
3. **HTTP-only**: Incompatible with desktop apps like Claude Desktop that strictly launch agents via stdio commands.

### Decision Outcome

Chosen **Option 1**: Implement dual transport support. The core daemon serves Streamable HTTP at `POST /mcp`, while `dist/mcp/stdio.js` provides an instant stdio adapter with automatic proxying and WAL fallback. All MCP tools declare explicit safety hints (`readOnlyHint`, `destructiveHint`) and enforce soft-deletion safety guards.

### Consequences

- **Positive**: Full interoperability across both HTTP agents and stdio desktop applications.
- **Positive**: Single source of truth with real-time SSE broadcasts whenever an agent mutates state.
- **Negative**: Requires handling both streaming HTTP JSON-RPC responses and newline-delimited stdio framing.

---

## ADR-003: 6-Column Kanban Architecture with Consolidated In-Progress Hero Chamber

- **Status**: ACCEPTED (Updated 2026-10-29)
- **Date**: 2026-10-27 (Revised 2026-10-29)
- **Deciders**: UI/UX Lead, Product Architect

### Context & Problem Statement

Standard Kanban boards typically feature 3–4 disconnected columns (Todo, Doing, Done). Active work often spans different time horizons (what is urgent today vs. what is committed for this week vs. this month). Having 6 flat columns created horizontal visual clutter where "Today" looked visually identical to "Todo" or "Triage".

### Considered Options

1. **Consolidated In-Progress Hero Chamber**: Group `Today`, `This Week`, and `This Month` inside a single elevated visual container box spanning 3 grid tracks, with an `[IN PROGRESS]` badge, horizon icons (`⚡`, `📅`, `🗓`), and an accented focus plate on `Today`.
2. **Flat 6 Independent Columns**: Simple to render, but visually noisy and lacks clear hierarchy between backlog and active execution.
3. **Accordion / Tabbed Single Column**: Saves screen width, but hides two of the three active horizons, forcing unnecessary click interaction.

### Decision Outcome

Chosen **Option 1**: Implement the **In Progress Hero Chamber** (Option 2 archetype with Option 1 icons). The board layout presents 4 outer blocks (`Triage [1fr]`, `Todo [1fr]`, `In Progress Chamber [3fr]`, `Tracking [1fr]`). Within the chamber, `⚡ Today` receives an accented focus plate, while `📅 This Week` and `🗓 This Month` serve as secondary execution tracks.

### Consequences

- **Positive**: Immediate visual focus on daily execution while preserving weekly and monthly visibility.
- **Positive**: 100% viewport width utilization without horizontal scroll bars.
- **Positive**: Smooth drag-and-drop between backlog, active horizons, and tracking parking.

---

## ADR-004: Dual-Date Scheduling Model (Action Date vs. Due Date Decoupling)

- **Status**: ACCEPTED
- **Date**: 2026-10-27
- **Deciders**: Systems Architect, UX Lead

### Context & Problem Statement

Most task managers force a single `due_date` field. This conflates **when you plan to work on a task** (scheduling intent) with **when the task must be completed** (hard legal/business deadline). Users often set due dates artificially early to force items onto their daily agenda, losing track of real deadlines.

### Considered Options

1. **Decoupled Dual-Date Model**: Separate `action_date` (intent to execute) from `due_date` (hard deadline). Tasks can have neither, either, or both.
2. **Single Date with Reminder Flag**: Insufficient for multi-day calendar projections.
3. **Start Date + Due Date (Gantt style)**: Encourages duration estimation rather than focused daily commitment.

### Decision Outcome

Chosen **Option 1**: Implement dual dates in the schema (`action_date DATE NULL`, `due_date DATE NULL`). In the calendar view, Action Dates render with an emerald play badge (`▶`), while Due Dates render with a rose flag badge (`⚑`), with dedicated filter toggles.

### Consequences

- **Positive**: High clarity in calendar projections: users can schedule a task for `Today` (`action_date`) while knowing its hard deadline is `Friday` (`due_date`).
- **Positive**: Unscheduled sidebar cleanly surfaces active tasks lacking an `action_date` for drag-to-schedule planning.

---

## ADR-005: Spawn-on-Complete Recurrence Rollover Engine

- **Status**: ACCEPTED
- **Date**: 2026-10-27
- **Deciders**: Systems Architect, Backend Lead

### Context & Problem Statement

Recurring tasks in calendar/todo tools often flood databases with dozens or hundreds of "ghost" future instances, causing database bloat, synchronization conflicts, and stale task mutations.

### Considered Options

1. **Spawn-on-Complete Rollover**: The database maintains strictly **one active row** for any recurring task. When marked `done`, the current task is completed/archived, and the next instance is spawned into `todo` with forward-shifted dates (including month-end clamping, e.g., Jan 31 → Feb 28). Future dates are projected onto the Calendar virtually without database rows.
2. **Pre-generation of Future Instances**: Pre-creates 52 instances for weekly tasks. High database bloat and difficult bulk updates.
3. **In-place Date Shifting (No history)**: Erases completion history of prior occurrences.

### Decision Outcome

Chosen **Option 1**: Implement `Spawn-on-Complete`. Recurring tasks carry a `repeat_rule` (`none`, `daily`, `weekly`, `monthly`, `yearly`). When `POST /api/tasks/:id/complete` is called, the completed record is preserved in the archive, and the subsequent task is created atomically in an SQLite transaction.

### Consequences

- **Positive**: Zero database ghost bloat; minimal row counts.
- **Positive**: Preserves historic completion logs for audit and tracking.
- **Positive**: Safe handling of leap years and month-end clamping.

---

## ADR-006: Bento Layout & Chronos Dark-Mode Design System

- **Status**: ACCEPTED
- **Date**: 2026-10-28
- **Deciders**: UI/UX Lead, Frontend Engineer

### Context & Problem Statement

Desktop task interfaces frequently suffer from left-sidebar clutter, low contrast, and uninspired template designs. Kaj needed a distinctive, dark-mode-first aesthetic with strict accessibility compliance.

### Considered Options

1. **Bento × Chronos Design System**: Deep Graphite canvas (`#0E1111`), elevated container pods (`#121718`), card surfaces (`#1C2224`), Emerald execution accents (`#10B981`), and warm Gold Tracking accents (`#EAB308`). Floating command top bar without left sidebars.
2. **Standard Sidebar Navigation**: Consumes 200–240px of valuable horizontal space, constraining Kanban columns.
3. **Generic Light/Dark Theme**: Generic slate palette lacking distinct brand identity.

### Decision Outcome

Chosen **Option 1**: Standardize on Chronos dark-mode surfaces. All text maintains >= 4.5:1 contrast against card surfaces, and component boundaries maintain >= 3:1 contrast.

### Consequences

- **Positive**: Immersive, high-contrast dark environment optimized for long focus sessions.
- **Positive**: Maximum horizontal workspace dedicated to task swimlanes and calendar grids.

---

## ADR-007: Streamlined Card Density Architecture (Compact & Minimum Modes)

- **Status**: ACCEPTED
- **Date**: 2026-10-29
- **Deciders**: UI/UX Lead, Product Architect

### Context & Problem Statement

The initial Kanban card implementation featured a tall "Comfortable" mode (~140px) with inline status dropdowns, multi-line titles, and multiple badge rows. Users found that boards quickly became vertically unwieldy, forcing extensive vertical scrolling even with modest backlogs.

### Considered Options

1. **Two Focused Modes (Compact & Minimum)**: Deprecate Comfortable mode entirely. Make **Compact** (~65px, inline dates, hidden status dropdowns) the default, and provide an ultra-dense **Minimum** (~36px single-line row) for high-volume backlogs.
2. **Three Modes (Comfortable, Compact, Minimal)**: Keeping Comfortable added ~4 KB of redundant DOM code and confused users with overlapping density options.
3. **Continuous Zoom Slider**: Overly complex, unpredictable DOM layouts across swimlanes.

### Decision Outcome

Chosen **Option 1**: Completely remove Comfortable mode. Support only **Compact** (default) and **Minimum** density options via a top bar toggle, persisted in `localStorage` (`kaj_card_density`).

### Consequences

- **Positive**: Reduces board height by **55%** in Compact mode and **75%** in Minimum mode.
- **Positive**: Shrank frontend client bundle by ~4 KB.
- **Positive**: Simplifies user choices into two clear ergonomic states.

---

## ADR-008: Real-Time Event Synchronization via Server-Sent Events (SSE)

- **Status**: ACCEPTED
- **Date**: 2026-10-28
- **Deciders**: Systems Architect, Frontend Engineer

### Context & Problem Statement

When autonomous AI agents (running via MCP) create, reorder, or complete tasks, connected browser tabs must reflect the changes immediately without requiring manual browser refreshes.

### Considered Options

1. **Server-Sent Events (SSE) via `/events`**: Lightweight, unidirectional HTTP streaming native to browsers (`EventSource`), requiring zero WebSocket handshake overhead and minimal memory.
2. **WebSockets (`ws`)**: Bidirectional overhead unnecessary since client writes occur over clean REST endpoints; requires additional connection management and ping-pong state.
3. **Client Polling**: Unacceptable latency and CPU/battery waste on macOS.

### Decision Outcome

Chosen **Option 1**: Implement an in-memory event bus broadcasting mutations over `GET /events` using standard SSE format (`event: task:created`, `task:updated`, etc.). Browser clients update their state in `< 20ms`.

### Consequences

- **Positive**: Instant real-time UI updates when agents operate in the background.
- **Positive**: Reconnects automatically with native browser `EventSource`.
- **Negative**: HTTP/1.1 connection limits per domain (mitigated by local daemon topology).

---

## ADR-009: Spec-Driven Development (SDD) & Automated Guardian Audit Gatekeeping

- **Status**: ACCEPTED
- **Date**: 2026-10-27
- **Deciders**: Quality Architect, Lead Maintainer

### Context & Problem Statement

AI-assisted coding often causes architectural drift, untested edge cases, and documentation rot when requirements are only tracked in informal chat history.

### Considered Options

1. **Spec-Driven Development with EARS & Spec Guardian**: Formal Easy Approach to Requirements Syntax (EARS) in `specs/`, atomic Acceptance Criteria (`AC-*`), code/test traceability annotations (`// [spec: REQ-ID]`, `// [verifies: REQ-ID/AC-ID]`), normalized SHA-256 requirement block hashing, and automated gatekeeping (`npm run audit:specs`).
2. **Ad-hoc Markdown Docs**: No automated verification; drift occurs within days.
3. **Jira / Linear Issue Tracking Only**: Decoupled from Git commits and code annotations.

### Decision Outcome

Chosen **Option 1**: Mandate SDD for all features. Releases and commits require a clean Spec Guardian audit with 100% active criteria verified and zero hash drift violations.

### Consequences

- **Positive**: 100% traceable requirement-to-code-to-test pipeline.
- **Positive**: Immediate detection when code changes outpace formal specifications.
- **Positive**: Zero ambiguity during autonomous agent implementation turns.

---

## ADR-010: Local Network Access & DNS Rebinding / CSRF Origin Guard

- **Status**: ACCEPTED
- **Date**: 2026-10-29
- **Deciders**: Systems Architect, Security Engineering, Lead Maintainer

### Context & Problem Statement

Users need to access the Kaj web dashboard and MCP daemon not only from localhost, but also from other devices on their local WiFi/LAN network (e.g. smartphones, tablets, secondary laptops) via mDNS hostnames like `http://jarvis.local:4820` or private LAN IPs (`192.168.x.x`, `10.x.x.x`). However, binding to all network interfaces (`0.0.0.0`) exposes web servers to cross-site request forgery (CSRF) and DNS rebinding attacks if malicious websites on the public internet attempt to send unauthorized cross-origin requests to local intranet services.

### Considered Options

1. **Permissive Wildcard (`*`) CORS & No Host Check**: Easy LAN access, but critically vulnerable to cross-site script execution and intranet port scanning from external websites.
2. **Strict Loopback-Only Binding (`127.0.0.1`)**: Maximum isolation, but completely blocks legitimate access from phones, tablets, or other devices on the user's WiFi network.
3. **Dual Host/Origin Defense with Dual Interface Binding (`0.0.0.0`)**: Bind daemon to all network interfaces (`0.0.0.0`), while enforcing:
   - **Host Header Validation**: Strictly accept only loopback (`localhost`, `127.0.0.1`), mDNS domains (`*.local`), and RFC 1918 private IPv4/IPv6 address blocks. Reject arbitrary external domain names to prevent DNS rebinding.
   - **Origin Header Validation**: Allow same-origin requests and requests from trusted local network origins (`localhost`, `*.local`, private LAN IPs). Reject unauthorized cross-origin requests from public internet origins (e.g. `evil.com`).
   - **CORS Policy**: Restrict CORS headers to authorized local origins rather than wildcards.

### Decision Outcome

Chosen **Option 3**: Configure the daemon to bind by default to `0.0.0.0:4820`, enabling access across WiFi via `http://jarvis.local:4820` (and local LAN IPs), protected by the dual Host and Origin security guards in `src/server/app.ts`.

### Consequences

- **Positive**: Seamless multi-device access from smartphones, iPads, and secondary computers on local WiFi without port-forwarding or reverse proxies.
- **Positive**: Robust security barrier against DNS rebinding, CSRF, and drive-by web browser attacks from external internet origins.
- **Positive**: Low memory footprint remains unchanged (~75–88 MB RSS under load).
- **Negative**: Client devices must be on the same local network subnet or have mDNS resolution enabled.

---

## ADR-011: Responsive Mobile Execution Architecture (< 768px)

- **Status**: ACCEPTED
- **Date**: 2026-11-04
- **Deciders**: UI/UX Lead, Frontend Engineering

### Context & Problem Statement

Kaj's desktop 6-column Bento Kanban board and HTML5 drag-and-drop interactions do not adapt cleanly to narrow mobile touchscreens (< 768px). Shrinking 6 columns horizontally causes tiny tap targets, horizontal scroll fatigue, and broken touch dragging.

### Considered Options

1. **Dedicated Mobile Execution Shell (< 768px)**: Render a sticky 4-tab bottom navigation dock (`Cockpit`, `Pods`, `7-Day`, `Triage`), touch swipe-to-complete cards, and a one-thumb bottom action sheet for status changes and project reassignment—while leaving the desktop >= 768px UI untouched.
2. **Horizontal Scrollable Kanban**: Preserves identical markup across viewports, but fails mobile ergonomics and one-handed task execution.
3. **Separate Native Mobile App**: Duplicates business logic and requires separate distribution/builds.

### Decision Outcome

Chosen **Option 1**: Implemented viewport-adaptive rendering in `src/client/components/mobile/` below `768px` powered by the same REST + SSE backend APIs.

### Consequences

- **Positive**: Zero extra API endpoints or separate app packaging; fast mobile triage and 1-swipe task completion.
- **Negative**: Separate layout/component tree must be verified under Playwright mobile viewport tests.

---

## ADR-012: Deterministic Zero-LLM Telegram Bot Companion & Notifications

- **Status**: ACCEPTED
- **Date**: 2026-11-06
- **Deciders**: Systems Architect, Backend Engineering

### Context & Problem Statement

Users frequently want fast mobile capture, quick task searches, VIP triage alerts, and completion notifications without opening a browser. Embedding a local LLM or external Python bot runner would violate Kaj's ~56–95 MB RSS footprint constraint and add latency or external API costs.

### Considered Options

1. **In-Daemon Deterministic Long-Polling Service**: Integrate long-polling directly in the Node daemon using deterministic token parsing (`#Project`, `!priority`, `@DD-MM`, `due:DD-MM-YYYY`, `wait:note`), inline reply buttons, and creator/VIP attribution from `telegram.config.json`.
2. **External LLM Webhook Agent**: Flexible natural language parsing, but requires external API latency/tokens or multi-gigabyte local models.
3. **Separate Webhook Bot Process**: Requires public HTTPS tunnel (ngrok/Cloudflare) and adds deployment complexity.

### Decision Outcome

Chosen **Option 1**: Implemented `TelegramBotService` (`src/server/telegram.ts` and `src/server/telegram/`) using native HTTPS long polling, canonical `DD-MM-YYYY` user-facing date formatting, and automated event-driven completion and VIP triage notifications.

### Consequences

- **Positive**: Works behind home NAT/firewalls with ~0 MB extra memory overhead and deterministic sub-50ms command parsing.
- **Positive**: Enables instant bidirectional alerts (including backup status notifications) via existing bot credentials.
- **Negative**: Users must learn simple shorthand prefixes instead of free-form natural language sentences.

---

## ADR-013: Desktop Execution Cockpit & Lightweight SVG Weekly Telemetry

- **Status**: ACCEPTED
- **Date**: 2026-11-09
- **Deciders**: UI/UX Lead, Product Architect

### Context & Problem Statement

While Kanban columns excel at backlog organization, daily focus benefits from an execution-first command surface pairing `Today` focus, VIP triage items, `Upcoming` horizons, and `Tracking` blockers alongside throughput telemetry. Heavy charting libraries (`Chart.js`, `Recharts`, `D3`) bloat client bundles unnecessarily.

### Considered Options

1. **Dedicated Execution Cockpit + Zero-Dependency Custom SVG Charts**: Build `DesktopCockpit` as the primary command view with lightweight pure-SVG telemetry charts (ISO Weekly Velocity, Project Distribution Donut, Creator Stacked Velocity).
2. **Third-Party Charting Library**: Faster initial setup, but adds 80–250 KB minified JS overhead.

### Decision Outcome

Chosen **Option 1**: Implemented modular components in `src/client/components/cockpit/` using native `<svg>` charts and live SQLite telemetry queries.

### Consequences

- **Positive**: Keeps compiled frontend JS bundle compact (~43 KB gzipped total) with zero runtime chart library dependencies.
- **Negative**: Adding new telemetry chart types requires hand-authoring SVG geometry.

---

## ADR-014: Automated Daily Encrypted Backups with Strict Directory Isolation

- **Status**: ACCEPTED
- **Date**: 2026-11-13
- **Deciders**: Systems Architect, Security Engineering, Lead Maintainer

### Context & Problem Statement

Local SQLite databases on laptops are vulnerable to hardware failure or accidental deletion. Syncing live WAL files directly inside Google Drive causes SQLite file corruption. At the same time, Kaj must respect user privacy by **never** scanning or traversing parent or sibling Google Drive directories, and must work cleanly on laptops that sleep frequently.

### Considered Options

1. **In-Daemon Catch-Up `VACUUM INTO` + `node:crypto` AES-256-GCM + Strict `KAJ_BACKUP_DIR` Isolation**: Check on daemon startup and hourly whether today's backup (`kaj-backup-DD-MM-YYYY.db.enc`) exists exclusively inside `KAJ_BACKUP_DIR`; take an atomic hot snapshot via `VACUUM INTO`, encrypt with AES-256-GCM (`scrypt` key derivation, 16B salt, 12B IV, 16B tag), prune backups > 7 days old, and dispatch brief pathless Telegram status alerts.
2. **External Shell `cron` + `sqlite3` / `gpg`**: Fragile across macOS TCC permissions and laptop sleep cycles; adds external GPG dependency.
3. **Cloud Storage API Integration (Google Drive OAuth)**: Heavy SDK dependencies, token refresh failures, and broad Drive permissions.

### Decision Outcome

Chosen **Option 1**: Implemented `BACKUP-001` (`src/server/backup/crypto.ts`, `service.ts`) with zero external dependencies, strict boundary isolation inside `KAJ_BACKUP_DIR`, and standalone cross-machine decryption (`scripts/decrypt-backup.js`).

### Consequences

- **Positive**: Zero locking of concurrent WAL reads/writes, zero Google Drive scanning, and portable decryption on any machine with Node.js.
- **Positive**: Works automatically whenever the laptop wakes up without missed midnight cron jobs.
- **Negative**: User must safeguard their passphrase (`KAJ_BACKUP_KEY` or `~/.config/kaj/backup.key`) independently of Google Drive.

---

## ADR-015: Schema Versioning (`PRAGMA user_version`), Staged Migrations & WAL-Safe Recovery

- **Status**: ACCEPTED
- **Date**: 2026-11-13
- **Deciders**: Systems Architect, Backend Lead, Lead Maintainer

### Context & Problem Statement

Replacing a live SQLite database from an encrypted `.db.enc` backup introduces two critical failure modes:
1. **WAL Desynchronization**: If `-wal` or `-shm` sidecar files remain on disk or the daemon holds open file handles when `tasks.db` is overwritten, SQLite replays stale journal frames and corrupts the database.
2. **Database Schema Drift Across Releases**: Restoring an older backup onto a newer Kaj version requires schema upgrades, whereas restoring a newer backup onto an older Kaj binary can break queries or lose columns. Furthermore, `KAJ_DB_PATH` from `.env` must be consistently honored across the daemon, backup engine, MCP stdio adapter, and recovery tool.

### Considered Options

1. **SQLite `PRAGMA user_version` + Staged Transactional Forward Migrations + WAL-Safe Atomic Swap**:
   - Store Kaj's integer schema version natively in `PRAGMA user_version` (zero extra schema tables).
   - Execute recovery against a **temporary staging file** first: verify AES-256-GCM authentication, run `PRAGMA integrity_check` and core table sanity checks, and run ordered transactional forward migrations if `backupVersion <= appVersion`.
   - Abort safely if `backupVersion > appVersion` (downgrade guard) or if any validation/migration fails—never touching the live database.
   - Stop any running daemon before mutation, consolidate a pre-restore rollback snapshot (`.pre-restore-<timestamp>.bak`) via `VACUUM INTO`, remove `-wal`/`-shm` sidecars, rename the staged DB atomically into `KAJ_DB_PATH`, and restart the daemon.
2. **Raw Decrypted Copy + In-Place Startup Migration**: Simple, but risks corrupting the live database if an upgrade fails mid-way or if `-wal` frames remain.
3. **Destructive Table Reconstruction (`--remap`) Only**: Complex column-intersection heuristics that risk silent semantic loss without explicit migration scripts.

### Decision Outcome

Chosen **Option 1**: Standardize `KAJ_DB_PATH` resolution via shared helpers in `src/server/db.ts`, track integer schema versions via `PRAGMA user_version` with sequential transactional migrations, and implement `BACKUP-002` CLI recovery (`npm run recover`) enforcing staged verification, downgrade protection, pre-restore `.bak` snapshots, and WAL/SHM cleanup.

### Consequences

- **Positive**: Any historic encrypted backup from prior versions automatically upgrades in a safe isolated staging copy before touching active files.
- **Positive**: Incompatible future-version backups fail safely without corrupting the current workspace, while every restore remains reversible via the local `.pre-restore-*.bak` snapshot.
- **Positive**: All database consumers (daemon, daily backup, MCP stdio adapter, recovery CLI) honor `KAJ_DB_PATH` from `.env` consistently.
- **Negative**: Future schema alterations must increment the ordered migration list and `LATEST_SCHEMA_VERSION` in `src/server/db.ts`.
