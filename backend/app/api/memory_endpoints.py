"""Memory Management API: graph views, bounded expansion, skills, RAG
inspection, execution events (SSE + polling), failures, recoveries, curation,
compression states, and the optional MiroFish adapter.
"""
import asyncio
import json
import threading
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.adapters import mirofish
from app.config import settings
from app.events.bus import get_event_bus, sse_format
from app.execution.engine import run_task
from app.graph.schema import CompressionState
from app.graph.store import get_graph_store
from app.memory import analysis
from app.rag import ingest as rag_ingest
from app.rag import retriever
from app.skills import library

router = APIRouter()

# ---------------------------------------------------------------- graph views

@router.get("/api/v1/memory-graph/overview")
def graph_overview(project_id: Optional[str] = None):
    return get_graph_store().overview(project_id)


@router.get("/api/v1/memory-graph/node/{node_id}")
def graph_node(node_id: str):
    store = get_graph_store()
    node = store.get_node(node_id)
    if not node:
        raise HTTPException(404, "node not found")
    store.bump_access(node_id)
    edges = store.edges_of(node_id)
    related_ids = {e.source_id for e in edges} | {e.target_id for e in edges}
    related = {n.id: {"label": n.label, "node_type": n.node_type.value}
               for n in (store.get_node(rid) for rid in related_ids) if n and n.id != node_id}
    out = node.model_dump()
    out["edges"] = [{**e.model_dump(mode="json"),
                     "source_label": related.get(e.source_id, {}).get("label", e.source_id),
                     "target_label": related.get(e.target_id, {}).get("label", e.target_id)}
                    for e in edges]
    # skill detail extras: previous executions, related failures/recoveries
    if node.node_type.value == "skill":
        runs = [r for r in store.list_task_runs(limit=50)
                if node_id in (r.get("skill_selection") or {}).get("resolved", [])
                or node_id in ((r.get("plan") or {}).get("skills_used") or [])]
        out["recent_executions"] = [
            {"task_id": r["task_id"], "status": r["status"], "started_at": r["started_at"],
             "verdict": (r.get("result") or {}).get("verification", {}).get("verdict")}
            for r in runs[:10]]
    if node.node_type.value == "failure":
        out["episode"] = node.metadata
    return out


@router.get("/api/v1/memory-graph/node/{node_id}/expand")
def graph_expand(node_id: str, depth: int = Query(1, ge=1, le=2),
                 limit: int = Query(100, ge=1, le=200),
                 project_id: Optional[str] = None):
    store = get_graph_store()
    result = store.expand(node_id, depth=depth, limit=limit, project_id=project_id)
    if result["center"] is None:
        raise HTTPException(404, "node not found")
    # decompressing a group is a data/view operation only: mark view state
    store.set_compression_state(node_id, CompressionState.EXPANDED)
    return result


@router.post("/api/v1/memory-graph/node/{node_id}/collapse")
def graph_collapse(node_id: str):
    store = get_graph_store()
    if not store.get_node(node_id):
        raise HTTPException(404, "node not found")
    store.set_compression_state(node_id, CompressionState.COLLAPSED)
    return {"status": "collapsed", "note": "visual only; no records were changed or removed"}


@router.post("/api/v1/memory-graph/node/{node_id}/archive")
def graph_archive(node_id: str):
    store = get_graph_store()
    if not store.get_node(node_id):
        raise HTTPException(404, "node not found")
    store.set_compression_state(node_id, CompressionState.ARCHIVED)
    return {"status": "archived", "note": "record retained; excluded from default retrieval"}


@router.post("/api/v1/memory-graph/node/{node_id}/restore")
def graph_restore(node_id: str):
    store = get_graph_store()
    if not store.get_node(node_id):
        raise HTTPException(404, "node not found")
    store.set_compression_state(node_id, CompressionState.DETAIL_DEFERRED)
    return {"status": "restored"}


@router.delete("/api/v1/memory-graph/node/{node_id}")
def graph_delete(node_id: str):
    """User-authorized deletion (soft: row kept for provenance)."""
    store = get_graph_store()
    if not store.get_node(node_id):
        raise HTTPException(404, "node not found")
    store.soft_delete_node(node_id)
    return {"status": "deleted", "note": "soft delete; provenance row retained"}


