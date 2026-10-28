# Agent Operating Guidelines & Protocol: Kaj (কাজ)

This document defines the rules of engagement, architectural constraints, and verification protocols for any AI agent working on the **Kaj (কাজ)** codebase.

---

## 1. Prime Directives

1. **Spec-First Rule**: NEVER write implementation code or test cases without an approved EARS specification in `specs/`. All code and tests must explicitly trace to an active requirement (`// [spec: REQ-ID]` and `// [verifies: REQ-ID/AC-ID]`).
2. **Strict Test-Driven Development (TDD)**: Always follow the **Red → Green → Refactor** cycle:
   - Write deterministic failing unit/integration tests first (`Red`).
   - Run tests to confirm the failure mode.
   - Write the minimal production code to satisfy the requirement (`Green`).
   - Refactor cleanly and ensure zero drift.
3. **Mandatory Live UI Verification Gate**:
   - For any UI feature, styling, or interaction change, **running the live app and verifying the UI is MANDATORY** before marking the task or story as done.
   - Start the local daemon, execute automated browser tests (`Playwright`), and verify DOM rendering, interactions, and visual layout without console/page errors.
4. **Low Memory Footprint Architecture**:
   - The background daemon MUST remain low-footprint (~75–95 MB RSS under traffic).
   - Use Node 26 built-in `node:sqlite` in WAL mode (`PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;`).
   - Avoid heavy runtimes or bundled browser processes in the background daemon.
5. **Standard Model Context Protocol (MCP)**:
   - Provide clean, robust CRUD and query operations for tasks and projects over Streamable HTTP (`POST /mcp`) and stdio (`dist/mcp/stdio.js`).
   - Tools must declare precise input schemas (`Zod`), annotations (`readOnlyHint`, `destructiveHint`), and error states.
6. **No Done Without Strict Audit**:
   - An agent must NEVER mark a feature or milestone as completed without running the Spec Guardian strict audit (`npm run audit:specs`) and verifying 0 missing implementations, 0 untested criteria, and 0 hash drifts.
7. **Human-in-the-Loop Releases**:
   - Always ask the user for explicit confirmation before creating any Major or Minor release tag.

---

## 2. Spec-Driven Development Annotations

- **Source Code (`src/`)**: Annotate implementing functions/classes with:
  ```typescript
  // [spec: REQ-ID]
  ```
- **Tests (`tests/`)**: Annotate verifying tests with:
  ```typescript
  // [verifies: REQ-ID/AC-ID]
  ```

---

## 3. Core Verification Commands

- **Unit & Integration Tests**:
  ```bash
  npm run test:unit
  ```
- **Live UI End-to-End Verification**:
  ```bash
  npm run test:ui
  ```
- **Spec Guardian Strict Audit**:
  ```bash
  npm run audit:specs
  ```
