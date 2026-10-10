"""End-to-end engine tests for the canonical sales-report workflow (PART 13).

All runs are deterministic (llm=None -> the engine records its degraded-mode
fallback honestly); the live qwen run is exercised separately in the acceptance
report. Filesystem fixtures live under an isolated workspace per test.
"""
import json
import os

import pytest

from app.config import settings
from app.events import bus as bus_mod
from app.execution.engine import ExecutionEngine
from app.graph import store as store_mod
from app.skills import library


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
EXPECTED = {"Widget A": 1590.75, "Widget B": 1260.10, "Gadget C": 2299.99}
TASK = ("Read sales.csv, validate it, calculate revenue totals by product, "
        "produce report.json and report.md, and verify both outputs.")


@pytest.fixture()
def env(tmp_path, monkeypatch):
    db = tmp_path / "graph.db"
    ws = tmp_path / "workspace"
    ws.mkdir()
    monkeypatch.setattr(settings, "memory_db_path", str(db))
    monkeypatch.setattr(settings, "workspace_dir", str(ws))
    monkeypatch.setattr(settings, "retry_backoff_seconds", 0.01)
    st = store_mod.GraphStore(str(db))
    monkeypatch.setattr(store_mod, "_store", st)
    monkeypatch.setattr(bus_mod, "_bus", bus_mod.EventBus(st))
    library.seed_graph(st)
    yield st, str(ws)


def _write(ws, name, content):
    with open(os.path.join(ws, name), "w", encoding="utf-8", newline="") as f:
        f.write(content)


def _run(env, request, selection=None):
    st, ws = env
    eng = ExecutionEngine(store=st, bus=bus_mod.EventBus(st), llm=None)
    return eng.run(request, project_id=None, selection=selection or {"mode": "auto"}), ws


def test_1_valid_csv_completes_with_independent_pass(env):
    _write(env[1], "sales.csv", GOOD_CSV)
    result, ws = _run(env, TASK)
    assert result["status"] == "completed", result["result"].get("final_result")
    assert result["result"]["verification"]["verdict"] == "PASS"
    with open(os.path.join(ws, "report.json"), encoding="utf-8") as f:
        report = json.load(f)
    for product, total in EXPECTED.items():
        assert abs(report["totals"][product]["revenue"] - total) < 0.01
    md = open(os.path.join(ws, "report.md"), encoding="utf-8").read()
    assert "Revenue Totals by Product" in md and "Widget A" in md
    types = env[0].overview()["type_counts"]
    assert {"task", "execution_step", "experience"} <= set(types)
    kinds = [e.event_type.value for e in env[0].events_since(0, task_id=result["task_id"])]
    assert "VERIFICATION_PASSED" in kinds and "TASK_COMPLETED" in kinds


def test_2_missing_columns_fail_fast_with_evidence(env):
    _write(env[1], "sales.csv", "date,item,amount\n2026-01-05,A,10\n")
    result, _ = _run(env, TASK)
    assert result["status"] == "failed"
    failures = env[0].list_failure_episodes()
    assert failures and failures[0]["error_signature"].startswith("validate_csv")
    assert "missing columns" in failures[0]["error_text"]
    # no artifacts were claimed or written
    assert not os.path.exists(os.path.join(env[1], "report.json"))


def test_3_malformed_rows_do_not_claim_success(env):
    _write(env[1], "sales.csv", GOOD_CSV + "2026-01-12,Widget X,not-a-number,2\n")
    result, _ = _run(env, TASK)
    assert result["status"] == "failed"
    verdict = result["result"].get("verification", {}).get("verdict")
    assert verdict in (None, "FAIL", "INCONCLUSIVE")


def test_4_transient_tool_error_recovers_with_bounded_retry(env):
    _write(env[1], "sales.csv", GOOD_CSV)
    st, ws = env
    calls = {"n": 0}
    real = ExecutionEngine and None
    from app.execution import engine as engine_mod
    real = engine_mod.ENGINE_TOOLS["aggregate_csv"]

    def flaky(*a, **k):
        calls["n"] += 1
        if calls["n"] == 1:
            raise TimeoutError("simulated transient read failure")
        return real(*a, **k)

    engine_mod.ENGINE_TOOLS["aggregate_csv"] = flaky
    try:
        result, _ = _run(env, TASK)
        assert result["status"] == "completed"
        assert calls["n"] == 2, "retry must actually re-invoke the tool"
        kinds = [e.event_type.value for e in st.events_since(0)]
        assert "RETRY_SCHEDULED" in kinds
    finally:
        engine_mod.ENGINE_TOOLS["aggregate_csv"] = real


