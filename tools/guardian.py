#!/usr/bin/env python3
"""
Spec Guardian: Airtight Two-Way EARS Specification & Traceability Auditor
Bundled with the global 'spec-driven-development' Antigravity skill.
Zero external dependencies (pure Python 3.9+ standard library).

Enforces Bi-Directional Spec-Driven Development (SDD) & Semantic Anti-Mirage Checks:
1. Forward Traceability (Spec -> Code & Tests):
   - Active requirements MUST be implemented in src/ and 100% verified in tests/.
   - Planned requirements (tagged [PLANNED]) are tracked on the roadmap without failing --strict,
     but FAIL immediately if implemented prematurely in src/ or tests/ before [PLANNED] is removed.
   - Monotonic Ratchet: Once a requirement is VERIFIED in traceability.json, it cannot silently
     regress to UNIMPLEMENTED.
   - Cryptographic SHA-256 Hashing: Detects any unapproved spec text or AC drift.
2. Reverse Traceability (Code & Tests -> Spec):
   - Blocks AI feature creep: Every non-ambient source file in src/ must carry a valid [spec: REQ-ID] annotation.
   - Every test function/case in tests/ must carry a valid [verifies: REQ-ID/AC-ID] annotation.
   - Rejects orphan/hallucinated tags referencing non-existent requirement or acceptance criterion IDs.
3. Anti-Stacking & Semantic Alignment:
   - Layer 1 (1-Test-to-1-AC Cardinality): Each test case may carry at most 1 [verifies] tag.
   - Layer 4 (AC Backtick-Identifier Anchor Check): Backticked code identifiers in an AC description
     must appear in the bound src/ or tests/ tokens.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass, field
try:
    from datetime import UTC, datetime
except ImportError:
    from datetime import datetime, timezone
    UTC = timezone.utc
import hashlib
import json
from pathlib import Path
import re
import sys


# ============================================================================
# 1. Spec Parsing, [PLANNED] Lifecycle & Normalization
# ============================================================================

REQ_HEADING_REGEX = re.compile(
    r"^##\s+([A-Z0-9\-]+):\s+(.+?)(?:\s+\[(PLANNED)\])?\s*$",
    re.MULTILINE | re.IGNORECASE,
)
AC_REGEX = re.compile(r"^-\s+(AC-[A-Z0-9\-\.]+):\s*(.+)$", re.MULTILINE)
STATUS_PLANNED_REGEX = re.compile(r"^(?:Status|State):\s*\[?PLANNED\]?\s*$", re.MULTILINE | re.IGNORECASE)
BACKTICK_IDENT_REGEX = re.compile(r"`([a-zA-Z_][a-zA-Z0-9_]*)`")


@dataclass
class RequirementBlock:
    req_id: str
    title: str
    spec_path: Path
    statement: str
    is_planned: bool = False
    acceptance_criteria: list[str] = field(default_factory=list)
    ac_texts: dict[str, str] = field(default_factory=dict)
    raw_block: str = ""
    normalized_block: str = ""
    sha256: str = ""


def normalize_block(text: str) -> str:
    """Normalize requirement block to prevent false-positive hash drift from whitespace."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [line.strip() for line in text.split("\n")]
    while lines and not lines[0]:
        lines.pop(0)
    while lines and not lines[-1]:
        lines.pop()
    return "\n".join(lines)


