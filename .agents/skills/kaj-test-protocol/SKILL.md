---
name: kaj-test-protocol
description: >-
  Defines the testing methodology, runner commands, test tiering, and isolation rules
  for kaj. Enforced by [Gate 4] Test Suite Execution in release management.
---

# Test Protocol: kaj

This skill defines the official testing process for **kaj**.

---

## 1. Test Command & Execution

Execute the test suite via:
```bash
uv run pytest
```

### Targeted Execution
```bash
uv run pytest tests/test_core.py
```

---

## 2. Test Execution Tiers

- **Fast Unit Tests**: Deterministic fast tests validating pure logic, schemas, and math. Must run in `< 5s`.
- **Integration Tests**: Tests database, file I/O, or local service boundaries.
- **Heavy / Live Inference (Opt-In)**: Heavy multi-model or network tests isolated from standard pre-commit runs.

---

## 3. Anti-Mirage Assertion Rules

1. All test assertions must verify deterministic outputs and exact numeric/factual anchors.
2. Vacuous assertions (`assert result is not None`, `assert len(items) > 0`) are strictly forbidden.
3. Tests must never depend on the presence or contents of live user files or production databases; use temporary fixtures (`tmp_path`).