@router.get("/api/v1/memory-graph/search")
def graph_search(q: str, types: Optional[str] = None, project_id: Optional[str] = None,
                 limit: int = 50):
    type_list = [t.strip() for t in types.split(",")] if types else None
    nodes = get_graph_store().search_nodes(q, node_types=type_list, project_id=project_id,
                                           limit=limit)
    return {"query": q, "results": [n.model_dump(mode="json") for n in nodes]}


@router.get("/api/v1/memory-graph/stats")
def graph_stats():
    st = get_graph_store().stats()
    try:
        from app.skills.library import all_capabilities
        st["skills"] = len(all_capabilities())
    except Exception:
        pass
    try:
        from app.memory.sqlite import get_memory_provider
        st["memories"] = len(get_memory_provider().list_memory())
        st["projects"] = len(get_memory_provider().list_projects())
    except Exception:
        pass
    return st


# ---------------------------------------------------------------- skills

@router.get("/api/v1/skills")
def list_skills(project_id: Optional[str] = None):
    store = get_graph_store()
    caps = []
    for cap in library.all_capabilities():
        node = store.get_node(cap.id)
        caps.append({
            "id": cap.id, "name": cap.name, "category_id": cap.category_id,
            "description": cap.description, "version": cap.version,
            "prerequisites": cap.prerequisites, "allowed_tools": cap.allowed_tools,
            "keywords": cap.keywords,
            "has_canonical_workflow": cap.canonical_workflow is not None,
            "child_count": node.child_count if node else 0,
            "importance": cap.importance,
        })
    cats = [{"id": c.id, "name": c.name, "description": c.description}
            for c in library.CATEGORIES]
    return {"skills": caps, "categories": cats}


class SelectionRequest(BaseModel):
    skill_ids: List[str] = Field(default_factory=list)
    include_dependencies: bool = True


@router.post("/api/v1/skills/validate-selection")
def validate_selection_api(req: SelectionRequest):
    return library.validate_selection(req.skill_ids, req.include_dependencies)


# ---------------------------------------------------------------- RAG

@router.get("/api/v1/rag/documents")
def rag_documents(project_id: Optional[str] = None):
    docs = rag_ingest.list_documents()
    if project_id:
        docs = [d for d in docs if d["project_id"] in (None, project_id)]
    return {"documents": docs, "retrieval_mode": retriever.mode()}


class IngestRequest(BaseModel):
    name: str
    content: str
    project_id: Optional[str] = None


@router.post("/api/v1/rag/ingest")
def rag_ingest_api(req: IngestRequest):
    try:
        return rag_ingest.ingest_text(req.name, req.content, req.project_id,
                                      get_graph_store())
    except ValueError as e:
        raise HTTPException(400, str(e))


class RagQuery(BaseModel):
    query: str
    project_id: Optional[str] = None
    channels: Optional[List[str]] = None
    task_id: Optional[str] = None
    per_channel_limit: int = 5
    budget_chars: Optional[int] = None


@router.post("/api/v1/rag/query")
def rag_query_api(req: RagQuery):
    return retriever.retrieve(req.query, project_id=req.project_id, channels=req.channels,
                              task_id=req.task_id, store=get_graph_store(),
                              per_channel_limit=req.per_channel_limit,
                              budget_chars=req.budget_chars)


# ---------------------------------------------------------------- tasks & events

class MemoryTaskRequest(BaseModel):
    description: str
    project_id: Optional[str] = None
    selection: Dict[str, Any] = Field(default_factory=dict)
    sync: bool = False  # tests/CLI use sync=true; GUI uses events


@router.post("/api/v1/tasks/memory")
def submit_memory_task(req: MemoryTaskRequest):
    if not req.description.strip():
        raise HTTPException(400, "Task description cannot be empty.")
    if req.sync:
        return run_task(req.description, project_id=req.project_id, selection=req.selection)
    # Async path: pre-allocate the task id so the GUI can subscribe to this
    # task's event stream (/api/v1/events/stream?task_id=...) immediately.
    task_id = str(uuid4())

    def _worker():
        try:
            run_task(req.description, project_id=req.project_id, selection=req.selection,
                     task_id=task_id)
        except Exception:  # pragma: no cover - engine records its own failure events
            pass

    threading.Thread(target=_worker, daemon=True).start()
    return {"status": "submitted", "task_id": task_id,
            "note": "stream events via /api/v1/events/stream?task_id=<task_id>"}