def hash_text(text: str) -> str:
    """Compute SHA-256 hash of normalized text string."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def parse_spec_file(file_path: Path) -> list[RequirementBlock]:
    """Parse a single EARS markdown spec file into structured RequirementBlocks."""
    try:
        content = file_path.read_text(encoding="utf-8")
    except Exception:
        return []

    matches = list(REQ_HEADING_REGEX.finditer(content))
    if not matches:
        return []

    requirements: list[RequirementBlock] = []

    for i, match in enumerate(matches):
        req_id = match.group(1).strip().upper()
        title = match.group(2).strip()
        heading_planned = bool(match.group(3))
        start_idx = match.start()
        end_idx = matches[i + 1].start() if i + 1 < len(matches) else len(content)

        raw_block = content[start_idx:end_idx]
        normalized = normalize_block(raw_block)
        block_hash = hash_text(normalized)

        ac_matches = AC_REGEX.findall(raw_block)
        criteria_ids = [ac[0].strip().upper() for ac in ac_matches]
        ac_texts = {ac[0].strip().upper(): ac[1].strip() for ac in ac_matches}

        parts = re.split(r"Acceptance Criteria:", raw_block, flags=re.IGNORECASE)
        statement_text = ""
        body_planned = False
        if parts:
            heading_line = match.group(0)
            before_ac = parts[0].replace(heading_line, "", 1)
            body_planned = bool(STATUS_PLANNED_REGEX.search(before_ac))
            statement_text = normalize_block(before_ac)

        block = RequirementBlock(
            req_id=req_id,
            title=title,
            spec_path=file_path,
            statement=statement_text,
            is_planned=heading_planned or body_planned,
            acceptance_criteria=criteria_ids,
            ac_texts=ac_texts,
            raw_block=raw_block,
            normalized_block=normalized,
            sha256=block_hash,
        )
        requirements.append(block)

    return requirements


def parse_specs_directory(specs_dir: Path) -> list[RequirementBlock]:
    """Recursively parse all .md spec files in specs directory."""
    all_reqs: list[RequirementBlock] = []
    if not specs_dir.exists():
        return all_reqs

    for md_file in sorted(specs_dir.rglob("*.md")):
        if md_file.name.lower() in ("readme.md", "architecture.md"):
            continue
        all_reqs.extend(parse_spec_file(md_file))
    return all_reqs


# ============================================================================
# 2. Forward, Reverse & Semantic Codebase Scanning
# ============================================================================

SPEC_TAG_REGEX = re.compile(r"\[spec:\s*([A-Z0-9\-]+)\]", re.IGNORECASE)
VERIFIES_TAG_REGEX = re.compile(r"\[verifies:\s*([A-Z0-9\-]+/[A-Z0-9\-\.]+)\]", re.IGNORECASE)
TEST_CASE_REGEX = re.compile(r"^\s*(?:it|test)(?:\.only|\.skip)?\s*\(", re.MULTILINE)
PY_TEST_DEF_REGEX = re.compile(r"^\s*def\s+(test_[a-zA-Z0-9_]+)\s*\(", re.MULTILINE)

CODE_EXTENSIONS = ("*.py", "*.ts", "*.tsx", "*.js", "*.jsx", "*.go", "*.rs", "*.java", "*.c", "*.cpp", "*.cs")


@dataclass
class CodeLocation:
    file_path: Path
    line_number: int
    symbol_name: str = ""
    tag_content: str = ""


def _rel_path(path: Path, base: Path) -> str:
    try:
        return str(path.resolve().relative_to(base.resolve()))
    except Exception:
        return str(path)


def scan_file_for_tags(file_path: Path, pattern: re.Pattern) -> list[tuple[str, CodeLocation]]:
    """Scan a source or test file for matches of a specific tag regex pattern."""
    results: list[tuple[str, CodeLocation]] = []
    try:
        lines = file_path.read_text(encoding="utf-8").splitlines()
    except Exception:
        return results

    for line_idx, line in enumerate(lines, start=1):
        for match in pattern.finditer(line):
            tag_id = match.group(1).strip().upper()
            loc = CodeLocation(
                file_path=file_path,
                line_number=line_idx,
                tag_content=line.strip(),
            )
            results.append((tag_id, loc))
    return results


def scan_codebase_tags(
    src_dir: Path, tests_dir: Path
) -> tuple[dict[str, list[CodeLocation]], dict[str, list[CodeLocation]]]:
    """Scan src/ for [spec: REQ] and tests/ for [verifies: REQ/AC]."""
    implementations: dict[str, list[CodeLocation]] = {}
    verifications: dict[str, list[CodeLocation]] = {}

    if src_dir.exists():
        for ext in CODE_EXTENSIONS:
            for source_file in src_dir.rglob(ext):
                if any(p.startswith(".") for p in source_file.parts):
                    continue
                for req_id, loc in scan_file_for_tags(source_file, SPEC_TAG_REGEX):
                    implementations.setdefault(req_id, []).append(loc)

    if tests_dir.exists():
        for ext in CODE_EXTENSIONS:
            for test_file in tests_dir.rglob(ext):
                if any(p.startswith(".") for p in test_file.parts):
                    continue
                for ac_key, loc in scan_file_for_tags(test_file, VERIFIES_TAG_REGEX):
                    verifications.setdefault(ac_key, []).append(loc)

    return implementations, verifications


@dataclass
class SemanticAuditData:
    stacked_test_tags: list[str] = field(default_factory=list)
    weak_test_assertions: list[str] = field(default_factory=list)
    cross_link_mismatches: list[str] = field(default_factory=list)
    ac_anchor_mismatches: list[str] = field(default_factory=list)


def scan_reverse_and_semantic_traceability(
    requirements: list[RequirementBlock],
    src_dir: Path,
    tests_dir: Path,
    base_dir: Path,
) -> tuple[list[str], list[str], list[str], list[str], SemanticAuditData]:
    """
    Scan src/ and tests/ for:
    1. Untagged source files (excluding .d.ts ambient definitions)
    2. Untagged test cases (TS/JS it/test blocks and Python def test_* functions)
    3. Orphan tags (referencing non-existent REQ-ID or AC-ID)
    4. Layer 1: Anti-Stacking (prohibits multiple [verifies] tags attached to a single test)
    5. Layer 4: AC Backtick Anchor check (backticked identifiers in AC text must exist in bound tokens)
    """
    untagged_files: list[str] = []
    untagged_src_symbols: list[str] = []
    untagged_tests: list[str] = []
    orphan_tags: list[str] = []
    semantic = SemanticAuditData()

    known_req_ids = {r.req_id for r in requirements}
    known_ac_keys = set()
    for r in requirements:
        for ac in r.acceptance_criteria:
            known_ac_keys.add(f"{r.req_id}/{ac}")

    req_src_tokens: dict[str, set[str]] = {}
    ac_test_tokens: dict[str, set[str]] = {}

    # 1. Scan src/
    if src_dir.exists():
        for ext in CODE_EXTENSIONS:
            for source_file in sorted(src_dir.rglob(ext)):
                if source_file.name.endswith(".d.ts") or any(p.startswith(".") for p in source_file.parts):
                    continue
                rel = _rel_path(source_file, base_dir)
                try:
                    text = source_file.read_text(encoding="utf-8")
                except Exception:
                    continue
                if not text.strip():
                    continue

                file_tags = [m.strip().upper() for m in SPEC_TAG_REGEX.findall(text)]
                if not file_tags:
                    untagged_files.append(rel)

                for tag in file_tags:
                    if tag not in known_req_ids:
                        orphan_tags.append(f"{rel} -> [spec: {tag}] (unknown requirement)")

                tokens = set(re.findall(r"[a-zA-Z_][a-zA-Z0-9_]*", text))
                for tag in set(file_tags):
                    req_src_tokens.setdefault(tag, set()).update(tokens)

    # 2. Scan tests/
    if tests_dir.exists():
        for ext in CODE_EXTENSIONS:
            for test_file in sorted(tests_dir.rglob(ext)):
                if any(p.startswith(".") for p in test_file.parts):
                    continue
                rel = _rel_path(test_file, base_dir)
                try:
                    raw = test_file.read_text(encoding="utf-8")
                except Exception:
                    continue
                lines = raw.splitlines()

                # Check orphan tags in test file
                for line_no, line in enumerate(lines, start=1):
                    for m in VERIFIES_TAG_REGEX.finditer(line):
                        ac_key = m.group(1).strip().upper()
                        if ac_key not in known_ac_keys:
                            orphan_tags.append(f"{rel}:{line_no} -> [verifies: {ac_key}] (unknown criterion)")

                # Collect test blocks
                test_locations: list[tuple[int, str]] = []
                is_python = test_file.suffix == ".py"

                for i, line in enumerate(lines):
                    if is_python:
                        m = re.match(r"^\s*def\s+(test_[a-zA-Z0-9_]+)\s*\(", line)
                        if m:
                            test_locations.append((i, m.group(1)))
                    else:
                        if re.search(r"^\s*(?:it|test)(?:\.only|\.skip)?\s*\(", line):
                            name_match = re.search(r"[\"'\`](.*?)[\"'\`]", line)
                            desc = name_match.group(1) if name_match else f"test at line {i+1}"
                            test_locations.append((i, desc))

                file_tokens = set(re.findall(r"[a-zA-Z_][a-zA-Z0-9_]*", raw))

                for line_idx, desc in test_locations:
                    # Walk upward to collect attached [verifies: ...] comments
                    attached_tags: list[str] = []
                    curr = line_idx - 1
                    while curr >= 0:
                        s = lines[curr].strip()
                        if not s:
                            curr -= 1
                            continue
                        if s.startswith("//") or s.startswith("/*") or s.startswith("*") or s.startswith("#"):
                            for m in VERIFIES_TAG_REGEX.finditer(s):
                                attached_tags.insert(0, m.group(1).strip().upper())
                            curr -= 1
                        else:
                            break

                    if not attached_tags:
                        untagged_tests.append(f"{rel}:{line_idx + 1} -> {desc}")
                        continue

                    # Layer 1: Anti-Stacking Check
                    if len(attached_tags) > 1:
                        semantic.stacked_test_tags.append(
                            f"{rel}:{line_idx + 1} -> '{desc}' stacks {len(attached_tags)} tags: {', '.join(attached_tags)}"
                        )

                    for tag in attached_tags:
                        ac_test_tokens.setdefault(tag, set()).update(file_tokens)

    # 3. Layer 4: AC Backtick Anchor Verification
    for r in requirements:
        src_tokens = req_src_tokens.get(r.req_id, set())
        for ac_id, ac_text in r.ac_texts.items():
            key = f"{r.req_id}/{ac_id}"
            test_tokens = ac_test_tokens.get(key, set())
            combined = src_tokens | test_tokens
            idents = BACKTICK_IDENT_REGEX.findall(ac_text)
            for ident in idents:
                # Ignore common keywords, single chars, or format placeholders
                if ident.lower() in ("x", "true", "false", "null", "undefined", "e", "g", "d", "y", "m"):
                    continue
                if ident not in combined:
                    semantic.ac_anchor_mismatches.append(
                        f"`{key}` specifies `{ident}`, but it was not found in bound `{r.req_id}` code or `{ac_id}` tests"
                    )

    return untagged_files, untagged_src_symbols, untagged_tests, orphan_tags, semantic


# ============================================================================
# 3. Audit Engine & Reporting
# ============================================================================

@dataclass
class RequirementAuditStatus:
    req_id: str
    title: str
    spec_path: str
    sha256: str
    is_planned: bool
    acceptance_criteria: list[str]
    implementation_files: list[str] = field(default_factory=list)
    verified_criteria: list[str] = field(default_factory=list)
    unverified_criteria: list[str] = field(default_factory=list)
    status: str = "PENDING"  # VERIFIED | UNTESTED_CRITERIA | UNIMPLEMENTED | PLANNED | PREMATURE_IMPL | REGRESSION | HASH_DRIFT


@dataclass
class AuditReport:
    total_requirements: int = 0
    total_criteria: int = 0
    drifted_requirements: list[str] = field(default_factory=list)
    premature_requirements: list[str] = field(default_factory=list)
    regressed_requirements: list[str] = field(default_factory=list)
    requirement_statuses: list[RequirementAuditStatus] = field(default_factory=list)
    untagged_files: list[str] = field(default_factory=list)
    untagged_src_symbols: list[str] = field(default_factory=list)
    untagged_tests: list[str] = field(default_factory=list)
    orphan_tags: list[str] = field(default_factory=list)
    semantic: SemanticAuditData = field(default_factory=SemanticAuditData)
    show_all: bool = False

    @property
    def active_statuses(self) -> list[RequirementAuditStatus]:
        if self.show_all:
            return self.requirement_statuses
        return [s for s in self.requirement_statuses if not s.is_planned]

    @property
    def planned_statuses(self) -> list[RequirementAuditStatus]:
        return [s for s in self.requirement_statuses if s.is_planned]

    @property
    def active_untested_criteria(self) -> list[str]:
        active_untested = []
        for s in self.active_statuses:
            active_untested.extend([f"{s.req_id}/{ac}" for ac in s.unverified_criteria])
        return active_untested

    @property
    def has_strict_violations(self) -> bool:
        """Returns True if there is any violation that should fail --strict."""
        # Any active requirement not fully VERIFIED
        has_unverified_active = any(s.status != "VERIFIED" for s in self.active_statuses)
        # Any reverse or semantic violations
        has_reverse_violations = bool(
            self.untagged_files
            or self.untagged_tests
            or self.orphan_tags
            or self.semantic.stacked_test_tags
            or self.semantic.ac_anchor_mismatches
        )
        return (
            has_unverified_active
            or bool(self.drifted_requirements)
            or bool(self.premature_requirements)
            or bool(self.regressed_requirements)
            or has_reverse_violations
        )

    def to_markdown(self) -> str:
        active = self.active_statuses
        planned = self.planned_statuses
        active_criteria_count = sum(len(s.acceptance_criteria) for s in active)
        active_verified_count = sum(len(s.verified_criteria) for s in active)
        pct = 0 if not active_criteria_count else (active_verified_count * 100 // active_criteria_count)

        verdict = "❌ ACTION REQUIRED" if self.has_strict_violations else "✅ ALL ACTIVE SPECS VERIFIED"

        lines = [
            "# Spec Guardian Bi-Directional Audit Report",
            f"Generated: {datetime.now(UTC).strftime('%Y-%m-%d %H:%M:%S UTC')}",
            "",
            "## 1. Executive Summary",
            f"- **Active Requirements**:     {len(active)} active ({sum(1 for s in active if s.implementation_files)} implemented, {sum(1 for s in active if not s.implementation_files)} missing)",
            f"- **Planned Roadmap (`[PLANNED]`)**: {len(planned)} deferred for future iterations",
            f"- **Active Criteria Verified**: {active_verified_count} / {active_criteria_count} ({pct}%)",
            f"- **Reverse Traceability**:     {'✅ 100% Bound' if not (self.untagged_files or self.untagged_tests or self.orphan_tags) else '❌ Violations Detected'} ({len(self.untagged_files)} untagged files, {len(self.untagged_tests)} untagged tests, {len(self.orphan_tags)} orphan tags)",
            f"- **Semantic & Anti-Stacking**: {'✅ Airtight' if not (self.semantic.stacked_test_tags or self.semantic.ac_anchor_mismatches) else '❌ Violations Detected'} ({len(self.semantic.stacked_test_tags)} stacked tags, {len(self.semantic.ac_anchor_mismatches)} AC anchor mismatches)",
            f"- **Hash Drift Violations**:    {len(self.drifted_requirements)}",
            f"- **Audit Verdict**:            {verdict}",
            "",
            "## 2. Active Requirements Traceability Matrix",
            "| Req ID | Title | Spec File | Status | Code Bound | ACs Verified | SHA-256 |",
            "| :--- | :--- | :--- | :--- | :--- | :--- | :--- |",
        ]

        if not active:
            lines.append("| *(None)* | No active requirements | — | ⏳ `PLANNED` | No | 0/0 | — |")
        else:
            for s in active:
                status_icon = (
                    "✅ `VERIFIED`"
                    if s.status == "VERIFIED"
                    else (
                        "❌ `UNIMPLEMENTED`"
                        if s.status == "UNIMPLEMENTED"
                        else (
                            "⚠️ `UNTESTED_CRITERIA`"
                            if s.status == "UNTESTED_CRITERIA"
                            else (
                                "❌ `REGRESSION`"
                                if s.status == "REGRESSION"
                                else f"❌ `{s.status}`"
                            )
                        )
                    )
                )
                tested_summary = f"{len(s.verified_criteria)}/{len(s.acceptance_criteria)}"
                impl_str = f"Yes ({len(s.implementation_files)})" if s.implementation_files else "No"
                title_trunc = s.title if len(s.title) <= 45 else s.title[:42] + "..."
                spec_fname = Path(s.spec_path).name
                lines.append(
                    f"| `{s.req_id}` | {title_trunc} | `{spec_fname}` | {status_icon} | {impl_str} | {tested_summary} | `{s.sha256[:10]}` |"
                )

        if planned and self.show_all:
            lines.extend([
                "",
                "## 3. Planned / Roadmap Requirements (`[PLANNED]`)",
                "| Req ID | Title | Spec File | Status | Planned ACs | SHA-256 |",
                "| :--- | :--- | :--- | :--- | :--- | :--- |",
            ])
            for s in planned:
                spec_fname = Path(s.spec_path).name
                title_trunc = s.title if len(s.title) <= 45 else s.title[:42] + "..."
                status_icon = "⏳ `PLANNED`" if s.status == "PLANNED" else f"❌ `{s.status}`"
                lines.append(
                    f"| `{s.req_id}` | {title_trunc} | `{spec_fname}` | {status_icon} | {len(s.acceptance_criteria)} planned | `{s.sha256[:10]}` |"
                )

        # Reverse Traceability Details
        if self.untagged_files or self.untagged_tests or self.orphan_tags:
            lines.extend(["", "## 4. Reverse Traceability Violations"])
            if self.untagged_files:
                lines.append("### Untagged Source Files (missing `[spec: REQ-ID]`):")
                for uf in self.untagged_files:
                    lines.append(f"- ❌ `{uf}`")
            if self.untagged_tests:
                lines.append("### Untagged Test Cases (missing `[verifies: REQ-ID/AC-ID]`):")
                for ut in self.untagged_tests:
                    lines.append(f"- ❌ `{ut}`")
            if self.orphan_tags:
                lines.append("### Orphan / Hallucinated Tags (referencing unknown IDs):")
                for ot in self.orphan_tags:
                    lines.append(f"- ❌ `{ot}`")

        # Semantic Violations
        if self.semantic.stacked_test_tags or self.semantic.ac_anchor_mismatches:
            lines.extend(["", "## 5. Semantic & Anti-Stacking Violations"])
            if self.semantic.stacked_test_tags:
                lines.append("### Layer 1: Stacked Test Tags (1-test-to-1-AC violation):")
                for st in self.semantic.stacked_test_tags:
                    lines.append(f"- ❌ {st}")
            if self.semantic.ac_anchor_mismatches:
                lines.append("### Layer 4: AC Backtick Anchor Mismatches:")
                for am in self.semantic.ac_anchor_mismatches:
                    lines.append(f"- ❌ {am}")

        # Untested criteria & drift
        untested = self.active_untested_criteria
        if untested:
            lines.extend(["", "## 6. Untested Criteria (Action Required)"])
            for ac in untested:
                lines.append(f"- ⚠️ `{ac}`")

        if self.drifted_requirements:
            lines.extend(["", "## 7. Hash Drift Detected (Run with `--update-hashes` after verifying)"])
            for d in self.drifted_requirements:
                lines.append(f"- ❌ `{d}`")

        if self.premature_requirements:
            lines.extend(["", "## 8. Premature Implementation Detected (`[PLANNED]` spec implemented early)"])
            for p in self.premature_requirements:
                lines.append(f"- ❌ `{p}`")

        if self.regressed_requirements:
            lines.extend(["", "## 9. Regression Detected (Previously VERIFIED requirement has lost implementation/tests)"])
            for r in self.regressed_requirements:
                lines.append(f"- ❌ `{r}`")

        return "\n".join(lines)


def audit_specs(
    spec_dir: Path,
    src_dir: Path,
    tests_dir: Path,
    base_dir: Path,
    traceability_path: Path | None = None,
    show_all: bool = False,
    update_hashes: bool = False,
) -> AuditReport:
    """Audit all specs against src/ and tests/, enforcing bi-directional SDD."""
    requirements = parse_specs_directory(spec_dir)
    implementations, verifications = scan_codebase_tags(src_dir, tests_dir)
    untagged_files, untagged_src_symbols, untagged_tests, orphan_tags, semantic = (
        scan_reverse_and_semantic_traceability(requirements, src_dir, tests_dir, base_dir)
    )

    existing_hashes: dict[str, str] = {}
    existing_statuses: dict[str, str] = {}
    if traceability_path and traceability_path.exists():
        try:
            with open(traceability_path, encoding="utf-8") as f:
                data = json.load(f)
                for req in data.get("requirements", []):
                    r_id = req["requirement_id"].upper()
                    existing_hashes[r_id] = req.get("verified_sha256", "")
                    existing_statuses[r_id] = req.get("status", "")
        except Exception:
            pass

    report = AuditReport(
        show_all=show_all,
        untagged_files=untagged_files,
        untagged_src_symbols=untagged_src_symbols,
        untagged_tests=untagged_tests,
        orphan_tags=orphan_tags,
        semantic=semantic,
    )
    report.total_requirements = len(requirements)

    manifest_records = []

    for req in requirements:
        req_id = req.req_id
        report.total_criteria += len(req.acceptance_criteria)

        impl_locs = implementations.get(req_id, [])
        impl_files = sorted(
            list(
                {
                    _rel_path(loc.file_path, base_dir)
                    for loc in impl_locs
                }
            )
        )

        verified_acs = []
        unverified_acs = []
        for ac in req.acceptance_criteria:
            full_key = f"{req_id}/{ac}"
            if full_key in verifications:
                verified_acs.append(ac)
            else:
                unverified_acs.append(ac)

        # Monotonic Ratchet check
        previously_verified = existing_statuses.get(req_id) == "VERIFIED"

        if req.is_planned:
            if impl_files or verified_acs:
                status = "PREMATURE_IMPL"
                report.premature_requirements.append(req_id)
            else:
                status = "PLANNED"
        else:
            if not impl_files:
                if previously_verified:
                    status = "REGRESSION"
                    report.regressed_requirements.append(req_id)
                else:
                    status = "UNIMPLEMENTED"
            elif unverified_acs:
                if previously_verified:
                    status = "REGRESSION"
                    report.regressed_requirements.append(req_id)
                else:
                    status = "UNTESTED_CRITERIA"
            else:
                status = "VERIFIED"

        # Cryptographic Hash Drift check
        prev_hash = existing_hashes.get(req_id)
        if prev_hash and prev_hash != req.sha256:
            if update_hashes and status == "VERIFIED":
                pass
            else:
                report.drifted_requirements.append(req_id)
                status = "HASH_DRIFT"

        status_obj = RequirementAuditStatus(
            req_id=req_id,
            title=req.title,
            spec_path=_rel_path(req.spec_path, base_dir),
            sha256=req.sha256,
            is_planned=req.is_planned,
            acceptance_criteria=req.acceptance_criteria,
            implementation_files=impl_files,
            verified_criteria=verified_acs,
            unverified_criteria=unverified_acs,
            status=status,
        )
        report.requirement_statuses.append(status_obj)

        manifest_records.append(
            {
                "requirement_id": req_id,
                "title": req.title,
                "spec_file": status_obj.spec_path,
                "is_planned": req.is_planned,
                "sha256": req.sha256,
                "verified_sha256": req.sha256 if (update_hashes and status == "VERIFIED") else prev_hash or req.sha256,
                "acceptance_criteria": req.acceptance_criteria,
                "verified_criteria": verified_acs,
                "implementation_files": impl_files,
                "status": status,
            }
        )

    if traceability_path:
        traceability_path.parent.mkdir(parents=True, exist_ok=True)
        active_statuses = report.active_statuses
        manifest_data = {
            "last_audited_at": datetime.now(UTC).isoformat(),
            "total_requirements": report.total_requirements,
            "active_requirements_count": len(active_statuses),
            "planned_requirements_count": len(report.planned_statuses),
            "active_criteria_count": sum(len(s.acceptance_criteria) for s in active_statuses),
            "verified_criteria_count": sum(len(s.verified_criteria) for s in active_statuses),
            "reverse_traceability": {
                "untagged_files_count": len(report.untagged_files),
                "untagged_src_symbols_count": len(report.untagged_src_symbols),
                "untagged_tests_count": len(report.untagged_tests),
                "orphan_tags_count": len(report.orphan_tags),
                "stacked_test_tags_count": len(report.semantic.stacked_test_tags),
                "cross_link_mismatches_count": len(report.semantic.cross_link_mismatches),
                "weak_test_assertions_count": len(report.semantic.weak_test_assertions),
                "ac_anchor_mismatches_count": len(report.semantic.ac_anchor_mismatches),
            },
            "status": "PASS" if not report.has_strict_violations else "FAIL",
            "requirements": manifest_records,
        }
        with open(traceability_path, "w", encoding="utf-8") as f:
            json.dump(manifest_data, f, indent=2)

    return report


# ============================================================================
# 4. Project Initialization Helper (guardian init)
# ============================================================================

STARTER_README = """# Specifications Directory (`specs/`)

