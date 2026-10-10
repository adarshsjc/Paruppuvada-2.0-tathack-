"""Sandboxed file tools for data workflows.

Security: every path is resolved against the configured workspace directory and
must stay inside it (backend-enforced; the LLM cannot grant itself access).
All aggregation math is deterministic Python — never LLM arithmetic.
"""
import csv
import io
import json
import os
from typing import Any, Dict, List, Optional

from app.config import settings


class ToolError(Exception):
    """Expected, recoverable tool failure (bad input, missing file...)."""


class TransientToolError(ToolError):
    """Potentially recoverable on retry (simulates/env timeouts)."""


def workspace_root() -> str:
    root = os.path.abspath(settings.workspace_dir)
    os.makedirs(root, exist_ok=True)
    return root


def safe_path(path: str) -> str:
    root = workspace_root()
    p = os.path.abspath(os.path.join(root, path))
    if not (p == root or p.startswith(root + os.sep)):
        raise ToolError(f"Path escapes the workspace sandbox: {path}")
    return p


def register(registry: Dict[str, Any], project_id_getter=None) -> None:
    """Attach file tools to the shared tool registry with permission wrappers."""

    def read_csv(path: str) -> str:
        p = safe_path(path)
        if not os.path.isfile(p):
            raise ToolError(f"CSV file not found in workspace: {path}")
        with open(p, "r", encoding="utf-8", newline="") as f:
            reader = csv.reader(f)
            rows = list(reader)
        if not rows:
            raise ToolError(f"CSV file is empty: {path}")
        header = rows[0]
        data = [dict(zip(header, r)) for r in rows[1:] if r]
        return json.dumps({"path": path, "columns": header, "row_count": len(data),
                           "rows": data[:50]})

    def validate_csv(path: str, required_columns: Optional[List[str]] = None) -> str:
        p = safe_path(path)
        if not os.path.isfile(p):
            raise ToolError(f"CSV file not found in workspace: {path}")
        with open(p, "r", encoding="utf-8", newline="") as f:
            reader = csv.reader(f)
            rows = list(reader)
        if not rows:
            raise ToolError(f"CSV file is empty: {path}")
        header = [h.strip() for h in rows[0]]
        required = required_columns or []
        missing = [c for c in required if c not in header]
        malformed: List[Dict[str, Any]] = []
        for i, r in enumerate(rows[1:], start=2):
            if not r:
                malformed.append({"line": i, "error": "empty row"})
            elif len(r) != len(header):
                malformed.append({"line": i, "error": f"expected {len(header)} fields, got {len(r)}"})
        return json.dumps({
            "path": path, "columns": header, "row_count": len(rows) - 1,
            "valid": not missing and not malformed,
            "missing_columns": missing, "malformed_rows": malformed,
        })

    def aggregate_csv(path: str, group_by: str, sum_columns: List[str]) -> str:
        p = safe_path(path)
        if not os.path.isfile(p):
            raise ToolError(f"CSV file not found in workspace: {path}")
        with open(p, "r", encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            header = reader.fieldnames or []
            if group_by not in header:
                raise ToolError(f"group_by column '{group_by}' not in CSV header {header}")
            for col in sum_columns:
                if col not in header:
                    raise ToolError(f"sum column '{col}' not in CSV header {header}")
            totals: Dict[str, Dict[str, float]] = {}
            counts: Dict[str, int] = {}
            for row in reader:
                key = (row.get(group_by) or "").strip()
                if not key:
                    continue
                bucket = totals.setdefault(key, {c: 0.0 for c in sum_columns})
                counts[key] = counts.get(key, 0) + 1
                for col in sum_columns:
                    raw = (row.get(col) or "").strip()
                    if not raw:
                        raise TransientToolError(f"empty value in column '{col}' — retry after validation")
                    try:
                        bucket[col] += float(raw)
                    except ValueError:
                        raise ToolError(
                            f"non-numeric value '{raw}' in column '{col}' "
                            f"(line {reader.line_num})")
        return json.dumps({
            "path": path, "group_by": group_by, "sum_columns": sum_columns,
            "totals": totals, "row_counts": counts,
        })

    def write_json(path: str, data: Any) -> str:
        p = safe_path(path)
        os.makedirs(os.path.dirname(p) or ".", exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, default=str)
        return json.dumps({"written": path, "bytes": os.path.getsize(p)})

    def write_markdown(path: str, content: str) -> str:
        p = safe_path(path)
        os.makedirs(os.path.dirname(p) or ".", exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            f.write(content)
        return json.dumps({"written": path, "bytes": os.path.getsize(p)})

    def verify_file_exists(path: str) -> str:
        p = safe_path(path)
        return json.dumps({"path": path, "exists": os.path.isfile(p)})

    def read_json(path: str) -> str:
        p = safe_path(path)
        if not os.path.isfile(p):
            raise ToolError(f"JSON file not found in workspace: {path}")
        with open(p, "r", encoding="utf-8") as f:
            return json.dumps(json.load(f))

    registry.update({
        "read_csv": read_csv,
        "validate_csv": validate_csv,
        "aggregate_csv": aggregate_csv,
        "write_json": write_json,
        "write_markdown": write_markdown,
        "verify_file_exists": verify_file_exists,
        "read_json": read_json,
    })
