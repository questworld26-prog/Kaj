---
name: kaj-test-protocol
description: >-
  Defines the testing methodology, runner commands, test tiering, isolation rules,
  and mandatory Live UI verification gate for Kaj (কাজ). Enforced by Gate 4 in release management.
---

# Test Protocol: Kaj (কাজ)

This skill defines the official testing and verification protocol for **Kaj (কাজ)**.

---

## 1. Test Execution Commands

Execute the test suites via:

```bash
# Fast unit & integration tests (< 5s)
npm run test:unit

# All Vitest tests
npm test

# Live UI browser verification (Playwright headless Chromium)
npm run test:ui

# Spec Guardian strict audit (zero drift, 100% active criteria coverage)
npm run audit:specs
```

---

## 2. Test Execution Tiers

- **Fast Unit Tests (`tests/unit/`)**: Deterministic fast tests validating pure domain logic, date calculations, recurrence rollovers, and schema validation. Must complete in `< 5s`.
- **Integration Tests (`tests/integration/`)**: Validates `node:sqlite` WAL database operations, Hono REST routes, SSE event streaming, and MCP JSON-RPC tool endpoints.
- **Live UI End-to-End Verification (`tests/e2e/`)**: Runs the compiled or live server and executes headless browser checks to verify:
  1. The app boots with 200 OK on `127.0.0.1:4820`.
  2. Zero browser console errors or unhandled page errors.
  3. Kanban 6-column board and Project swimlane pods render with proper styles.
  4. Adding and editing a task via modal dialog persists to SQLite.
  5. Calendar view renders Action and Due date markers and drag-to-schedule updates state.
  6. Completing a repeating task spawns the next occurrence in `Todo`.

---

## 3. Strict TDD & Anti-Mirage Assertion Rules

1. **Red → Green → Refactor**: Write the failing test with `// [verifies: REQ/AC]` before writing implementation code with `// [spec: REQ]`.
2. **Anti-Mirage Assertions**: All test assertions must verify deterministic outputs, exact counts, and exact dates. Vacuous assertions (`expect(result).toBeDefined()`, `expect(items.length).toBeGreaterThan(0)`) are forbidden.
3. **Database Isolation**: Unit and integration tests must run against isolated temporary or in-memory SQLite instances (`:memory:` or temporary disk files). Production databases must never be touched during testing.
4. **Mandatory Live UI Verification**: No UI work is done without running the live app and confirming UI functionality.