This directory houses all formal system requirements written in **Easy Approach to Requirements Syntax (EARS)**.

## EARS Format Syntax Reference
Every requirement must follow one of the 5 standard EARS patterns:
1. **Ubiquitous**: The system shall [system response].
2. **Event-driven**: When [trigger], the system shall [system response].
3. **State-driven**: While [specific system state], the system shall [system response].
4. **Unwanted behaviour**: If [error condition / edge case], then the system shall [system response].
5. **Optional feature**: Where [feature flag or setting enabled], the system shall [system response].

## Requirement Structure & `[PLANNED]` Lifecycle
```markdown
## [MODULE]-[NUMBER]: [Descriptive Title]

[EARS Statement]

Acceptance Criteria:
- AC-[MODULE]-[NUMBER].1: [Criterion 1]
- AC-[MODULE]-[NUMBER].2: [Criterion 2]
```

To author roadmap specs upfront for incremental implementation, append `[PLANNED]` to the heading:
```markdown
## [MODULE]-[NUMBER]: [Future Feature Title] [PLANNED]
```
- **Active Specs (No `[PLANNED]` tag)**: Must be implemented in `src/` and 100% verified in `tests/`.
- **Planned Specs (`[PLANNED]`)**: Deferred for future steps; fails `--strict` if implemented prematurely before `[PLANNED]` is removed.

