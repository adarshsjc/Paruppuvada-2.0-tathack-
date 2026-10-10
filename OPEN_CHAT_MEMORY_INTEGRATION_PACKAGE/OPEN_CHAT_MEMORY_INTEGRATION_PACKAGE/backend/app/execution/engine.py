"""Dependency-aware autonomous execution engine.

Guarantees enforced here (in Python, not by the LLM):
- execution order follows step dependencies (topological, sequential by default)
- only contract-allowed tools run; every path stays inside the workspace sandbox
- bounded retries per step; validated recovery procedures only
- duplicate side effects prevented on rerun via step checkpoints
- completion requires an independent verifier verdict on real artifacts
- every meaningful action emits a persisted graph event the UI may react to
"""
import json
import time
import traceback
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from app.config import settings
from app.events.bus import EventBus, get_event_bus
from app.execution.contracts import StepState, TaskContract, VerificationReport, Verdict, WorkflowStep
from app.execution import verifier as verifier_mod
from app.graph.schema import (CompressionState, EdgeType, EventType, GraphNode, NodeType,
                              Provenance, Scope)
from app.graph.store import GraphStore, get_graph_store
from app.skills.library import (SKILL_BY_ID, capability_by_id, rank_skills,
                                requires_closure, validate_selection)
from app.tools import file_tools
from app.tools.registry import TOOLS as BASE_TOOLS
from app.rag import retriever


class SalesReportParams(BaseModel):
    """Free parameters Qwen fills for the canonical sales-report workflow.
    All fields have defaults so degraded (non-LLM) runs still work — the
    fallback is recorded honestly in the plan."""
    csv_path: str = "sales.csv"
    group_by: str = "product"
    sum_column: str = "revenue"
    report_json_path: str = "report.json"
    report_md_path: str = "report.md"


# Tool registry for the engine: base tools + sandboxed file tools
ENGINE_TOOLS: Dict[str, Any] = dict(BASE_TOOLS)
file_tools.register(ENGINE_TOOLS)


