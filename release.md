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
- **Status**: 🔄 IN PROGRESS (Phase 3 Completed)
- **Focus**: Repository scaffolding, full EARS specification suite, strict TDD domain & MCP engine, and SDD hash integrity.
- **Deliverables**:
  - [x] Repository architecture: Git, `.gitignore`, `package.json`, `tsconfig.json`, local test protocol, and operating guidelines.
  - [x] Formal EARS specifications for tasks, projects, MCP, and UI (`specs/*.md`).
  - [x] Phase 2 Domain & SQLite WAL Engine (28 criteria verified).
  - [x] Phase 3 Hono Daemon & Dual MCP Server:
    - [x] **MCP-001**: Standard Task & Project MCP tool suite (11 registered tools).
    - [x] **MCP-002**: Dual transport protocol support (Streamable HTTP `POST /mcp` + stdio CLI `src/mcp/stdio.ts` / `dist/mcp/stdio.js` with live SSE sync).
    - [x] **MCP-003**: Safety annotations (`readOnlyHint`, `destructiveHint`), soft-delete protection (`deleted_at`), and DNS rebinding origin guard.
    - [x] REST API and Server-Sent Events (`/events`) live sync hub.
  - [ ] Phase 4: Bento × Chronos Dark-Mode UI with Live Playwright Verification.
  - [ ] Phase 5: macOS `launchd` Service & Final Audit.
- **Exit Criteria**: 100% active criteria verified in Spec Guardian (41/41), all 44 unit & integration tests passing (`< 1s`), clean working tree.
