#!/usr/bin/env python3
"""
Spec Guardian: Standalone EARS Specification & Traceability Auditor
Bundled with the global 'spec-driven-development' Antigravity skill.
Zero external dependencies (pure Python 3.10+ standard library).
"""

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
# 1. Spec Parsing & Normalization
# ============================================================================

REQ_HEADING_REGEX = re.compile(r"^##\s+([A-Z0-9\-]+):\s+(.+)$", re.MULTILINE)
AC_REGEX = re.compile(r"^-\s+(AC-[A-Z0-9\-\.]+):\s*(.+)$", re.MULTILINE)


@dataclass
class RequirementBlock:
    req_id: str
    title: str
    spec_path: Path
    statement: str
    acceptance_criteria: list[str] = field(default_factory=list)
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
        req_id = match.group(1).strip()
        title = match.group(2).strip()
        start_idx = match.start()
        end_idx = matches[i + 1].start() if i + 1 < len(matches) else len(content)

        raw_block = content[start_idx:end_idx]
        normalized = normalize_block(raw_block)
        block_hash = hash_text(normalized)

        ac_matches = AC_REGEX.findall(raw_block)
        criteria_ids = [ac[0].strip() for ac in ac_matches]

        parts = re.split(r"Acceptance Criteria:", raw_block, flags=re.IGNORECASE)
        statement_text = ""
        if parts:
            heading_line = match.group(0)
            before_ac = parts[0].replace(heading_line, "", 1)
            statement_text = normalize_block(before_ac)

        block = RequirementBlock(
            req_id=req_id,
            title=title,
            spec_path=file_path,
            statement=statement_text,
            acceptance_criteria=criteria_ids,
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
# 2. Source Code & Test Annotation Scanning
# ============================================================================

SPEC_TAG_REGEX = re.compile(r"\[spec:\s*([A-Z0-9\-]+)\]", re.IGNORECASE)
VERIFIES_TAG_REGEX = re.compile(r"\[verifies:\s*([A-Z0-9\-]+/[A-Z0-9\-\.]+)\]", re.IGNORECASE)


@dataclass
class CodeLocation:
    file_path: Path
    line_number: int
    symbol_name: str = ""
    tag_content: str = ""


def scan_file_for_tags(file_path: Path, pattern: re.Pattern) -> list[tuple[str, CodeLocation]]:
    """Scan a source or test file for matches of a specific tag regex pattern."""
    results: list[tuple[str, CodeLocation]] = []
    try:
        lines = file_path.read_text(encoding="utf-8").splitlines()
    except Exception:
        return results

    for line_idx, line in enumerate(lines, start=1):
        for match in pattern.finditer(line):
            tag_id = match.group(1).strip()
            loc = CodeLocation(
                file_path=file_path,
                line_number=line_idx,
                tag_content=line.strip(),
            )
            results.append((tag_id, loc))
    return results


def scan_codebase(
    src_dir: Path, tests_dir: Path
) -> tuple[dict[str, list[CodeLocation]], dict[str, list[CodeLocation]]]:
    """Scan src/ for [spec: REQ] and tests/ for [verifies: REQ/AC]. Supports Python, TS, JS, Go, Rust, Java."""
    implementations: dict[str, list[CodeLocation]] = {}
    verifications: dict[str, list[CodeLocation]] = {}

    extensions = ("*.py", "*.ts", "*.tsx", "*.js", "*.jsx", "*.go", "*.rs", "*.java", "*.c", "*.cpp", "*.cs")

    if src_dir.exists():
        for ext in extensions:
            for source_file in src_dir.rglob(ext):
                for req_id, loc in scan_file_for_tags(source_file, SPEC_TAG_REGEX):
                    implementations.setdefault(req_id, []).append(loc)

    if tests_dir.exists():
        for ext in extensions:
            for test_file in tests_dir.rglob(ext):
                for ac_key, loc in scan_file_for_tags(test_file, VERIFIES_TAG_REGEX):
                    verifications.setdefault(ac_key, []).append(loc)

    return implementations, verifications


# ============================================================================
# 3. Audit Engine & Reporting
# ============================================================================

@dataclass
class RequirementAuditStatus:
    req_id: str
    title: str
    spec_path: str
    sha256: str
    acceptance_criteria: list[str]
    implementation_files: list[str] = field(default_factory=list)
    verified_criteria: list[str] = field(default_factory=list)
    unverified_criteria: list[str] = field(default_factory=list)
    status: str = "PENDING"  # VERIFIED | UNTESTED_CRITERIA | UNIMPLEMENTED | HASH_DRIFT


@dataclass
class AuditReport:
    total_requirements: int = 0
    total_criteria: int = 0
    implemented_requirements: list[str] = field(default_factory=list)
    unimplemented_requirements: list[str] = field(default_factory=list)
    tested_criteria: list[str] = field(default_factory=list)
    untested_criteria: list[str] = field(default_factory=list)
    drifted_requirements: list[str] = field(default_factory=list)
    requirement_statuses: list[RequirementAuditStatus] = field(default_factory=list)
    show_all: bool = False

    @property
    def active_statuses(self) -> list[RequirementAuditStatus]:
        if self.show_all:
            return self.requirement_statuses
        return [s for s in self.requirement_statuses if s.implementation_files or s.status == "HASH_DRIFT"]

    @property
    def active_untested_criteria(self) -> list[str]:
        if self.show_all:
            return self.untested_criteria
        active_untested = []
        for s in self.active_statuses:
            active_untested.extend(s.unverified_criteria)
        return active_untested

    @property
    def has_active_violations(self) -> bool:
        return bool(self.active_untested_criteria or self.drifted_requirements)

    @property
    def has_violations(self) -> bool:
        return bool(self.unimplemented_requirements or self.untested_criteria or self.drifted_requirements)

    def to_markdown(self) -> str:
        active = self.active_statuses
        active_criteria_count = sum(len(s.acceptance_criteria) for s in active)
        active_verified_count = sum(len(s.verified_criteria) for s in active)
        planned_count = len(self.unimplemented_requirements)

        pct = 0 if not active_criteria_count else (active_verified_count * 100 // active_criteria_count)
        result_icon = "❌ ACTION REQUIRED" if self.has_active_violations else "✅ ALL ACTIVE SPECS VERIFIED"

        lines = [
            "# Spec Guardian Audit Report",
            f"Generated: {datetime.now(UTC).strftime('%Y-%m-%d %H:%M:%S UTC')}",
            "",
            "## Active Implementation Status",
            f"- **Active Requirements**: {len(active)} in progress / implemented",
            f"- **Active Criteria Verified**: {active_verified_count} / {active_criteria_count} ({pct}%)",
            f"- **Planned / Roadmap**: {planned_count} requirements not yet started (use `--all` to view full list)",
            f"- **Hash Drift Violations**: {len(self.drifted_requirements)}",
            f"- **Active Audit Result**: {result_icon}",
            "",
            "## Active Requirements Traceability",
            "| Requirement ID | Title | Status | Implemented | Verified Criteria | Spec Hash |",
            "| :--- | :--- | :--- | :--- | :--- | :--- |",
        ]

        if not active:
            lines.append("| *(None)* | No active implementations found | ⏳ `PLANNED` | No | 0/0 | — |")
        else:
            for s in active:
                status_icon = "✅" if s.status == "VERIFIED" else ("⚠️" if s.status == "UNTESTED_CRITERIA" else "❌")
                tested_summary = f"{len(s.verified_criteria)}/{len(s.acceptance_criteria)}"
                impl_icon = "Yes" if s.implementation_files else "No"
                lines.append(
                    f"| `{s.req_id}` | {s.title} | {status_icon} `{s.status}` | {impl_icon} | {tested_summary} | `{s.sha256[:10]}...` |"
                )

        untested = self.active_untested_criteria
        if untested:
            lines.extend(["", "## Untested Active Criteria (Action Required)"])
            for ac in untested:
                lines.append(f"- ⚠️ `{ac}`")

        if self.drifted_requirements:
            lines.extend(["", "## Hash Drift Detected (Specs Changed After Verification)"])
            for d in self.drifted_requirements:
                lines.append(f"- ❌ `{d}`")

        if self.show_all and self.unimplemented_requirements:
            lines.extend(["", "## Planned / Unimplemented Requirements (Full Roadmap)"])
            for s in self.requirement_statuses:
                if not s.implementation_files:
                    lines.append(f"- ⏳ `{s.req_id}`: {s.title} ({len(s.acceptance_criteria)} criteria planned)")

        return "\n".join(lines)


def audit_specs(
    spec_dir: Path,
    src_dir: Path,
    tests_dir: Path,
    traceability_path: Path | None = None,
    show_all: bool = False,
    update_hashes: bool = False,
) -> AuditReport:
    """Audit all specs against src/ and tests/, updating traceability.json if provided."""
    requirements = parse_specs_directory(spec_dir)
    implementations, verifications = scan_codebase(src_dir, tests_dir)

    existing_hashes: dict[str, str] = {}
    if traceability_path and traceability_path.exists():
        try:
            with open(traceability_path, encoding="utf-8") as f:
                data = json.load(f)
                for req in data.get("requirements", []):
                    existing_hashes[req["requirement_id"]] = req.get("verified_sha256", "")
        except Exception:
            pass

    report = AuditReport(show_all=show_all)
    report.total_requirements = len(requirements)

    manifest_records = []

    for req in requirements:
        req_id = req.req_id
        report.total_criteria += len(req.acceptance_criteria)

        impl_locs = implementations.get(req_id, [])
        impl_files = sorted(
            list(
                {
                    str(loc.file_path.relative_to(src_dir.parent))
                    if src_dir.parent in loc.file_path.parents
                    else str(loc.file_path)
                    for loc in impl_locs
                }
            )
        )
        if impl_files:
            report.implemented_requirements.append(req_id)
        else:
            report.unimplemented_requirements.append(req_id)

        verified_acs = []
        unverified_acs = []
        for ac in req.acceptance_criteria:
            full_key = f"{req_id}/{ac}"
            if full_key in verifications:
                verified_acs.append(ac)
                report.tested_criteria.append(ac)
            else:
                unverified_acs.append(ac)
                report.untested_criteria.append(ac)

        if not impl_files:
            status = "UNIMPLEMENTED"
        elif unverified_acs:
            status = "UNTESTED_CRITERIA"
        else:
            status = "VERIFIED"

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
            spec_path=str(req.spec_path.relative_to(spec_dir.parent))
            if spec_dir.parent in req.spec_path.parents
            else str(req.spec_path),
            sha256=req.sha256,
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
                "sha256": req.sha256,
                "verified_sha256": req.sha256 if status == "VERIFIED" else prev_hash,
                "acceptance_criteria": req.acceptance_criteria,
                "verified_criteria": verified_acs,
                "implementation_files": impl_files,
                "status": status,
            }
        )

    if traceability_path:
        traceability_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_data = {
            "last_audited_at": datetime.now(UTC).isoformat(),
            "total_requirements": report.total_requirements,
            "total_criteria": report.total_criteria,
            "verified_criteria_count": len(report.tested_criteria),
            "status": "PASS" if not report.has_violations else "FAIL",
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

## Requirement Structure
```markdown
## [MODULE]-[NUMBER]: [Descriptive Title]

[EARS Statement]

Acceptance Criteria:
- AC-[MODULE]-[NUMBER].1: [Criterion 1]
- AC-[MODULE]-[NUMBER].2: [Criterion 2]
```

## Traceability & Hashing Rules
- **Normalized Block Hashing**: Each requirement block from `## [REQ-ID]:` to the next `##` or EOF is stripped of trailing whitespace, normalized to `\\n` line endings, and fingerprinted via SHA-256.
- **Code Binding**: Source code in `src/` tags `# [spec: REQ-ID]`.
- **Test Binding**: Tests in `tests/` tag `# [verifies: REQ-ID/AC-ID]`.
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
        description="Spec Guardian: EARS Specification & Traceability Auditor",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # audit command
    audit_parser = subparsers.add_parser("audit", help="Audit specs against code and tests")
    audit_parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit with code 1 if any active requirements have untested criteria or hash drift",
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
            traceability_path=args.traceability,
            show_all=args.all,
            update_hashes=args.update_hashes,
        )
        print(report.to_markdown())
        if args.strict:
            has_error = report.has_violations if args.all else report.has_active_violations
            if has_error:
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
            show_all=args.all,
        )
        print(report.to_markdown())
        return 0

    return 0


if __name__ == "__main__":
    sys.exit(main())
