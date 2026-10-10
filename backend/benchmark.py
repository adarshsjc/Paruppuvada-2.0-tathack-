"""benchmark.py — measured benchmark for the canonical sales-report workflow.

Runs the PART-13 workflow end-to-end (with whichever provider .env selects —
Mock, Ollama/qwen, OpenRouter or Gemini) and records wall-clock timings,
verification verdicts and event counts per scenario. Results are written to
benchmark_run.json next to this script, ready to paste into
BENCHMARK_REPORT.md.

Usage:
    python benchmark.py                 # happy path x5 + failure scenarios x1
    python benchmark.py --repeats 10    # more happy-path samples

The report is honest about the provider: with USE_MOCK_LLM=True it measures
the deterministic engine path (no LLM latency); switch the model on first to
measure live-model timings.
"""
import argparse
import json
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from app.config import settings  # noqa: E402
from app.events.bus import EventBus  # noqa: E402
from app.execution.engine import ExecutionEngine  # noqa: E402
from app.graph.store import GraphStore  # noqa: E402
from app.skills.library import seed_graph  # noqa: E402

GOOD_CSV = (
    "date,product,revenue,units\n"
    "2026-01-05,Widget A,1200.50,10\n"
    "2026-01-06,Widget B,850.00,7\n"
    "2026-01-07,Gadget C,2200.00,18\n"
    "2026-01-08,Widget A,300.25,3\n"
    "2026-01-09,Widget B,410.10,4\n"
    "2026-01-10,Widget A,90.00,1\n"
    "2026-01-11,Gadget C,99.99,1\n"
)
MISSING_COLS_CSV = "date,item,amount\n2026-01-05,A,10\n"
MALFORMED_CSV = GOOD_CSV + "2026-01-12,Widget A,not-a-number,2\n"

TASK = ("Read sales.csv, validate it, calculate revenue totals by product, "
        "produce report.json and report.md, and verify both outputs.")


def _new_env(base: Path):
    run_dir = base / f"run_{int(time.time() * 1000)}"
    (run_dir / "workspace").mkdir(parents=True)
    db = run_dir / "graph.db"
    store = GraphStore(str(db))
    seed_graph(store)
    return run_dir, store


def _scenario(name, csv_content, repeats, selection=None):
    from app.execution.engine import _default_llm
    base = Path(__file__).parent / ".benchmark"
    rows = []
    for _ in range(repeats):
        run_dir, store = _new_env(base)
        if csv_content is not None:
            (run_dir / "workspace" / "sales.csv").write_text(csv_content, encoding="utf-8")
        engine = ExecutionEngine(store=store, bus=EventBus(store), llm=_default_llm())
        t0 = time.perf_counter()
        result = engine.run(TASK, project_id=None, selection=selection or {"mode": "auto"})
        elapsed = time.perf_counter() - t0
        events = store.events_since(0, task_id=result["task_id"], limit=1000)
        rows.append({
            "scenario": name,
            "status": result["status"],
            "verdict": (result.get("result") or {}).get("verification", {}).get("verdict"),
            "elapsed_s": round(elapsed, 3),
            "steps": len(result.get("steps") or []),
            "events": len(events),
        })
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repeats", type=int, default=5)
    args = parser.parse_args()

    provider = "mock" if settings.use_mock_llm else settings.llm_provider
    model = "MockLLM" if settings.use_mock_llm else (
        {"ollama": settings.ollama_model, "openrouter": settings.openrouter_model,
         "gemini": settings.gemini_model}.get(settings.llm_provider, "?"))

    print(f"Provider: {provider}  Model: {model}  happy-path repeats: {args.repeats}")
    all_rows = []
    all_rows += _scenario("valid_csv_pass", GOOD_CSV, args.repeats)
    all_rows += _scenario("missing_columns_fail_fast", MISSING_COLS_CSV, 1)
    all_rows += _scenario("malformed_rows_fail", MALFORMED_CSV, 1)
    selected = {"mode": "selected", "skill_ids": ["skill:report-writing"],
                "include_dependencies": True}
    all_rows += _scenario("selected_scope_with_deps", GOOD_CSV, 1, selection=selected)

    happy = [r["elapsed_s"] for r in all_rows if r["scenario"] == "valid_csv_pass"]
    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "provider": provider,
        "model": model,
        "happy_path_repeats": args.repeats,
        "happy_path": {
            "mean_s": round(statistics.mean(happy), 3),
            "median_s": round(statistics.median(happy), 3),
            "min_s": min(happy),
            "max_s": max(happy),
            **({"stdev_s": round(statistics.stdev(happy), 3)} if len(happy) > 1 else {}),
        },
        "rows": all_rows,
    }
    out = Path(__file__).parent / "benchmark_run.json"
    out.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print(f"\n{'scenario':32} {'status':10} {'verdict':12} {'seconds':>8} {'events':>7}")
    for r in all_rows:
        print(f"{r['scenario']:32} {r['status']:10} {str(r['verdict']):12} "
              f"{r['elapsed_s']:>8.3f} {r['events']:>7}")
    print(f"\nHappy path mean {summary['happy_path']['mean_s']}s "
          f"median {summary['happy_path']['median_s']}s")
    print(f"Written: {out}")
    print("Paste the rows into ../BENCHMARK_REPORT.md (label the provider!).")


if __name__ == "__main__":
    main()