@router.get("/api/v1/tasks")
def list_tasks(limit: int = 50, project_id: Optional[str] = None):
    return {"tasks": get_graph_store().list_task_runs(limit=limit, project_id=project_id)}


@router.get("/api/v1/tasks/{task_id}")
def get_task(task_id: str):
    run = get_graph_store().get_task_run(task_id)
    if not run:
        raise HTTPException(404, "task not found")
    run["events"] = [e.model_dump(mode="json")
                     for e in get_graph_store().events_since(0, task_id=task_id, limit=1000)]
    return run


@router.get("/api/v1/events")
def events_poll(since: int = 0, task_id: Optional[str] = None, limit: int = 500):
    events = get_graph_store().events_since(since, task_id=task_id, limit=limit)
    return {"events": [e.model_dump(mode="json") for e in events],
            "latest_seq": get_graph_store().latest_seq()}


@router.get("/api/v1/events/stream")
async def events_stream(task_id: Optional[str] = None):
    async def gen():
        bus = get_event_bus()
        store = get_graph_store()
        last = store.latest_seq()
        yield f"event: connected\ndata: {json.dumps({'latest_seq': last})}\n\n"
        idle = 0
        while True:
            events = store.events_since(last, task_id=task_id)
            if events:
                for e in events:
                    last = e.seq or last
                    yield sse_format(e)
                idle = 0
            else:
                idle += 1
                # heartbeat every ~5s; end the stream after ~60s idle so clients
                # reconnect cleanly (polling endpoint is the fallback)
                if idle % 10 == 0:
                    yield f": keep-alive {last}\n\n"
                if idle >= 120:
                    yield "event: stream_end\ndata: {}\n\n"
                    break
            await asyncio.sleep(0.5)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache",
                                      "X-Accel-Buffering": "no"})


# ---------------------------------------------------------------- failures & recoveries

@router.get("/api/v1/failures")
def list_failures(limit: int = 100, project_id: Optional[str] = None):
    return {"failures": get_graph_store().list_failure_episodes(limit=limit,
                                                                project_id=project_id)}


@router.get("/api/v1/recoveries")
def list_recoveries(limit: int = 100):
    return {"recoveries": get_graph_store().list_recovery_procedures(limit=limit)}


# ---------------------------------------------------------------- curation

@router.post("/api/v1/curation/analyze")
def curation_analyze():
    return analysis.analyze(get_graph_store())


@router.get("/api/v1/curation/suggestions")
def curation_suggestions(status: Optional[str] = "proposed"):
    return {"suggestions": get_graph_store().list_suggestions(status=status)}


@router.post("/api/v1/curation/suggestions/{suggestion_id}/approve")
def curation_approve(suggestion_id: str):
    store = get_graph_store()
    decided = store.decide_suggestion(suggestion_id, "approved")
    if not decided:
        raise HTTPException(404, "suggestion not found or already decided")
    applied = analysis.apply_approval(store, decided)
    return {"status": "approved", "applied": applied}


@router.post("/api/v1/curation/suggestions/{suggestion_id}/reject")
def curation_reject(suggestion_id: str):
    decided = get_graph_store().decide_suggestion(suggestion_id, "rejected")
    if not decided:
        raise HTTPException(404, "suggestion not found or already decided")
    return {"status": "rejected"}


# ---------------------------------------------------------------- MiroFish (optional)

@router.get("/api/v1/mirofish/status")
def mirofish_status():
    return mirofish.status()


@router.post("/api/v1/mirofish/simulate")
def mirofish_simulate(spec: Dict[str, Any]):
    if not settings.mirofish_enabled:
        raise HTTPException(403, "MiroFish adapter is disabled by default. Set "
                                 "MIROFISH_ENABLED=true after adapter testing.")
    try:
        return mirofish.create_simulation(spec)
    except mirofish.MiroFishDisabled as e:
        raise HTTPException(403, str(e))
    except Exception as e:
        raise HTTPException(502, f"MiroFish call failed: {e}")
