# Agent Operating Guidelines & Protocol: kaj

This document defines the rules of engagement, architectural constraints, and verification protocols for any AI agent working on the **kaj** codebase.

---

## 1. Prime Directives

1. **Spec-First Rule**: NEVER write implementation code or test cases without an approved EARS specification in `specs/`. All code and tests must explicitly trace to an active requirement.
2. **Absolute Data Privacy**: NEVER send proprietary data, secrets, or internal documents to external cloud APIs. Keep secrets and databases strictly local and excluded from Git.
3. **Deterministic Verification**: Tests bound to acceptance criteria must assert exact values and behaviors. Vacuous assertions (`assert result is not None`, `assert len(items) > 0`) are strictly forbidden.
4. **Tool Execution via uv**: Always execute Python scripts, tests, and CLI tools using `uv` (e.g. `uv run pytest`).
5. **No Done Without Strict Audit**: An agent must NEVER mark a feature as completed without running the Spec Guardian strict audit (`python3 ~/.gemini/config/skills/spec-driven-development/scripts/guardian.py audit --strict`) and verifying 100% test coverage for all active criteria.
6. **Human-in-the-Loop Releases**: Always ask the user for explicit confirmation before creating any Major or Minor release tag.

---

## 2. Spec-Driven Development Annotations

- **Source Code (`src/`)**: Annotate implementing functions with `# [spec: REQ-ID]`.
- **Tests (`tests/`)**: Annotate tests with `# [verifies: REQ-ID/AC-ID]`.

---

## 3. Release Commands

- **List Releases**:
  ```bash
  python3 ~/.gemini/config/skills/release-management/scripts/release_manager.py list
  ```
- **Create Release**:
  ```bash
  python3 ~/.gemini/config/skills/release-management/scripts/release_manager.py create <VERSION> -m "<SUMMARY>"
  ```
