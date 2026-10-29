# Kaj (কাজ)

> **Kaj** (pronounced _/kadʒ/_, Bengali for **task** or **work** — **কাজ**) is a high-performance, low-footprint task management system and Model Context Protocol (MCP) daemon for macOS and local development environments.

Kaj combines a **6-column Kanban board with project swimlanes**, **dual-date scheduling** (Action Dates vs. Deadlines), an **interactive Month & Week calendar**, and a **first-class Model Context Protocol (MCP) server** that lets autonomous AI agents manage your tasks in real time over Streamable HTTP and stdio.

---

## Key Features

- **6-Column Kanban with Execution Horizons**:
  - `Triage`: Quick intake for unvetted items.
  - `Todo`: Backlog ready for prioritization.
  - `In Progress` grouped header with 3 execution sub-columns:
    - `Today`: Tasks actively worked on today.
    - `This Week`: Active weekly commitments.
    - `This Month`: Active monthly execution window.
  - `Tracking`: Dedicated parking column for blocked items, external dependencies, and package delivery tracking (with carrier numbers, status notes, and tracking links).
- **Project Swimlanes & Reordering**:
  - First-class Project entities with custom color tokens and collapsible swimlanes.
  - Interactive swimlane reordering controls to prioritize projects vertically.
  - Top-level `Unassigned / Quick Triage` swimlane for immediate friction-free task capture.
- **Dual-Date Scheduling**:
  - Independent **Action Date** (when you plan to work on the task) and **Due Date** (hard deadline).
  - Tasks can have an action date, a due date, both, or neither.
- **Interactive Calendar View (Month & Week)**:
  - Toggle between **Month view** (multi-week high-level grid) and **Week view** (focused 7-day schedule).
  - Distinct visual badges for Action Dates (`▶`) and Due Dates (`⚑`) with filter toggles.
  - **Unscheduled Tasks sidebar** for drag-to-schedule date assignment.
- **Spawn-on-Complete Recurrence**:
  - Repeating tasks (`weekly`, `monthly`, `yearly`) keep a single active card on the board.
  - Marking a recurring task `done` archives the finished occurrence and automatically spawns the next occurrence in `todo` with dates shifted forward (including leap year and end-of-month clamping, e.g. Jan 31 → Feb 28).
  - Future occurrences project virtual preview indicators onto the Calendar without database ghost rows.
- **Standard Model Context Protocol (MCP) Daemon**:
  - Dual-transport support: **Streamable HTTP** (`POST /mcp` on `127.0.0.1:4820`) and **stdio** CLI (`dist/mcp/stdio.js`).
  - Full CRUD and filtered queries for tasks and projects.
  - Real-time Server-Sent Events (SSE) push updates connected browser tabs in `< 20ms` when agents mutate tasks.
- **Low Memory Footprint (~75–95 MB RSS under traffic)**:
  - Built on Node 26 using built-in `node:sqlite` in WAL mode (`PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;`).
  - Pre-compiled static single-page app (Preact + Vite + CSS design tokens) served directly by `Hono` — zero bundled Chromium or Electron bloat in the background daemon.
- **Card Density Modes & Intra-Column Reordering**:
  - Reorder tasks inside any column via drag-and-drop with instant persistence and visual drop targets.
  - Two focused card density modes to control board vertical height (persisted in `localStorage`):
    - **Compact** (Default, ~65px): Streamlined card with priority chip, single-line title, inline dates, and blocker indicator (hides bulky status dropdowns).
    - **Minimum** (~36px, >75% height reduction): Ultra-dense single-line row with priority dot indicator, completion button, title, and compact due badge — keeps massive backlogs visible on a single screen without vertical scrolling.
- **Bento × Chronos Dark-Mode UI**:
  - Full-width layout without left-sidebar clutter.
  - Chronos dark palette: Deep Graphite canvas (`#0E1111`), elevated pods (`#121718`), Emerald execution accents (`#10B981`), and warm Gold Tracking accents (`#EAB308`).
  - Accessible contrast ratios (>= 4.5:1 text, >= 3:1 component boundaries).

---

## Architecture Overview

