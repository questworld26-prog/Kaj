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
- **Status**: 🔄 IN PROGRESS (Phase 2 Completed)
- **Focus**: Repository scaffolding, full EARS specification suite, strict TDD domain engine, and SDD hash integrity.
- **Deliverables**:
  - [x] Repository architecture: Git, `.gitignore`, `package.json`, `tsconfig.json`, local test protocol, and operating guidelines.
  - [x] Formal EARS specifications for tasks, projects, MCP, and UI (`specs/*.md`).
  - [x] Phase 2 Domain & SQLite WAL Engine:
    - [x] **PROJ-001**: Project entity management and swimlane reordering.
    - [x] **PROJ-002**: Default Unassigned inbox swimlane.
    - [x] **TASK-001**: Six-column Kanban workflow with In Progress sub-columns (`Today`, `This Week`, `This Month`) and Tracking.
    - [x] **TASK-002**: Task data attributes & schema validation.
    - [x] **TASK-003**: Independence of status and priority horizons.
    - [x] **TASK-004**: Spawn-on-complete recurrence rollover (`weekly`, `monthly` with end-of-month clamping, `yearly`).
    - [x] **TASK-005**: Dual-date scheduling and Calendar projections across Week and Month views.
  - [ ] Phase 3: Hono Daemon & Dual MCP Server (`POST /mcp` + `dist/mcp/stdio.js`).
  - [ ] Phase 4: Bento × Chronos Dark-Mode UI with Live Playwright Verification.
  - [ ] Phase 5: macOS `launchd` Service & Final Audit.
- **Exit Criteria**: 100% active criteria verified in Spec Guardian, all unit tests passing (`< 5s`), clean working tree.