def test_5_permanent_tool_failure_stops_after_bound(env):
    """A tool that always fails exhausts bounded retries, records a failure
    episode, and the task fails without claiming outputs."""
    _write(env[1], "sales.csv", GOOD_CSV)
    st, ws = env
    from app.execution import engine as engine_mod
    real = engine_mod.ENGINE_TOOLS["aggregate_csv"]
    calls = {"n": 0}

    def broken(*a, **k):
        calls["n"] += 1
        raise TimeoutError("persistent failure")

    engine_mod.ENGINE_TOOLS["aggregate_csv"] = broken
    try:
        result, _ = _run(env, TASK)
        assert result["status"] == "failed"
        assert calls["n"] == 1 + settings.max_retries_per_step
        assert env[0].list_failure_episodes()
    finally:
        engine_mod.ENGINE_TOOLS["aggregate_csv"] = real


def test_6_incorrect_output_path_caught_by_verifier(env):
    _write(env[1], "sales.csv", GOOD_CSV)
    from app.execution import engine as engine_mod
    real = engine_mod.ENGINE_TOOLS["write_json"]

    def misdirected(path, data, **k):
        return real(path="wrong_report.json", data=data, **k)

    engine_mod.ENGINE_TOOLS["write_json"] = misdirected
    try:
        result, _ = _run(env, TASK)
        assert result["result"]["verification"]["verdict"] == "FAIL"
        assert result["status"] == "failed"
    finally:
        engine_mod.ENGINE_TOOLS["write_json"] = real


def test_7_falsified_values_fail_recomputation(env):
    _write(env[1], "sales.csv", GOOD_CSV)
    from app.execution import engine as engine_mod
    real = engine_mod.ENGINE_TOOLS["write_json"]

    def doctored(path, data, **k):
        if isinstance(data, dict) and "totals" in data:
            data = json.loads(json.dumps(data))
            data["totals"]["Widget A"]["revenue"] = 999999.0
        return real(path=path, data=data, **k)

    engine_mod.ENGINE_TOOLS["write_json"] = doctored
    try:
        result, _ = _run(env, TASK)
        assert result["result"]["verification"]["verdict"] == "FAIL"
    finally:
        engine_mod.ENGINE_TOOLS["write_json"] = real


def test_8_selected_skill_scope_is_respected(env):
    _write(env[1], "sales.csv", GOOD_CSV)
    result, ws = _run(env, TASK, selection={"mode": "selected",
                                            "skill_ids": ["skill:sales-report"],
                                            "include_dependencies": True})
    assert result["status"] == "completed", result["result"].get("final_result")
    # only the selected skill was retrieved — no silent scope widening
    retrieved = {e.node_id for e in env[0].events_since(0, task_id=result["task_id"])
                 if e.event_type.value == "SKILL_RETRIEVED"}
    assert retrieved == {"skill:sales-report"}
    task_edges = env[0].edges_of(f"task:{result['task_id']}", direction="out")
    uses = {e.target_id for e in task_edges if e.edge_type.value == "USES_SKILL"}
    assert uses == {"skill:sales-report"}


def test_9_missing_mandatory_dependency_blocks(env):
    target = library.SKILL_BY_ID["skill:revenue-aggregation"]  # requires csv-validation
    result, _ = _run(env, TASK, selection={
        "mode": "selected", "skill_ids": [target.id], "include_dependencies": False})
    assert result["status"] == "blocked"
    report = result["result"]["selection_report"]
    assert "skill:csv-validation" in report["missing_dependencies"]


def test_10_execution_replayable_from_persisted_events(env):
    _write(env[1], "sales.csv", GOOD_CSV)
    result, _ = _run(env, TASK)
    events = env[0].events_since(0, task_id=result["task_id"])
    kinds = [e.event_type.value for e in events]
    for expected in ("TASK_STARTED", "SKILL_RETRIEVED", "PLAN_READY",
                     "TOOL_STARTED", "VERIFICATION_PASSED", "TASK_COMPLETED"):
        assert expected in kinds, f"missing {expected} in {kinds}"
    # every event node references a node that really exists in the graph
    for e in events:
        if e.node_id:
            assert env[0].get_node(e.node_id), f"event node {e.node_id} missing"