```mermaid
flowchart LR
  subgraph Clients["Local Clients"]
    Browser["Browser / Dock Web App\nhttp://127.0.0.1:4820"]
    AgentHTTP["MCP Agents (HTTP)\ne.g. Antigravity / Claude Code"]
    AgentStdio["MCP Agents (stdio)\ne.g. Claude Desktop / Cursor"]
  end

  subgraph Daemon["Kaj Background Daemon (~75–95 MB RSS)"]
    Hono["Hono Web Server\nStatic Assets + REST + SSE (/events)"]
    MCPHttp["Streamable HTTP MCP Server\nPOST /mcp"]
    Domain["Domain Repositories\nTasks, Projects, Recurrence, Calendar"]
    Bus["In-Memory Event Bus\nLive SSE Broadcast"]
  end

  StdioCLI["stdio Adapter\n(dist/mcp/stdio.js)"]
  SQLite[("node:sqlite (WAL Mode)\n~/.local/share/kaj/tasks.db")]

  Browser <-->|"REST + SSE Live Sync"| Hono
  AgentHTTP <-->|"JSON-RPC /mcp"| MCPHttp
  AgentStdio <-->|"stdio JSON-RPC"| StdioCLI
  StdioCLI <-->|"HTTP Proxy / WAL Fallback"| MCPHttp

  Hono --> Domain
  MCPHttp --> Domain
  Domain <--> SQLite
  Domain --> Bus
  Bus -.->|"SSE Push"| Browser
```

---

## Getting Started

### Prerequisites

- **Node.js**: v26+ (recommended for built-in `node:sqlite`)
- **npm**: v11+
- **macOS** (or any modern Unix environment)

### Installation

Clone or navigate to the repository directory and install dependencies:

```bash
npm install
```

### Verification & Testing

Kaj strictly adheres to **Test-Driven Development (TDD)** and **Spec-Driven Development (SDD)**:

```bash
# Run unit & integration tests (< 5s)
npm run test:unit

# Run all test suites
npm test

# Verify 100% active criteria coverage and 0 hash drift via Spec Guardian
npm run audit:specs

# Run automated live UI verification (headless Chromium)
npm run test:ui
```

### Development & Build

```bash
# Start Vite development server
npm run dev

# Compile frontend assets and TypeScript server
npm run build

# Run in foreground (binds to 0.0.0.0:4820)
npm start
```

### Daemon Management & Auto-Start on Laptop Boot

Kaj includes a built-in background daemon manager (`scripts/daemon-ctl.sh`) that integrates directly with macOS `launchd` LaunchAgents, allowing the daemon to run silently in the background and automatically start whenever your laptop boots or logs in:

| Action                 | NPM Script                 | CLI Equivalent                      | Description                                                                 |
| :--------------------- | :------------------------- | :---------------------------------- | :-------------------------------------------------------------------------- |
| **Start Daemon**       | `npm run daemon:start`     | `./scripts/daemon-ctl.sh start`     | Starts Kaj in background (~75–95 MB RSS)                                    |
| **Stop Daemon**        | `npm run daemon:stop`      | `./scripts/daemon-ctl.sh stop`      | Gracefully stops the running daemon                                         |
| **Restart Daemon**     | `npm run daemon:restart`   | `./scripts/daemon-ctl.sh restart`   | Restarts daemon and reloads compiled code                                   |
| **Check Status**       | `npm run daemon:status`    | `./scripts/daemon-ctl.sh status`    | Displays PID, memory usage, and endpoints                                   |
| **View Live Logs**     | `npm run daemon:logs`      | `./scripts/daemon-ctl.sh logs`      | Tails live daemon logs (`~/.local/share/kaj/daemon.log`)                    |
| **Enable Auto-Start**  | `npm run daemon:install`   | `./scripts/daemon-ctl.sh install`   | Registers macOS LaunchAgent (`~/Library/LaunchAgents/com.kaj.daemon.plist`) |
| **Disable Auto-Start** | `npm run daemon:uninstall` | `./scripts/daemon-ctl.sh uninstall` | Unloads and removes the LaunchAgent                                         |

#### Setup Auto-Start on Boot (One-Time Setup)

```bash
# 1. Build latest code
npm run build

# 2. Register LaunchAgent with macOS
npm run daemon:install
```

Once installed, macOS manages Kaj automatically—rebooting or logging in will start the server and MCP endpoints with zero user interaction.

### Telegram Bot Integration (Zero-LLM, Ultra-Low Footprint)

