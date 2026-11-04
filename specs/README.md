# Specifications Directory (`specs/`)

This directory houses all formal system requirements written in **Easy Approach to Requirements Syntax (EARS)**.
Specifications enforce an airtight two-way contract between system requirements (`specs/`), production implementation (`src/`), and automated test suites (`tests/`).

---

## 1. EARS Formulation Patterns

Every requirement must strictly adopt one of the 5 standard EARS patterns:

| Pattern | Template Syntax | Description / When to Use |
| :--- | :--- | :--- |
| **Ubiquitous** | *The system shall [response]* | Continuous, universal behavior with no trigger or condition. |
| **Event-driven** | *When [trigger], the system shall [response]* | Triggered by an event, user action, message, or signal. |
| **State-driven** | *While [in state], the system shall [response]* | Active only while the system or entity remains in a specific state. |
| **Unwanted behaviour** | *If [condition / error], then the system shall [response]* | Error handling, boundary violations, exceptions, and recovery. |
| **Optional feature** | *Where [feature flag / config enabled], the system shall [response]* | Configurable features, optional modules, or tenant-specific settings. |

---

## 2. Requirement Structure & `[PLANNED]` Roadmap Lifecycle

### Active Requirements
Active requirements MUST be implemented immediately. Any active requirement lacking code or test coverage fails `audit --strict`.

```markdown
## [MODULE]-[NUMBER]: [Descriptive Title]

[Concise EARS Statement]

Acceptance Criteria:
- AC-[MODULE]-[NUMBER].1: [Deterministic Criterion 1]
- AC-[MODULE]-[NUMBER].2: [Deterministic Criterion 2]
```

### Planned Roadmap Requirements (`[PLANNED]`)
To author multi-phase architecture or roadmap requirements upfront, append `[PLANNED]` to the heading:

```markdown
## [MODULE]-[NUMBER]: [Future Feature Title] [PLANNED]

When [trigger], the system shall [response].

Acceptance Criteria:
- AC-[MODULE]-[NUMBER].1: [Planned Criterion 1]
```

#### Lifecycle Rules Enforced by Spec Guardian:
- **`PLANNED`**: Allowed during incremental rollout; passes `audit --strict` (roadmap tracking).
- **`PREMATURE_IMPL`**: If an agent adds code or tests for a `[PLANNED]` requirement before `[PLANNED]` is removed from the spec, `audit --strict` fails immediately.
- **`UNIMPLEMENTED`**: Active spec with missing code fails `--strict`.
- **`REGRESSION`**: Monotonic ratchet! Once a requirement is `VERIFIED` in `traceability.json`, removing implementation or test cases triggers `REGRESSION`.

---

## 3. Bi-Directional Code & Test Traceability

### Source Code Binding (`src/`)
Every source file and key architectural unit in `src/` MUST declare its bound requirement:
```typescript
// [spec: PROJ-001]
export class ProjectRepository { ... }
```

### Test Binding (`tests/`) — Strict 1-Test-to-1-AC Cardinality
Every test case in `tests/` MUST carry **exactly 1** verification tag directly above the test block:
```typescript
// [verifies: PROJ-001/AC-PROJ-001.1]
it("creates project with unique id, name, color, and sort order", () => {
  ...
});
```

*Note*: Multiple test cases may verify the same AC (e.g., edge cases and stress tests), but a single test case cannot stack multiple tags.

---

## 4. Spec Guardian Verification Commands

```bash
# Strict Bi-Directional Audit (pre-commit gatekeeper):
npm run audit:specs
# or:
python3 tools/guardian.py audit --strict

# Update verified hashes after intentional spec modifications:
python3 tools/guardian.py audit --update-hashes

# Full milestone verification (fails if any [PLANNED] specs remain unfulfilled):
python3 tools/guardian.py audit --strict --all

# Formatted console/markdown report without updating traceability.json:
python3 tools/guardian.py report
```

---

## 5. Traceability Manifest (`specs/traceability.json`)

The source of truth maintained by Spec Guardian:
- Tracks requirement titles, spec files, `is_planned` state, and normalized SHA-256 hashes.
- Records reverse traceability statistics (untagged files, untagged test cases, orphan tags).
- Enforces cryptographic zero drift: any unapproved modification to spec text triggers `HASH_DRIFT`.
