# Release Plan & Version Roadmap: kaj

## Release Strategy
- **Versioning**: Semantic Versioning (`MAJOR.MINOR.PATCH`).
- **Human-in-the-Loop Approval**: **Always ask the user for explicit confirmation before releasing any MAJOR or MINOR versions.**
- **Spec-Driven Governance**: Every release candidate must pass strict Spec Guardian verification (0 untested criteria, 0 hash drift).
- **Automated 6-Gate Release Pipeline**:
  1. Git working tree validation
  2. Architectural Compliance & Code Review Audit
  3. Spec Guardian strict audit (`python3 ~/.gemini/config/skills/spec-driven-development/scripts/guardian.py audit --strict`)
  4. Project Test Suite Execution (guided by local test skill)
  5. Code hygiene and linting/formatting (`ruff check --fix`, `ruff format`)
  6. Version bumping in project manifest and annotated Git release tagging (`vX.Y.Z`).

---

## Roadmap & Milestones (Latest at Top)

### Release `v0.1.0`: Initial Project Baseline
- **Status**: ✅ RELEASED
- **Focus**: Repository scaffolding, Spec-Driven Development baseline, and test verification.
- **Deliverables**:
  - [x] **CORE-001**: System Initialization & Configuration Validation ([src/core.py](src/core.py)).
- **Exit Criteria**: 100% active criteria verified (2/2 in Spec Guardian), full test suite pass, clean working tree.
