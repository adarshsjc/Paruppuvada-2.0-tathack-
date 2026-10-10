"""Independent verification: inspects actual artifacts on disk.

The verifier never trusts the report's own numbers — where values matter it
recomputes them from the source data with plain Python. An LLM response is
never sufficient for a PASS.
"""
import csv
import json
import os
from typing import Any, Dict, List, Optional

from app.execution.contracts import Verdict, VerificationCheck, VerificationReport
from app.tools.file_tools import safe_path


def check_file_exists(path: str) -> VerificationCheck:
    try:
        p = safe_path(path)
        ok = os.path.isfile(p)
        size = os.path.getsize(p) if ok else 0
        return VerificationCheck(
            rule="rule:file_exists", description=f"{path} exists",
            verdict=Verdict.PASS if ok else Verdict.FAIL,
            evidence={"path": path, "size_bytes": size},
        )
    except Exception as e:
        return VerificationCheck(rule="rule:file_exists", verdict=Verdict.FAIL,
                                 evidence={"error": str(e)})


def check_json_parses(path: str, must_contain_keys: Optional[List[str]] = None) -> VerificationCheck:
    try:
        with open(safe_path(path), "r", encoding="utf-8") as f:
            data = json.load(f)
        missing = [k for k in (must_contain_keys or []) if k not in data]
        return VerificationCheck(
            rule="rule:json_parses", description=f"{path} parses as JSON",
            verdict=Verdict.PASS if not missing else Verdict.FAIL,
            evidence={"keys": list(data.keys())[:20], "missing_required_keys": missing},
        )
    except Exception as e:
        return VerificationCheck(rule="rule:json_parses", verdict=Verdict.FAIL,
                                 evidence={"error": str(e)})


def check_values_match_recompute(
    report_path: str, csv_path: str, group_field: str, sum_field: str,
    totals_key: str = "totals",
) -> VerificationCheck:
    """Recompute group totals from the source CSV and compare with report.json."""
    try:
        with open(safe_path(report_path), "r", encoding="utf-8") as f:
            report = json.load(f)
        reported = (report.get(totals_key) or {})
        expected: Dict[str, float] = {}
        with open(safe_path(csv_path), "r", encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                key = (row.get(group_field) or "").strip()
                if not key:
                    continue
                expected[key] = expected.get(key, 0.0) + float(row.get(sum_field) or 0)

        mismatches = []
        for k, v in expected.items():
            got = reported.get(k)
            if got is None:
                mismatches.append({"product": k, "expected": v, "reported": None})
            elif abs(float(got.get(sum_field, got) if isinstance(got, dict) else got) - v) > 1e-6:
                mismatches.append({"product": k, "expected": v,
                                   "reported": got.get(sum_field) if isinstance(got, dict) else got})
        extra = [k for k in reported if k not in expected]
        verdict = Verdict.PASS if not mismatches and not extra and expected else (
            Verdict.INCONCLUSIVE if not expected else Verdict.FAIL)
        return VerificationCheck(
            rule="rule:values_match_recompute",
            description=f"report values == recomputation from {csv_path}",
            verdict=verdict,
            evidence={"recomputed_groups": len(expected), "mismatches": mismatches[:10],
                      "unreported_groups": extra[:10]},
        )
    except Exception as e:
        return VerificationCheck(rule="rule:values_match_recompute", verdict=Verdict.FAIL,
                                 evidence={"error": str(e)})


def check_md_sections(path: str, required_headings: List[str]) -> VerificationCheck:
    try:
        with open(safe_path(path), "r", encoding="utf-8") as f:
            content = f.read()
        missing = [h for h in required_headings if h.lower() not in content.lower()]
        return VerificationCheck(
            rule="rule:md_sections_present", description=f"{path} contains required sections",
            verdict=Verdict.PASS if not missing else Verdict.FAIL,
            evidence={"required": required_headings, "missing": missing},
        )
    except Exception as e:
        return VerificationCheck(rule="rule:md_sections_present", verdict=Verdict.FAIL,
                                 evidence={"error": str(e)})


def check_md_contains_values(path: str, values: List[float]) -> VerificationCheck:
    try:
        with open(safe_path(path), "r", encoding="utf-8") as f:
            content = f.read()
        missing = []
        for v in values:
            for fmt in (f"{v:g}", f"{v:,.2f}", f"{v:.2f}"):
                if fmt in content:
                    break
            else:
                missing.append(v)
        return VerificationCheck(
            rule="rule:md_values_present", description="markdown shows the computed totals",
            verdict=Verdict.PASS if not missing else Verdict.FAIL,
            evidence={"checked": values, "missing": missing},
        )
    except Exception as e:
        return VerificationCheck(rule="rule:md_values_present", verdict=Verdict.FAIL,
                                 evidence={"error": str(e)})


def combine(checks: List[VerificationCheck], summary: str = "") -> VerificationReport:
    if not checks:
        return VerificationReport(verdict=Verdict.INCONCLUSIVE, checks=[], summary="no checks ran")
    verdicts = {c.verdict for c in checks}
    if Verdict.FAIL in verdicts:
        final = Verdict.FAIL
    elif verdicts == {Verdict.PASS}:
        final = Verdict.PASS
    else:
        final = Verdict.INCONCLUSIVE
    return VerificationReport(verdict=final, checks=checks, summary=summary or final.value)


def verify_sales_report(report_json_path: str, report_md_path: str, csv_path: str,
                        group_field: str, sum_field: str) -> VerificationReport:
    """The concrete verification bundle for the sales-report workflow."""
    checks: List[VerificationCheck] = [check_file_exists(report_json_path),
                                       check_file_exists(report_md_path)]
    if all(c.verdict == Verdict.PASS for c in checks):
        checks.append(check_json_parses(report_json_path, must_contain_keys=["totals"]))
        recomputed = check_values_match_recompute(report_json_path, csv_path, group_field, sum_field)
        checks.append(recomputed)
        if recomputed.verdict == Verdict.PASS:
            with open(safe_path(report_json_path), "r", encoding="utf-8") as f:
                totals = json.load(f).get("totals", {})
            vals = []
            for v in totals.values():
                vals.append(float(v.get(sum_field, v)) if isinstance(v, dict) else float(v))
            checks.append(check_md_sections(report_md_path, ["Revenue Totals by Product"]))
            checks.append(check_md_contains_values(report_md_path, vals))
    return combine(checks, "Independent recomputation from source CSV included")
