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

### Milestone `v0.1.0`: Project Inception & EARS Specification Baseline
- **Status**: 🔄 IN PROGRESS (Phase 1)
- **Focus**: Repository scaffolding, full EARS specification suite, strict TDD protocol, and SDD hash integrity.
- **Deliverables**:
  - [x] Repository architecture: Git, `.gitignore`, `package.json`, `tsconfig.json`, local test protocol, and operating guidelines.
  - [x] `specs/tasks.md`: Formal EARS specifications for Kanban workflow, sub-columns, independent priority, spawn-on-complete repeat rollover, and calendar date projection.
  - [x] `specs/projects.md`: Formal EARS specifications for project swimlanes, sorting, and unassigned inbox.
  - [x] `specs/mcp.md`: Formal EARS specifications for standard MCP tool suite, streamable HTTP & stdio transports, and soft-delete protection.
  - [x] `specs/ui.md`: Formal EARS specifications for Bento full-width layout, Chronos dark palette, interactive calendar, and light-dismiss task modal.
- **Exit Criteria**: All spec blocks normalized and fingerprinted in `specs/traceability.json`.