## Traceability & Hashing Rules
- **Normalized Block Hashing**: Each requirement block from `## [REQ-ID]:` to the next `##` or EOF is normalized and fingerprinted via SHA-256.
- **Code Binding**: Source code in `src/` tags `// [spec: REQ-ID]` (or `# [spec: REQ-ID]`).
- **Test Binding**: Tests in `tests/` tag `// [verifies: REQ-ID/AC-ID]` (or `# [verifies: REQ-ID/AC-ID]`).
- **Traceability Manifest**: `specs/traceability.json` is auto-compiled and verified by Spec Guardian.
"""

STARTER_SPEC = """# Core Module Specifications

## CORE-001: System Initialization & Configuration

When launched, the system shall validate its runtime environment and load application configuration.

Acceptance Criteria:
- AC-CORE-001.1: System reads environment variables and defaults without crashing.
- AC-CORE-001.2: System fails gracefully with an informative error message if required secrets are absent.
"""


def init_project(target_dir: Path) -> int:
    """Initialize standard specs/ structure in target project."""
    specs_dir = target_dir / "specs"
    specs_dir.mkdir(parents=True, exist_ok=True)

    readme_path = specs_dir / "README.md"
    if not readme_path.exists():
        readme_path.write_text(STARTER_README, encoding="utf-8")
        print(f"Created {readme_path}")

    starter_spec_path = specs_dir / "core.md"
    if not starter_spec_path.exists():
        starter_spec_path.write_text(STARTER_SPEC, encoding="utf-8")
        print(f"Created starter spec: {starter_spec_path}")

    print("\n✅ Spec-Driven Development initialized! Directory structure ready in specs/.")
    print("Next step: Run 'guardian audit' to generate specs/traceability.json.")
    return 0


# ============================================================================
# 5. CLI Entrypoint
# ============================================================================

def main() -> int:
    parser = argparse.ArgumentParser(
        prog="guardian",
        description="Spec Guardian: Airtight Two-Way EARS Specification & Traceability Auditor",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # audit command
    audit_parser = subparsers.add_parser("audit", help="Audit specs against code and tests in both directions")
    audit_parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit with code 1 if any active requirements have untested criteria, unspecified code/tests, or hash drift",
    )
    audit_parser.add_argument(
        "--all",
        action="store_true",
        help="Show full roadmap including all planned/unimplemented specs and their criteria",
    )
    audit_parser.add_argument(
        "--update-hashes",
        action="store_true",
        help="Update verified hashes in traceability.json for specs whose criteria are fully verified",
    )
    audit_parser.add_argument(
        "--specs-dir",
        type=Path,
        default=Path("specs"),
        help="Path to specs directory (default: specs)",
    )
    audit_parser.add_argument(
        "--src-dir",
        type=Path,
        default=Path("src"),
        help="Path to source directory (default: src)",
    )
    audit_parser.add_argument(
        "--tests-dir",
        type=Path,
        default=Path("tests"),
        help="Path to tests directory (default: tests)",
    )
    audit_parser.add_argument(
        "--base-dir",
        type=Path,
        default=Path("."),
        help="Base root directory for relative paths (default: .)",
    )
    audit_parser.add_argument(
        "--traceability",
        type=Path,
        default=Path("specs/traceability.json"),
        help="Path to traceability output file (default: specs/traceability.json)",
    )

    # report command
    report_parser = subparsers.add_parser("report", help="Print verification matrix report")
    report_parser.add_argument(
        "--all",
        action="store_true",
        help="Include all planned/unimplemented requirements in report",
    )
    report_parser.add_argument(
        "--specs-dir",
        type=Path,
        default=Path("specs"),
        help="Path to specs directory",
    )
    report_parser.add_argument(
        "--src-dir",
        type=Path,
        default=Path("src"),
        help="Path to source directory",
    )
    report_parser.add_argument(
        "--tests-dir",
        type=Path,
        default=Path("tests"),
        help="Path to tests directory",
    )
    report_parser.add_argument(
        "--base-dir",
        type=Path,
        default=Path("."),
        help="Base root directory for relative paths",
    )

    # init command
    init_parser = subparsers.add_parser("init", help="Initialize specs directory and starter EARS spec")
    init_parser.add_argument(
        "--target-dir",
        type=Path,
        default=Path("."),
        help="Target project directory (default: current directory)",
    )

    args = parser.parse_args()

    if args.command == "init":
        return init_project(args.target_dir)

    elif args.command == "audit":
        report = audit_specs(
            spec_dir=args.specs_dir,
            src_dir=args.src_dir,
            tests_dir=args.tests_dir,
            base_dir=args.base_dir,
            traceability_path=args.traceability,
            show_all=args.all,
            update_hashes=args.update_hashes,
        )
        print(report.to_markdown())
        if args.strict and report.has_strict_violations:
            print(
                "\n❌ Spec Guardian strict check failed: Violations or untested criteria present.",
                file=sys.stderr,
            )
            return 1
        return 0

    elif args.command == "report":
        report = audit_specs(
            spec_dir=args.specs_dir,
            src_dir=args.src_dir,
            tests_dir=args.tests_dir,
            base_dir=args.base_dir,
            show_all=args.all,
        )
        print(report.to_markdown())
        return 0

    return 0


if __name__ == "__main__":
    sys.exit(main())
