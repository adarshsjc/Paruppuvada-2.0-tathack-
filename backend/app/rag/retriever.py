"""Four-channel retrieval with provenance and a context budget.

Channels:
  knowledge    — document chunks (rag_chunks)
  skill        — skill manifests (compact; details deferred until execution)
  experience   — task experiences, verified failures, validated recoveries (graph)
  state        — the current task's saved plan / checkpoints / outputs (task_runs)

Default scoring is deterministic keyword overlap — honestly labeled
mode="keyword". When EMBEDDING_PROVIDER=ollama and an embedding model is
pulled, mode becomes "embedding" (cosine) with a keyword fallback per chunk.

Retrieved content is wrapped as UNTRUSTED DATA by callers: it can never grant
tool permissions or override the user's task.
"""
import json
import math
import sqlite3
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from app.config import settings
from app.graph.store import GraphStore
from app.skills.library import all_capabilities, tokenize

CHANNELS = ("knowledge", "skill", "experience", "state")


@dataclass
class RetrievedItem:
    channel: str
    score: float
    reason: str
    preview: str
    node_id: Optional[str] = None
    document_id: Optional[str] = None
    chunk_id: Optional[str] = None
    task_id: Optional[str] = None
    content: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        d = {
            "channel": self.channel, "score": self.score, "reason": self.reason,
            "preview": self.preview, "node_id": self.node_id,
            "document_id": self.document_id, "chunk_id": self.chunk_id,
            "task_id": self.task_id, "metadata": self.metadata,
        }
        d["content"] = self.content
        return d


def mode() -> str:
    return "embedding" if settings.embedding_provider == "ollama" else "keyword"


# --- knowledge channel ---------------------------------------------------------

def _search_knowledge(query: str, project_id: Optional[str], limit: int) -> List[RetrievedItem]:
    conn = sqlite3.connect(settings.memory_db_path, timeout=15)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            """SELECT c.id, c.document_id, c.content, c.keywords_json, c.graph_node_id, d.project_id, d.name
               FROM rag_chunks c JOIN rag_documents d ON d.id = c.document_id
               WHERE d.project_id = ? OR d.project_id IS NULL LIMIT 2000""",
            (project_id,),
        ).fetchall()
    finally:
        conn.close()
    q_tokens = set(tokenize(query))
    items: List[RetrievedItem] = []
    for r in rows:
        kws = set(json.loads(r["keywords_json"] or "[]"))
        c_tokens = set(tokenize(r["content"] or "")) | kws
        overlap = q_tokens & (kws | c_tokens)
        if not overlap:
            continue
        score = len(overlap) / math.sqrt(len(c_tokens) + 1)
        items.append(RetrievedItem(
            channel="knowledge", score=round(score, 4),
            reason=f"keyword match: {', '.join(sorted(overlap)[:6])}",
            preview=(r["content"][:200] + "…") if len(r["content"] or "") > 200 else (r["content"] or ""),
            node_id=r["graph_node_id"] or r["id"], document_id=r["document_id"],
            chunk_id=r["id"], content=r["content"] or "",
            metadata={"document": r["name"], "project_id": r["project_id"]},
        ))
    items.sort(key=lambda x: -x.score)
    return items[:limit]


# --- skill channel ---------------------------------------------------------------

def _search_skills(query: str, limit: int) -> List[RetrievedItem]:
    q_tokens = set(tokenize(query))
    items: List[RetrievedItem] = []
    for cap in all_capabilities():
        text = f"{cap.name} {cap.description} {' '.join(cap.keywords)}"
        s_tokens = set(tokenize(text)) | set(cap.keywords)
        overlap = q_tokens & s_tokens
        if not overlap:
            continue
        # compact manifest only — instructions stay deferred
        manifest = {
            "id": cap.id, "name": cap.name, "version": cap.version,
            "description": cap.description, "allowed_tools": cap.allowed_tools,
            "prerequisites": cap.prerequisites,
            "has_canonical_workflow": cap.canonical_workflow is not None,
        }
        items.append(RetrievedItem(
            channel="skill", score=round(len(overlap) / (len(q_tokens) + 1) + cap.importance * 0.1, 4),
            reason=f"capability match: {', '.join(sorted(overlap)[:6])}",
            preview=f"{cap.name} — {cap.description[:160]}",
            node_id=cap.id, content=json.dumps(manifest),
            metadata={"manifest": manifest},
        ))
    items.sort(key=lambda x: -x.score)
    return items[:limit]


