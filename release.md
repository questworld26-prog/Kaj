# Release Plan & Version Roadmap: Kaj (কাজ)

## Release Strategy
- **Versioning**: Semantic Versioning (`MAJOR.MINOR.PATCH`).
- **Human-in-the-Loop Approval**: **Always ask the user for explicit confirmation before releasing any MAJOR or MINOR versions.**
- **Spec-Driven Governance**: Every release candidate must pass strict Spec Guardian verification (0 untested criteria, 0 hash drift).
- **Automated 6-Gate Release Pipeline**:
  1. Git working tree validation (clean working tree).
  2. Architectural Compliance & Code Review Audit.
  3. Spec Guardian strict audit (`npm run audit:specs`).
  4. Project Test Suite Execution (`npm run test:unit` & `npm run test:ui`).
  5. Code hygiene and linting/formatting.
  6. Version bumping in `package.json` and annotated Git release tagging (`vX.Y.Z`).

---

## Roadmap & Milestones (Latest at Top)

### Milestone `v0.1.0`: Project Inception & Core Engine Baseline
- **Status**: 🔄 IN PROGRESS (Phase 4 Completed)
- **Focus**: Repository scaffolding, full EARS specification suite, strict TDD domain & MCP engine, Bento × Chronos dark-mode UI, and SDD hash integrity.
- **Deliverables**:
  - [x] Repository architecture: Git, `.gitignore`, `package.json`, `tsconfig.json`, local test protocol, and operating guidelines.
  - [x] Formal EARS specifications for tasks, projects, MCP, and UI (`specs/*.md`).
  - [x] Phase 2 Domain & SQLite WAL Engine (28 criteria verified).
  - [x] Phase 3 Hono Daemon & Dual MCP Server:
    - [x] **MCP-001**: Standard Task & Project MCP tool suite (11 registered tools).
    - [x] **MCP-002**: Dual transport protocol support (Streamable HTTP `POST /mcp` + stdio CLI `src/mcp/stdio.ts` / `dist/mcp/stdio.js` with live SSE sync).
    - [x] **MCP-003**: Safety annotations (`readOnlyHint`, `destructiveHint`), soft-delete protection (`deleted_at`), and DNS rebinding origin guard.
    - [x] REST API and Server-Sent Events (`/events`) live sync hub.
  - [x] Phase 4: Bento × Chronos Dark-Mode UI with Live Playwright Verification:
    - [x] **UI-001**: Bento full-width 6-column Kanban board, rounded swimlane pods, dashed tracking cards, and swimlane reordering.
    - [x] **UI-002**: Chronos dark-mode design system (`#0E1111`, `#121718`, `#1C2224`, `#10B981`, `#EAB308`), accessible contrast.
    - [x] **UI-003**: Interactive Calendar view with Month and Week grids, Action (`▶`) and Due (`⚑`) badges, filter toggles, and Unscheduled sidebar.
    - [x] **UI-004**: Native `<dialog closedby="any">` task editor modal with light-dismiss, and Completed Archive slide-over drawer with 1-click restore.
    - [x] Live UI automated browser verification gate (Playwright Chromium, 11/11 tests passing).
  - [ ] Phase 5: macOS `launchd` Background Service Configuration & End-to-End Packaging.
- **Exit Criteria**: 100% active criteria verified in Spec Guardian (56/56), 44 unit & integration tests + 11 live UI Playwright tests passing, clean working tree.
