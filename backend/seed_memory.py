"""Seed the memory graph: skills, categories, tools, workflows, verification
rules, the sales.csv fixture (with documented expected results), a knowledge
document, and one validated recovery procedure. Idempotent.

Usage:  python seed_memory.py [--db memory.db] [--workspace workspace]
"""
import os
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from app.config import settings  # noqa: E402
from app.graph.store import get_graph_store  # noqa: E402
from app.skills.library import seed_graph  # noqa: E402
from app.rag.ingest import ingest_text  # noqa: E402

# Controlled fixture with documented expected results (revenue totals by product):
#   Widget A: 1200.50 + 300.25 +  90.00 = 1590.75
#   Widget B:  850.00 + 410.10 +  15.50 = 1275.60
#   Gadget C: 2200.00 +  99.99 + 500.00 = 2799.99
#   Total                          = 5666.34
SALES_CSV = """date,product,revenue,units
2026-01-05,Widget A,1200.50,10
2026-01-06,Widget B,850.00,7
2026-01-07,Gadget C,2200.00,18
2026-01-08,Widget A,300.25,3
2026-01-09,Widget B,410.10,4
2026-01-10,Widget A,90.00,1
2026-01-11,Gadget C,99.99,1
2026-01-12,Gadget C,500.00,5
2026-01-13,Widget B,15.50,1
"""

SALES_KNOWLEDGE_MD = """# Sales Data Reporting Guide

## Required schema
Sales CSV files must contain the columns: date, product, revenue, units.
The revenue column is numeric with two decimals. Malformed rows must be
reported, never silently dropped.

## Computation rules
Revenue totals are grouped by the product column and summed with exact decimal
addition (float tolerance 1e-6). Aggregation must run only after validation
passes. Reports are written as report.json (object with a "totals" key) and
report.md (section "Revenue Totals by Product").

## Verification rules
Verification recomputes the totals from the source CSV and compares against
report.json. The markdown must show the same values. A PASS requires every
group to match; an empty result is INCONCLUSIVE.
"""


def seed(db_path: str = None, workspace: str = None) -> dict:
    if db_path:
        settings.memory_db_path = db_path
    if workspace:
        settings.workspace_dir = workspace
    store = get_graph_store()

    counts = seed_graph(store)

    # fixture CSV in the workspace sandbox
    ws = os.path.abspath(settings.workspace_dir)
    os.makedirs(ws, exist_ok=True)
    csv_path = os.path.join(ws, "sales.csv")
    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        f.write(SALES_CSV)

    # memory management is driven by the project's CSV files: mirror sales.csv
    # into the graph (document -> CONTAINS -> knowledge chunks)
    from app.rag.ingest import ingest_file
    csv_doc = ingest_file(csv_path, None, store, db_path=settings.memory_db_path)
    counts_by_file = {"sales.csv": csv_doc}

    # knowledge document (ingested into RAG + graph)
    doc = ingest_text("sales-reporting-guide.md", SALES_KNOWLEDGE_MD, None, store,
                      source_label="seed:guide")

    # one validated recovery procedure (honest: seeded as validated because it is
    # a deterministic input fix verified by the passing engine tests)
    from app.graph.schema import EdgeType, GraphNode, NodeType, Provenance
    store.upsert_recovery_procedure({
        "id": "recovery:aggregate-empty-value",
        "error_signature": "aggregate_csv:TransientToolError",
        "description": "Empty numeric cell encountered during aggregation. Re-run validation, "
                       "then aggregate with rows filtered or the value corrected.",
        "steps": [],
        "status": "validated",
    })
    store.upsert_node(GraphNode(
        id="recovery:aggregate-empty-value", node_type=NodeType.RECOVERY,
        label="Recovery: empty numeric cell",
        description="Re-validate CSV, then aggregate with corrected values. Validated "
                    "(deterministic input fix covered by engine tests).",
        importance=0.7,
    ))
    store.upsert_edge("cat:data-reporting", "recovery:aggregate-empty-value",
                      EdgeType.CONTAINS, Provenance.EXPLICIT)

    return {"graph": counts, "document": doc, "csv": counts_by_file,
            "workspace": ws,
            "expected_totals": {"Widget A": 1590.75, "Widget B": 1275.60,
                                "Gadget C": 2799.99, "total": 5666.34}}


if __name__ == "__main__":
    import argparse
    import json as _json
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=None)
    ap.add_argument("--workspace", default=None)
    args = ap.parse_args()
    print(_json.dumps(seed(args.db, args.workspace), indent=2, default=str))