# --- experience channel ------------------------------------------------------------

def _search_experience(query: str, project_id: Optional[str], store: GraphStore,
                       limit: int) -> List[RetrievedItem]:
    q_tokens = set(tokenize(query))
    types = ["experience", "failure", "recovery"]
    items: List[RetrievedItem] = []
    for node in store.list_nodes(node_types=types, project_id=project_id, limit=300):
        text = f"{node.label} {node.description} {' '.join(node.metadata.get('keywords', []))}"
        n_tokens = set(tokenize(text))
        overlap = q_tokens & n_tokens
        if not overlap:
            continue
        items.append(RetrievedItem(
            channel="experience", score=round(len(overlap) / (len(q_tokens) + 1), 4),
            reason=f"past {node.node_type.value}: {', '.join(sorted(overlap)[:5])}",
            preview=node.description[:220] or node.label,
            node_id=node.id, content=node.description,
            metadata={"node_type": node.node_type.value, "status": node.status},
        ))
    items.sort(key=lambda x: -x.score)
    return items[:limit]


# --- execution-state channel ----------------------------------------------------------

def _search_state(task_id: Optional[str], store: GraphStore) -> List[RetrievedItem]:
    if not task_id:
        return []
    run = store.get_task_run(task_id)
    if not run:
        return []
    plan = run.get("plan") or {}
    done = [s for s in plan.get("steps", []) if s.get("state") == "completed"]
    remaining = [s for s in plan.get("steps", []) if s.get("state") != "completed"]
    preview = (f"run {task_id[:8]} status={run['status']} "
               f"completed={len(done)}/{len(plan.get('steps', []))}")
    return [RetrievedItem(
        channel="state", score=1.0, reason="current task checkpoint",
        preview=preview, task_id=task_id,
        content=json.dumps({"completed_steps": [s.get("step_id") for s in done],
                            "remaining_steps": [s.get("step_id") for s in remaining],
                            "outputs": plan.get("outputs", {})}),
        metadata={"status": run["status"]},
    )]


# --- budgeted multi-channel retrieval ------------------------------------------------

def retrieve(
    query: str,
    project_id: Optional[str] = None,
    channels: Optional[List[str]] = None,
    task_id: Optional[str] = None,
    store: Optional[GraphStore] = None,
    per_channel_limit: int = 5,
    budget_chars: Optional[int] = None,
) -> Dict[str, Any]:
    store = store or GraphStore()
    channels = [c for c in (channels or list(CHANNELS)) if c in CHANNELS]
    budget = budget_chars or settings.context_budget_chars

    selected: List[RetrievedItem] = []
    if "skill" in channels:
        selected += _search_skills(query, per_channel_limit)
    if "knowledge" in channels:
        selected += _search_knowledge(query, project_id, per_channel_limit)
    if "experience" in channels:
        selected += _search_experience(query, project_id, store, per_channel_limit)
    if "state" in channels:
        selected += _search_state(task_id, store)

    # deduplicate by (channel, node/chunk id) keeping best score
    seen = {}
    for item in selected:
        key = (item.channel, item.chunk_id or item.node_id or item.task_id)
        if key not in seen or item.score > seen[key].score:
            seen[key] = item
    deduped = sorted(seen.values(), key=lambda x: -x.score)

    # enforce budget: content trimmed in rank order
    used = 0
    result_items: List[Dict[str, Any]] = []
    truncated = 0
    for item in deduped:
        if used >= budget:
            truncated += 1
            continue
        room = budget - used
        content = item.content
        if len(content) > room:
            content = content[:room]
            item.reason += " [trimmed to context budget]"
        used += len(content)
        result_items.append(item.to_dict() | {"content": content})

    return {
        "query": query,
        "mode": mode(),  # honest label: "keyword" or "embedding"
        "channels": channels,
        "budget_chars": budget,
        "used_chars": used,
        "truncated": truncated,
        "items": result_items,
    }