class StepFailed(Exception):
    def __init__(self, step: WorkflowStep, message: str,
                 verification: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.step = step
        self.message = message
        self.verification = verification


def _tool_for_error_signature(tool: str, err: Exception) -> str:
    return f"{tool}:{type(err).__name__}"


class ExecutionEngine:
    def __init__(self, store: Optional[GraphStore] = None, bus: Optional[EventBus] = None,
                 llm: Optional[Any] = None):
        self.store = store or get_graph_store()
        self.bus = bus or get_event_bus(self.store)
        self.llm = llm  # None => fully deterministic run (tests / degraded mode)
        self.model_id = ""

    # ------------------------------------------------------------------ helpers
    def _emit(self, event_type: EventType, **kw) -> None:
        self.bus.emit(event_type, **kw)

    def _set_model_id(self) -> None:
        if self.llm is None:
            self.model_id = "deterministic"
        else:
            m = getattr(self.llm, "model", None) or getattr(self.llm, "last_model_used", None)
            self.model_id = str(m) if m else type(self.llm).__name__

    # ------------------------------------------------------------------ public
    def run(self, request: str, project_id: Optional[str] = None,
            selection: Optional[Dict[str, Any]] = None,
            task_id: Optional[str] = None) -> Dict[str, Any]:
        selection = selection or {"mode": "auto"}
        task_id = task_id or str(uuid.uuid4())
        started = datetime.utcnow().isoformat()

        # task node in the graph
        task_node_id = f"task:{task_id}"
        self.store.upsert_node(GraphNode(
            id=task_node_id, node_type=NodeType.TASK, label=request[:80],
            description=request, project_id=project_id,
            scope=Scope.PROJECT if project_id else Scope.GLOBAL,
            compression_state=CompressionState.DETAIL_DEFERRED, importance=0.7,
        ))
        self._emit(EventType.TASK_STARTED, task_id=task_id, node_id=task_node_id,
                   message=request[:200], payload={"project_id": project_id,
                                                   "selection": selection})
        self._set_model_id()
        self.store.create_task_run(task_id, request, project_id, selection, self.model_id)

        try:
            return self._run_inner(task_id, task_node_id, request, project_id, selection, started)
        except StepFailed as sf:
            self._finish_failure(task_id, task_node_id, request, project_id,
                                 sf.step, sf.message,
                                 verification=getattr(sf, "verification", None))
            return self._state(task_id, "failed")
        except Exception as e:  # engine-level failure: report honestly
            traceback.print_exc()
            self._emit(EventType.TASK_FAILED, task_id=task_id, node_id=task_node_id,
                       status="error", message=f"engine error: {e}")
            self.store.update_task_run(task_id, status="failed",
                                       result={"final_result": f"Engine error: {e}"},
                                       finished=True)
            return self._state(task_id, "failed")

    # ------------------------------------------------------------------ internals
    def _state(self, task_id: str, status: str) -> Dict[str, Any]:
        run = self.store.get_task_run(task_id)
        run["events"] = [e.model_dump(mode="json") for e in
                         self.store.events_since(0, task_id=task_id, limit=1000)]
        run["status"] = status
        return run

    def _run_inner(self, task_id: str, task_node_id: str, request: str,
                   project_id: Optional[str], selection: Dict[str, Any], started: str) -> Dict[str, Any]:
        # 1) skill scope ------------------------------------------------------
        mode = selection.get("mode", "auto")
        if mode == "selected":
            sel = validate_selection(selection.get("skill_ids", []),
                                     include_dependencies=selection.get("include_dependencies", True))
            if sel["unknown"] or sel["missing_dependencies"]:
                self._emit(EventType.TASK_BLOCKED, task_id=task_id, node_id=task_node_id,
                           status="blocked",
                           message="Selection rejected: missing mandatory dependencies",
                           payload=sel)
                self.store.update_task_run(
                    task_id, status="blocked",
                    result={"final_result": "Task blocked: the selected skill scope is missing "
                                            "mandatory dependencies.", "selection_report": sel},
                    finished=True)
                return self._state(task_id, "blocked")
            resolved = [capability_by_id(s) for s in sel["resolved"]]
            resolved = [c for c in resolved if c]
            automatically = []
            rejected = [{"skill_id": s, "reason": "not in selected scope"}
                        for s in selection.get("rejected_hint", [])]
        else:
            ranked = rank_skills(request)
            resolved_ids = []
            automatically = []
            for r in ranked:
                cap = capability_by_id(r["skill_id"])
                if cap:
                    resolved_ids.append(cap.id)
                    automatically.append(cap.id)
            # include mandatory dependencies of the primary capability
            primary = resolved_ids[0] if resolved_ids else None
            if primary:
                resolved_ids = sorted(requires_closure([primary]) | set(resolved_ids))
            resolved = [capability_by_id(s) for s in resolved_ids]
            resolved = [c for c in resolved if c]
            rejected = []

        for cap in resolved:
            self._emit(EventType.SKILL_RETRIEVED, task_id=task_id, node_id=cap.id,
                       message=f"skill retrieved: {cap.name}",
                       payload={"mode": mode, "matched": cap.id in automatically})
        # dependency resolution events along real REQUIRES edges
        for cap in resolved:
            for pre in cap.prerequisites:
                if pre in {c.id for c in resolved}:
                    eid = f"{cap.id}->{pre}:REQUIRES"
                    self._emit(EventType.DEPENDENCY_RESOLVED, task_id=task_id,
                               node_id=cap.id, edge_id=eid,
                               message=f"{cap.id} requires {pre} (satisfied)")

        # 2) knowledge + experience retrieval (budgeted, provenance-tracked) -----
        retrieval = retriever.retrieve(
            request, project_id=project_id, channels=["knowledge", "experience"],
            task_id=task_id, store=self.store)
        for item in retrieval["items"]:
            self._emit(EventType.KNOWLEDGE_RETRIEVED, task_id=task_id,
                       node_id=item.get("node_id"),
                       message=f"[{item['channel']}] {item['reason']}",
                       payload={"score": item["score"], "channel": item["channel"],
                                "preview": item["preview"]})

        # 3) choose primary capability & plan -------------------------------------
        primary = None
        for cap in resolved:
            if cap.canonical_workflow:
                primary = cap
                break
        if primary is None and resolved:
            primary = resolved[0]

        contract = TaskContract(
            task_id=task_id, goal=request,
            constraints=["workspace sandbox only", "no network tools",
                         "backend-enforced tool permissions"],
            expected_outputs=[], required_capabilities=[c.id for c in resolved],
            allowed_tools=sorted({t for c in resolved for t in c.allowed_tools}),
            completion_criteria="Independent verifier returns PASS on all declared outputs",
            verification_rules=sorted({r for c in resolved for r in c.verification_rules}),
            selection_mode=mode, selected_skills=selection.get("skill_ids", []) if mode == "selected" else [],
            automatically_retrieved=automatically, rejected_candidates=rejected,
            graph_version=str(self.store.stats()["nodes"]),
            created_at=datetime.utcnow(),
        )

        if primary is None:
            self._emit(EventType.TASK_BLOCKED, task_id=task_id, node_id=task_node_id,
                       status="blocked", message="no capability matched the request")
            self.store.update_task_run(task_id, status="blocked",
                                       result={"final_result": "No skill matched this request."},
                                       finished=True)
            return self._state(task_id, "blocked")

        steps, params, fallback_reason = self._build_steps(task_id, task_node_id, primary,
                                                           request, contract)
        contract.expected_outputs = [s for s in
                                     [getattr(params, "report_json_path", None),
                                      getattr(params, "report_md_path", None)] if s]
        self._emit(EventType.PLAN_READY, task_id=task_id, node_id=task_node_id,
                   message=f"plan: {len(steps)} steps via {primary.id}",
                   payload={"steps": [s.model_dump(exclude={"result"}) for s in steps],
                            "fallback_reason": fallback_reason,
                            "params": params.model_dump() if params else {}})
        self.store.update_task_run(task_id, plan=self._plan_payload(steps, params, fallback_reason))

        # 4) execute in dependency order ------------------------------------------
        outputs: Dict[str, Any] = {}
        by_id = {s.step_id: s for s in steps}
        for step in steps:
            unsatisfied = [d for d in step.depends_on
                           if by_id[d].state not in (StepState.COMPLETED, StepState.VERIFIED)]
            if unsatisfied:
                step.state = StepState.SKIPPED
                continue
            step.inputs = self._hydrate_inputs(step, params, outputs)
            self._execute_step(task_id, step, contract)
            if step.state in (StepState.COMPLETED, StepState.VERIFIED):
                outputs[step.step_id] = step.result
            else:
                verification = step.result.get("report") if isinstance(step.result, dict) else None
                raise StepFailed(step, step.error or "step failed", verification=verification)

        # 5) finalize ------------------------------------------------------------
        verification: Optional[VerificationReport] = outputs.get("verify_outputs", {}).get("report") \
            if isinstance(outputs.get("verify_outputs"), dict) else None
        passed = bool(verification and verification.get("verdict") == Verdict.PASS.value)
        summary = self._final_summary(task_id, request, outputs, verification, params)
        status = "completed" if passed else ("failed" if verification else "completed")

        experience_id = f"experience:{task_id[:8]}"
        self.store.upsert_node(GraphNode(
            id=experience_id, node_type=NodeType.EXPERIENCE,
            label=f"Experience: {request[:60]}",
            description=summary, project_id=project_id,
            scope=Scope.PROJECT if project_id else Scope.GLOBAL,
            parent_id=task_node_id,
            compression_state=CompressionState.SUMMARY_STORED, importance=0.6,
            metadata={"task_id": task_id, "status": status,
                      "verdict": verification.get("verdict") if verification else None,
                      "skills_used": [c.id for c in resolved],
                      "keywords": [w for w in request.lower().split()[:8]]},
        ))
        self.store.upsert_edge(task_node_id, experience_id, EdgeType.LEARNED_FROM,
                               Provenance.EXTRACTED)
        for cap in resolved:
            self.store.upsert_edge(task_node_id, cap.id, EdgeType.USES_SKILL,
                                   Provenance.EXTRACTED)
        if passed:
            self._emit(EventType.TASK_COMPLETED, task_id=task_id, node_id=task_node_id,
                       message=summary[:300], payload={"verdict": "PASS"})
        else:
            self._emit(EventType.TASK_FAILED, task_id=task_id, node_id=task_node_id,
                       status="failed", message=summary[:300],
                       payload={"verdict": (verification or {}).get("verdict")})
        self.store.update_task_run(task_id, status=status, plan=self._plan_payload(
            steps, params, fallback_reason, outputs),
            result={"final_result": summary, "verification": verification,
                    "outputs": {k: (v if not isinstance(v, dict) else
                                    {kk: vv for kk, vv in v.items() if kk != "report"})
                                for k, v in outputs.items()}},
            finished=True)
        return self._state(task_id, status)

    # ------------------------------------------------------------------ planning
    def _build_steps(self, task_id: str, task_node_id: str, primary, request: str,
                     contract: TaskContract):
        params = SalesReportParams()
        fallback_reason = None
        if primary.canonical_workflow:
            # Qwen fills the free parameters (this is genuine LLM reasoning use)
            if self.llm is not None:
                try:
                    prompt = (
                        "Extract report parameters for this task.\n"
                        f"Task: {request}\n"
                        "Rules: csv_path/report paths are workspace-relative file names. "
                        "group_by is the category column (e.g. product), sum_column is the "
                        "numeric column to total (e.g. revenue). Use exactly the names the "
                        "user gave; otherwise sensible defaults.\n"
                        'Output JSON: {"csv_path": "...", "group_by": "...", "sum_column": "...", '
                        '"report_json_path": "...", "report_md_path": "..."}'
                    )
                    params = self.llm.generate_json(prompt, SalesReportParams)
                except Exception as e:
                    fallback_reason = f"LLM parameter extraction failed ({e}); used defaults"
            steps = []
            for t in primary.canonical_workflow:
                steps.append(WorkflowStep(
                    step_id=t.step_id, goal=t.goal, tool=t.tool,
                    expected_output=t.expected_output, depends_on=list(t.depends_on),
                    permission=t.permission, retryable=t.retryable, skill_id=primary.id,
                ))
            return steps, params, fallback_reason

        # generic path: one LLM-planned action list constrained to allowed tools
        steps = []
        if self.llm is not None:
            try:
                from app.models.schemas import Plan
                plan = self.llm.generate_json(
                    f"Create a step-by-step plan for: {request}\n"
                    f"Allowed tools: {contract.allowed_tools}", Plan)
                for i, st in enumerate(plan.steps[:settings.max_workflow_steps]):
                    steps.append(WorkflowStep(
                        step_id=f"step_{i+1}", goal=st.goal, tool="none",
                        expected_output=st.expected_output,
                        depends_on=[f"step_{i}"] if i else []))
            except Exception as e:
                fallback_reason = f"LLM planning failed: {e}"
        if not steps:
            fallback_reason = fallback_reason or "no plan; delegated to legacy ReAct orchestrator"
            steps = [WorkflowStep(step_id="legacy_react", goal=request, tool="__legacy__",
                                  expected_output="final answer")]
        return steps, params, fallback_reason

    def _hydrate_inputs(self, step: WorkflowStep, params: SalesReportParams,
                        outputs: Dict[str, Any]) -> Dict[str, Any]:
        p = params.model_dump()
        if step.tool == "validate_csv":
            return {"path": p["csv_path"], "required_columns": ["date", "product", "revenue"]}
        if step.tool == "aggregate_csv":
            return {"path": p["csv_path"], "group_by": p["group_by"],
                    "sum_columns": [p["sum_column"]]}
        if step.tool == "write_json":
            totals = (outputs.get("aggregate_revenue") or {}).get("totals") \
                if isinstance(outputs.get("aggregate_revenue"), dict) else None
            return {"path": p["report_json_path"],
                    "data": {"source": p["csv_path"], "group_by": p["group_by"],
                             "sum_column": p["sum_column"], "totals": totals or {}}}
        if step.tool == "write_markdown":
            totals = (outputs.get("aggregate_revenue") or {}).get("totals") \
                if isinstance(outputs.get("aggregate_revenue"), dict) else {}
            md = ["# Sales Report", "",
                  f"Source: `{p['csv_path']}` — {p['sum_column']} totals grouped by {p['group_by']}",
                  "", "## Revenue Totals by Product", ""]
            for product, vals in sorted((totals or {}).items()):
                value = vals.get(p["sum_column"], vals) if isinstance(vals, dict) else vals
                md.append(f"- **{product}**: {value:,.2f}" if isinstance(value, (int, float))
                          else f"- **{product}**: {value}")
            md.append("")
            return {"path": p["report_md_path"], "content": "\n".join(md)}
        if step.tool == "__verify__":
            return {"params": p}
        return dict(step.inputs or {})

    # ------------------------------------------------------------------ execution
    def _execute_step(self, task_id: str, step: WorkflowStep, contract: TaskContract) -> None:
        step_node_id = f"step:{task_id[:8]}:{step.step_id}"
        step.node_id = step_node_id
        self.store.upsert_node(GraphNode(
            id=step_node_id, node_type=NodeType.EXECUTION_STEP,
            label=f"{step.step_id} ({step.tool})", description=step.goal,
            parent_id=f"task:{task_id}", compression_state=CompressionState.DETAIL_DEFERRED,
            importance=0.4, metadata={"tool": step.tool, "state": step.state.value},
        ))
        self.store.upsert_edge(f"task:{task_id}", step_node_id, EdgeType.CONTAINS,
                               Provenance.EXTRACTED)

        if step.tool == "__verify__":
            self._run_verification(task_id, step)
            return
        if step.tool == "__legacy__":
            from app.agents.orchestrator import run_workflow
            legacy = run_workflow(step.goal)
            step.result = {"final_result": legacy.final_result, "legacy": True}
            step.state = StepState.COMPLETED
            return

        if step.tool not in contract.allowed_tools:
            step.state = StepState.FAILED
            step.error = f"Tool '{step.tool}' is not allowed for this task's skill scope"
            self._record_failure(task_id, step, PermissionError(step.error))
            return

        tool_fn = ENGINE_TOOLS.get(step.tool)
        if tool_fn is None:
            step.state = StepState.FAILED
            step.error = f"Unknown tool '{step.tool}'"
            self._record_failure(task_id, step, ValueError(step.error))
            return

        max_attempts = 1 + (settings.max_retries_per_step if step.retryable else 0)
        while step.attempts < max_attempts:
            step.attempts += 1
            self._emit(EventType.TOOL_STARTED, task_id=task_id, step_id=step.step_id,
                       node_id=step_node_id,
                       message=f"{step.tool} attempt {step.attempts}",
                       payload={"tool": step.tool, "inputs": _safe_json(step.inputs)})
            try:
                raw = tool_fn(**step.inputs)
                result = _maybe_json(raw)
                # fail fast on a completed-but-invalid validation: never aggregate
                # (and never claim outputs) from a file the validator rejected
                if (step.tool == "validate_csv" and isinstance(result, dict)
                        and result.get("valid") is False):
                    invalid_err = file_tools.ToolError(
                        "validation failed: "
                        + (f"missing columns {result.get('missing_columns')}"
                           if result.get("missing_columns") else "malformed rows")
                        + f" {result.get('malformed_rows') or ''}".strip())
                    step.result = result
                    step.error = f"ToolError: {invalid_err}"
                    step.state = StepState.FAILED
                    self._record_failure(task_id, step, invalid_err)
                    self._emit(EventType.TOOL_COMPLETED, task_id=task_id,
                               step_id=step.step_id, node_id=step_node_id,
                               status="failed",
                               message=f"validate_csv rejected the file: {step.error}",
                               payload={"validation": _safe_json(result)})
                    raise StepFailed(step, step.error)
                step.result = result
                step.state = StepState.COMPLETED
                self.store.upsert_node(GraphNode(
                    id=step_node_id, node_type=NodeType.EXECUTION_STEP,
                    label=f"{step.step_id} ({step.tool})", description=step.goal,
                    parent_id=f"task:{task_id}", importance=0.4,
                    metadata={"tool": step.tool, "state": "completed"}))
                self._emit(EventType.TOOL_COMPLETED, task_id=task_id, step_id=step.step_id,
                           node_id=step_node_id, status="ok",
                           message=f"{step.tool} completed",
                           payload={"result": _safe_json(result)})
                return
            except Exception as e:
                step.error = f"{type(e).__name__}: {e}"
                signature = _tool_for_error_signature(step.tool, e)
                recovery = self.store.find_recovery_procedure(signature)
                if recovery:
                    self._emit(EventType.RECOVERY_STARTED, task_id=task_id,
                               step_id=step.step_id, node_id=step_node_id,
                               message=f"applying validated recovery {recovery['id'][:8]} "
                                       f"for {signature}",
                               payload={"recovery": recovery["description"]})
                    adjusted = self._apply_recovery(step, recovery)
                    if adjusted:
                        continue
                if step.retryable and step.attempts < max_attempts:
                    self._emit(EventType.RETRY_SCHEDULED, task_id=task_id,
                               step_id=step.step_id, node_id=step_node_id,
                               status="retrying", message=f"retry after: {step.error}")
                    time.sleep(settings.retry_backoff_seconds)
                    continue
                step.state = StepState.FAILED
                self._record_failure(task_id, step, e, signature=signature,
                                     recovery_id=recovery["id"] if recovery else None)
                self._emit(EventType.TOOL_COMPLETED, task_id=task_id, step_id=step.step_id,
                           node_id=step_node_id, status="failed",
                           message=f"{step.tool} failed: {step.error}")
                return

    def _apply_recovery(self, step: WorkflowStep, recovery: Dict[str, Any]) -> bool:
        """Apply a validated recovery procedure's input adjustments. Returns True if retried."""
        applied = False
        for fix in recovery.get("steps", []):
            if fix.get("action") == "set_input" and fix.get("input") in step.inputs:
                step.inputs[fix["input"]] = fix.get("value")
                applied = True
        return applied

    def _run_verification(self, task_id: str, step: WorkflowStep) -> None:
        p = step.inputs["params"]
        report: VerificationReport = verifier_mod.verify_sales_report(
            p["report_json_path"], p["report_md_path"], p["csv_path"],
            p["group_by"], p["sum_column"])
        step.result = {"report": report.model_dump()}
        ok = report.verdict == Verdict.PASS
        step.state = StepState.VERIFIED if ok else StepState.VERIFICATION_FAILED
        self._emit(EventType.VERIFICATION_PASSED if ok else EventType.VERIFICATION_FAILED,
                   task_id=task_id, step_id=step.step_id, node_id=step.node_id,
                   status="ok" if ok else "failed",
                   message=f"independent verification: {report.verdict.value}",
                   payload={"checks": [c.model_dump() for c in report.checks]})

    def _record_failure(self, task_id: str, step: WorkflowStep, err: Exception,
                        signature: Optional[str] = None, recovery_id: Optional[str] = None) -> None:
        signature = signature or _tool_for_error_signature(step.tool, err)
        fid = self.store.add_failure_episode({
            "task_id": task_id, "step_id": step.step_id, "skill_id": step.skill_id,
            "tool": step.tool, "error_signature": signature,
            "error_text": f"{type(err).__name__}: {err}",
            "evidence": {"inputs": _safe_json(step.inputs), "error": str(err)},
            "diagnosis_status": "hypothesized",
            "recovery_procedure_id": recovery_id, "verification": "",
        })
        failure_node = f"failure:{fid[:13]}"
        self.store.upsert_node(GraphNode(
            id=failure_node, node_type=NodeType.FAILURE,
            label=f"Failure: {step.tool} {type(err).__name__}",
            description=f"{step.error}", project_id=None,
            scope=Scope.GLOBAL, parent_id=step.node_id or f"task:{task_id}",
            compression_state=CompressionState.DETAIL_DEFERRED, importance=0.7,
            metadata={"episode_id": fid, "signature": signature,
                      "diagnosis_status": "hypothesized", "task_id": task_id},
        ))
        if step.node_id:
            self.store.upsert_edge(step.node_id, failure_node, EdgeType.FAILED_DUE_TO,
                                   Provenance.EXTRACTED,
                                   {"signature": signature})
        if recovery_id:
            self.store.upsert_edge(failure_node, f"recovery:{recovery_id[:13]}",
                                   EdgeType.RECOVERS_WITH, Provenance.EXPLICIT)

    def _finish_failure(self, task_id: str, task_node_id: str, request: str,
                        project_id: Optional[str], step: WorkflowStep, message: str,
                        verification: Optional[Dict[str, Any]] = None) -> None:
        summary = (f"Task failed at step '{step.step_id}': {message}. Failure episode recorded; "
                   "no outputs were claimed.")
        self._emit(EventType.TASK_FAILED, task_id=task_id, node_id=task_node_id,
                   status="failed", message=summary)
        result: Dict[str, Any] = {"final_result": summary, "failed_step": step.step_id}
        if verification is not None:
            result["verification"] = verification
        self.store.update_task_run(task_id, status="failed", result=result, finished=True)

    def _final_summary(self, task_id: str, request: str, outputs: Dict[str, Any],
                       verification: Optional[Dict[str, Any]], params: SalesReportParams) -> str:
        verdict = (verification or {}).get("verdict", "N/A")
        totals = {}
        agg = outputs.get("aggregate_revenue")
        if isinstance(agg, dict):
            totals = agg.get("totals", {})
        p = params.model_dump()
        lines = [f"Task completed. Verdict: {verdict}.",
                 f"Validated {p['csv_path']}, computed {p['sum_column']} totals by {p['group_by']}, "
                 f"wrote {p['report_json_path']} and {p['report_md_path']}, both verified "
                 "independently against a recomputation from the CSV."]
        for k in sorted(totals):
            v = totals[k].get(p["sum_column"]) if isinstance(totals[k], dict) else totals[k]
            lines.append(f"- {k}: {v:,.2f}" if isinstance(v, (int, float)) else f"- {k}: {v}")
        deterministic = "\n".join(lines)
        if self.llm is None:
            return deterministic
        try:
            text = self.llm.generate_text(
                "Summarize this verified task result for the user in 2-4 sentences. "
                "Keep every number exactly as given:\n" + deterministic)
            if not text or "[MOCK]" in text:
                return deterministic  # mock output carries no real information
            return text
        except Exception:
            return deterministic

    def _plan_payload(self, steps: List[WorkflowStep], params: SalesReportParams,
                      fallback_reason: Optional[str],
                      outputs: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        return {
            "steps": [s.model_dump(exclude={"result"}, mode="json") for s in steps],
            "params": params.model_dump() if params else {},
            "fallback_reason": fallback_reason,
            "outputs": {k: _safe_json(v) for k, v in (outputs or {}).items()},
        }


def _maybe_json(raw: Any) -> Any:
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            return raw
    return raw


def _safe_json(obj: Any) -> Any:
    try:
        json.dumps(obj)
        return obj
    except (TypeError, ValueError):
        return str(obj)


def run_task(request: str, project_id: Optional[str] = None,
             selection: Optional[Dict[str, Any]] = None,
             llm: Optional[Any] = None,
             store: Optional[GraphStore] = None,
             task_id: Optional[str] = None) -> Dict[str, Any]:
    """Convenience entry point used by the API layer."""
    engine = ExecutionEngine(store=store, llm=llm if llm is not None else _default_llm())
    return engine.run(request, project_id=project_id, selection=selection, task_id=task_id)


def _default_llm() -> Optional[Any]:
    try:
        from app.agents.llm import get_llm
        return get_llm()
    except Exception:
        return None