Kaj includes a built-in, deterministic Telegram bot service (`src/server/telegram.ts`) that runs inside the existing daemon with **~0 MB extra memory overhead** and **no local LLM required**. It lets you capture tasks, search tasks, and trigger inline actions from your phone anywhere in the world.

#### 1. Configuration File (`telegram.config.json`)

Credentials and feature settings are stored in `telegram.config.json` in the project root (git-ignored so your token is never committed; see `telegram.config.example.json` for the template):

```json
{
  "enabled": false,
  "bot_token": "YOUR_TELEGRAM_BOT_TOKEN",
  "allowed_user_ids": [123456789],
  "default_status": "triage",
  "poll_interval_ms": 2000
}
```

- **How to get a `bot_token`**: Message `@BotFather` on Telegram → `/newbot` → copy the HTTP API token into `telegram.config.json`.
- **How to lock to your account (`allowed_user_ids`)**: Leave `allowed_user_ids` as `[]` initially, turn on the bot, and send `/start` to your bot. It will reply with `Your Telegram User ID: <number>`. Add that number to `allowed_user_ids` so only you can access or mutate your tasks.

#### 2. Switching the Feature Flag On & Off

You can toggle the Telegram bot on or off at any time without restarting your laptop:

| Action                   | NPM Script                | CLI Equivalent                            | Description                                                                 |
| :----------------------- | :------------------------ | :---------------------------------------- | :-------------------------------------------------------------------------- |
| **Enable Telegram Bot**  | `npm run telegram:on`     | `./scripts/daemon-ctl.sh telegram-on`     | Sets `"enabled": true` in `telegram.config.json` and activates live polling |
| **Disable Telegram Bot** | `npm run telegram:off`    | `./scripts/daemon-ctl.sh telegram-off`    | Sets `"enabled": false` and stops all Telegram network polling immediately  |
| **Check Bot Status**     | `npm run telegram:status` | `./scripts/daemon-ctl.sh telegram-status` | Shows config state, token presence, and live daemon polling status          |

_(You can also override the flag via environment variable `KAJ_TELEGRAM_ENABLED=true|false` or `POST /api/telegram/toggle` with `{"enabled": true}`)._

#### 3. Bot Commands & Shorthand Syntax

- **Add a Task** (just send any plain text message or `/add <text>`):
  - `Buy coffee beans` → creates task in `triage`
  - `Fix auth bug #Backend !today @tomorrow due:2026-11-05 wait:Alice`
    - `#ProjectName` — matches your project by name (case-insensitive)
    - `!today`, `!week`, `!month`, `!todo`, `!triage`, `!track` — sets target column & priority
    - `@today`, `@tomorrow`, `@YYYY-MM-DD` — sets Action Date
    - `due:today`, `due:tomorrow`, `due:YYYY-MM-DD` — sets Due Date
    - `wait:<note>` — sets Waiting On note
- **Search Tasks** (`/search <query>`, `/s <query>`, or `? <query>`):
  - Searches task titles, descriptions, and waiting notes, returning matching tasks with interactive **inline buttons** (`✓ Done`, `⚡ Today`, `📅 Week`, `Todo`).
- **Today's Tasks** (`/today`):
  - Lists all active tasks in `Today` with one-tap `✓ Done` and status move buttons.

---

### Multi-Device & WiFi Access (`jarvis.local`)

Kaj binds by default to `0.0.0.0:4820`, making it immediately accessible across your local WiFi/LAN network without reverse proxies or port configuration:

- **Local Machine**: `http://localhost:4820`
- **Other Devices on WiFi (Phones, Tablets, Laptops)**: `http://jarvis.local:4820` (or your machine's LAN IP, e.g. `http://192.168.1.146:4820`)

**Security & Origin Isolation**:
Kaj implements a dual **Host Header** and **Origin** guard against DNS rebinding and cross-site request forgery (CSRF):

- Requests from loopback (`localhost`, `127.0.0.1`), mDNS domains (`*.local`), and RFC 1918 private LAN IP blocks are authenticated and permitted.
- Cross-origin requests from arbitrary external websites (e.g. `evil.com`) attempting to probe or mutate tasks across your intranet are strictly rejected with `403 Forbidden`.

---

## Connecting MCP Clients

Kaj exposes its MCP server over both **Streamable HTTP** (`http://127.0.0.1:4820/mcp`) and **stdio** (`dist/mcp/stdio.js`).

### 1. Streamable HTTP (Recommended for Running Daemon)

Add to your agent or client configuration (e.g. Claude Code, Antigravity, or custom agent):

```json
{
  "mcpServers": {
    "kaj": {
      "url": "http://127.0.0.1:4820/mcp"
    }
  }
}
```

### 2. Stdio Transport (For Desktop Tools)

Add to `claude_desktop_config.json` or Cursor MCP settings:

```json
{
  "mcpServers": {
    "kaj": {
      "command": "node",
      "args": ["<path-to-repo>/dist/mcp/stdio.js"]
    }
  }
}
```

### MCP Tools Catalog

| Tool                | Access        | Description                                                                                                            |
| :------------------ | :------------ | :--------------------------------------------------------------------------------------------------------------------- |
| `query_tasks`       | `readOnly`    | Query tasks with filters (`status[]`, `project_id`, `priority[]`, `action_date` range, `due_date` range, text search). |
| `get_task`          | `readOnly`    | Retrieve full details of a task by ID.                                                                                 |
| `get_board_summary` | `readOnly`    | Compact snapshot of task counts per column and swimlane + active Tracking items.                                       |
| `create_task`       | Write         | Create a task with title, status, project, priority, action/due dates, repeat rule, waiting note, and details.         |
| `update_task`       | Write         | Partially update any attribute of an existing task.                                                                    |
| `move_task`         | Write         | Move a task across columns or project swimlanes with optional waiting notes.                                           |
| `complete_task`     | Write         | Mark a task as completed (triggers spawn-on-complete rollover if repeating).                                           |
| `delete_task`       | `destructive` | Soft-delete a task (sets `deleted_at`).                                                                                |
| `restore_task`      | Write         | Recover a soft-deleted task.                                                                                           |
| `list_projects`     | `readOnly`    | List all projects with task counts and sort order.                                                                     |
| `save_project`      | Write         | Create or update a project (name, color, sort order, archive status).                                                  |

---

## Repository Structure

```text
.
├── .agents/
│   └── skills/
│       └── kaj-test-protocol/   # Mandatory local test protocol for release governance
├── specs/                       # Formal EARS specifications (fingerprinted by Spec Guardian)
│   ├── tasks.md                 # TASK-001..005: Workflow, validation, recurrence, calendar
│   ├── projects.md              # PROJ-001..002: Projects, swimlane reordering, unassigned lane
│   ├── mcp.md                   # MCP-001..003: Tools, dual transport, safety annotations
│   ├── ui.md                    # UI-001..004: Bento layout, Chronos palette, calendar, modals
│   └── traceability.json        # Auto-compiled Spec Guardian traceability manifest
├── src/
│   ├── shared/                  # Domain types and Zod validation schemas
│   │   └── types.ts
│   ├── server/                  # Backend daemon
│   │   ├── db.ts                # node:sqlite WAL initialization and migrations
│   │   ├── repository.ts        # Task & Project repositories, recurrence engine, calendar
│   │   └── index.ts             # Daemon entrypoint
│   └── client/                  # Preact + Vite frontend (Bento × Chronos UI)
├── tests/
│   ├── unit/                    # Fast deterministic unit tests (< 5s)
│   ├── integration/             # Database and HTTP integration tests
│   └── e2e/                     # Playwright live UI verification tests
├── AGENTS.md                    # Operating guidelines and Prime Directives for AI agents
├── release.md                   # 6-Gate Release pipeline and version roadmap
├── package.json                 # Project manifest and scripts
└── tsconfig.json                # TypeScript configuration
```

---

## Engineering Standards

- **Spec-First Rule**: No code or tests are written without an approved EARS requirement in `specs/`. Code is annotated with `// [spec: REQ-ID]` and tests with `// [verifies: REQ-ID/AC-ID]`.
- **Strict TDD**: All logic is developed through the `Red → Green → Refactor` cycle.
- **Mandatory Live UI Verification**: Any UI change must be verified against the live app via automated headless browser tests and visual DOM review before completion.
- **Zero Drift Auditing**: Spec Guardian (`npm run audit:specs`) guarantees 100% active criteria coverage and cryptographic block hash integrity.

---

## License

MIT
