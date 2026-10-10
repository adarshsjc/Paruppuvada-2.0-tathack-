"""SQLite-backed store for the canonical memory graph, execution events,
task runs, failure episodes, recovery procedures and curation suggestions.

Design notes:
- Per-call connections (same style as the existing SQLiteMemoryProvider), WAL mode,
  busy timeout — safe for the FastAPI threadpool + SSE reader at our scale.
- All "counts" shown in the UI are real SQL aggregates, never fabricated.
- Bounded traversal only: overview() and expand() always take explicit limits.
"""
import json
import sqlite3
import threading
import uuid
from typing import Any, Dict, Iterable, List, Optional, Tuple

from app.config import settings
from app.graph.schema import (
    CompressionState,
    EdgeType,
    ExecutionEvent,
    EventType,
    GraphEdge,
    GraphNode,
    NodeType,
    Provenance,
    Scope,
    utcnow,
)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS graph_nodes (
    id TEXT PRIMARY KEY,
    node_type TEXT NOT NULL,
    label TEXT NOT NULL,
    description TEXT DEFAULT '',
    project_id TEXT,
    scope TEXT DEFAULT 'global',
    status TEXT DEFAULT 'active',
    compression_state TEXT DEFAULT 'DETAIL_DEFERRED',
    parent_id TEXT,
    metadata_json TEXT DEFAULT '{}',
    importance REAL DEFAULT 0.5,
    access_count INTEGER DEFAULT 0,
    created_at TEXT,
    updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_nodes_type ON graph_nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_nodes_project ON graph_nodes(project_id);
CREATE INDEX IF NOT EXISTS idx_nodes_parent ON graph_nodes(parent_id);

CREATE TABLE IF NOT EXISTS graph_edges (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    edge_type TEXT NOT NULL,
    provenance TEXT DEFAULT 'EXPLICIT',
    weight REAL DEFAULT 1.0,
    metadata_json TEXT DEFAULT '{}',
    created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_edges_source ON graph_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON graph_edges(target_id);

CREATE TABLE IF NOT EXISTS graph_events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT UNIQUE,
    task_id TEXT,
    step_id TEXT,
    node_id TEXT,
    edge_id TEXT,
    event_type TEXT NOT NULL,
    status TEXT DEFAULT 'ok',
    message TEXT DEFAULT '',
    payload_json TEXT DEFAULT '{}',
    created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_task ON graph_events(task_id);

CREATE TABLE IF NOT EXISTS task_runs (
    task_id TEXT PRIMARY KEY,
    request TEXT,
    project_id TEXT,
    status TEXT DEFAULT 'pending',
    skill_selection_json TEXT DEFAULT '{}',
    plan_json TEXT DEFAULT '{}',
    result_json TEXT DEFAULT '{}',
    model_id TEXT DEFAULT '',
    started_at TEXT,
    finished_at TEXT
);

CREATE TABLE IF NOT EXISTS failure_episodes (
    id TEXT PRIMARY KEY,
    task_id TEXT,
    step_id TEXT,
    skill_id TEXT,
    tool TEXT,
    error_signature TEXT,
    error_text TEXT,
    evidence_json TEXT DEFAULT '{}',
    diagnosis_status TEXT DEFAULT 'hypothesized',
    recovery_procedure_id TEXT,
    verification TEXT DEFAULT '',
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS recovery_procedures (
    id TEXT PRIMARY KEY,
    error_signature TEXT,
    description TEXT,
    steps_json TEXT DEFAULT '[]',
    attempt_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'candidate',
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS memory_suggestions (
    id TEXT PRIMARY KEY,
    kind TEXT,
    node_ids_json TEXT DEFAULT '[]',
    detail_json TEXT DEFAULT '{}',
    status TEXT DEFAULT 'proposed',
    created_at TEXT,
    decided_at TEXT
);

-- RAG tables live in the same database; retriever queries them directly, so
-- they must exist on any fresh store, not only after a first ingest.
CREATE TABLE IF NOT EXISTS rag_documents (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    name TEXT,
    path TEXT,
    mime TEXT,
    ingested_at TEXT,
    metadata_json TEXT DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS rag_chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT,
    chunk_index INTEGER,
    content TEXT,
    keywords_json TEXT DEFAULT '[]',
    embedding BLOB,
    graph_node_id TEXT,
    created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_chunks_doc ON rag_chunks(document_id);
"""


def _edge_id(source_id: str, target_id: str, edge_type: str) -> str:
    return f"{source_id}->{target_id}:{edge_type}"


class GraphStore:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or settings.memory_db_path
        self._write_lock = threading.Lock()
        self._init_db()

    # --- plumbing -----------------------------------------------------------
    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=15)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA busy_timeout=15000")
        return conn

    def _init_db(self) -> None:
        with self._conn() as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.executescript(_SCHEMA)

    # --- nodes ---------------------------------------------------------------
    def upsert_node(self, node: GraphNode) -> GraphNode:
        now = utcnow().isoformat()
        with self._write_lock, self._conn() as conn:
            conn.execute(
                """INSERT INTO graph_nodes
                   (id, node_type, label, description, project_id, scope, status,
                    compression_state, parent_id, metadata_json, importance,
                    access_count, created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                   ON CONFLICT(id) DO UPDATE SET
                     label=excluded.label,
                     description=excluded.description,
                     status=excluded.status,
                     compression_state=excluded.compression_state,
                     parent_id=excluded.parent_id,
                     metadata_json=excluded.metadata_json,
                     importance=excluded.importance,
                     updated_at=excluded.updated_at""",
                (
                    node.id, node.node_type.value, node.label, node.description,
                    node.project_id, node.scope.value, node.status,
                    node.compression_state.value, node.parent_id,
                    json.dumps(node.metadata, default=str), node.importance,
                    node.access_count, now, now,
                ),
            )
        return node

    def get_node(self, node_id: str) -> Optional[GraphNode]:
        with self._conn() as conn:
            row = conn.execute("SELECT * FROM graph_nodes WHERE id = ?", (node_id,)).fetchone()
        return self._row_to_node(row) if row else None

    def _row_to_node(self, row: sqlite3.Row) -> GraphNode:
        return GraphNode(
            id=row["id"],
            node_type=NodeType(row["node_type"]),
            label=row["label"],
            description=row["description"] or "",
            project_id=row["project_id"],
            scope=Scope(row["scope"] or "global"),
            status=row["status"],
            compression_state=CompressionState(row["compression_state"]),
            parent_id=row["parent_id"],
            metadata=json.loads(row["metadata_json"] or "{}"),
            importance=row["importance"],
            access_count=row["access_count"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            child_count=self._child_count(row["id"]),
        )

    def _child_count(self, node_id: str, conn: Optional[sqlite3.Connection] = None) -> int:
        # count via CONTAINS/BELONGS_TO edges (real relationships only)
        query = """SELECT COUNT(*) FROM graph_edges
                   WHERE edge_type IN ('CONTAINS','BELONGS_TO') AND source_id = ?"""
        if conn is not None:
            return conn.execute(query, (node_id,)).fetchone()[0]
        with self._conn() as own:
            return own.execute(query, (node_id,)).fetchone()[0]

    def count_children(self, node_id: str) -> int:
        with self._conn() as conn:
            return self._child_count(node_id, conn)

    def bump_access(self, node_id: str) -> None:
        with self._write_lock, self._conn() as conn:
            conn.execute(
                "UPDATE graph_nodes SET access_count = access_count + 1, updated_at = ? WHERE id = ?",
                (utcnow().isoformat(), node_id),
            )

    def set_compression_state(self, node_id: str, state: CompressionState) -> bool:
        with self._write_lock, self._conn() as conn:
            cur = conn.execute(
                "UPDATE graph_nodes SET compression_state = ?, updated_at = ? WHERE id = ?",
                (state.value, utcnow().isoformat(), node_id),
            )
            return cur.rowcount > 0

    def soft_delete_node(self, node_id: str) -> bool:
        # user-authorized deletion only; row kept for provenance
        return self.set_compression_state(node_id, CompressionState.DELETED)

    def list_nodes(
        self,
        node_types: Optional[List[str]] = None,
        project_id: Optional[str] = None,
        include_archived: bool = False,
        limit: int = 500,
    ) -> List[GraphNode]:
        sql = "SELECT * FROM graph_nodes WHERE status != 'deleted_marker'"
        params: List[Any] = []
        if not include_archived:
            sql += " AND compression_state != 'ARCHIVED'"
        sql += " AND compression_state != 'DELETED'"
        if node_types:
            sql += f" AND node_type IN ({','.join('?' * len(node_types))})"
            params += node_types
        if project_id:
            sql += " AND (project_id = ? OR scope = 'global')"
            params.append(project_id)
        sql += " ORDER BY importance DESC, created_at ASC LIMIT ?"
        params.append(limit)
        with self._conn() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [self._row_to_node(r) for r in rows]

    # --- edges -----------------------------------------------------------------
    def upsert_edge(
        self,
        source_id: str,
        target_id: str,
        edge_type: EdgeType,
        provenance: Provenance = Provenance.EXPLICIT,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> GraphEdge:
        eid = _edge_id(source_id, target_id, edge_type.value)
        edge = GraphEdge(
            id=eid, source_id=source_id, target_id=target_id, edge_type=edge_type,
            provenance=provenance, metadata=metadata or {}, created_at=utcnow(),
        )
        with self._write_lock, self._conn() as conn:
            conn.execute(
                """INSERT INTO graph_edges
                   (id, source_id, target_id, edge_type, provenance, weight, metadata_json, created_at)
                   VALUES (?,?,?,?,?,?,?,?)
                   ON CONFLICT(id) DO UPDATE SET
                     provenance=excluded.provenance,
                     metadata_json=excluded.metadata_json""",
                (edge.id, edge.source_id, edge.target_id, edge.edge_type.value,
                 edge.provenance.value, edge.weight, json.dumps(edge.metadata, default=str),
                 utcnow().isoformat()),
            )
        return edge

    def get_edge(self, edge_id: str) -> Optional[GraphEdge]:
        with self._conn() as conn:
            row = conn.execute("SELECT * FROM graph_edges WHERE id = ?", (edge_id,)).fetchone()
        if not row:
            return None
        return GraphEdge(
            id=row["id"], source_id=row["source_id"], target_id=row["target_id"],
            edge_type=EdgeType(row["edge_type"]), provenance=Provenance(row["provenance"]),
            weight=row["weight"], metadata=json.loads(row["metadata_json"] or "{}"),
            created_at=row["created_at"],
        )

    def edges_of(self, node_id: str, direction: str = "both") -> List[GraphEdge]:
        with self._conn() as conn:
            if direction == "out":
                rows = conn.execute("SELECT * FROM graph_edges WHERE source_id = ?", (node_id,)).fetchall()
            elif direction == "in":
                rows = conn.execute("SELECT * FROM graph_edges WHERE target_id = ?", (node_id,)).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM graph_edges WHERE source_id = ? OR target_id = ?", (node_id, node_id)
                ).fetchall()
        return [
            GraphEdge(
                id=r["id"], source_id=r["source_id"], target_id=r["target_id"],
                edge_type=EdgeType(r["edge_type"]), provenance=Provenance(r["provenance"]),
                weight=r["weight"], metadata=json.loads(r["metadata_json"] or "{}"),
                created_at=r["created_at"],
            )
            for r in rows
        ]

    def remove_edge(self, source_id: str, target_id: str, edge_type: EdgeType) -> bool:
        eid = _edge_id(source_id, target_id, edge_type.value)
        with self._write_lock, self._conn() as conn:
            cur = conn.execute("DELETE FROM graph_edges WHERE id = ?", (eid,))
            return cur.rowcount > 0

    # --- overview & bounded traversal ------------------------------------------
    def overview(self, project_id: Optional[str] = None) -> Dict[str, Any]:
        """Compressed global overview: roots + real counts + initial visible graph."""
        with self._conn() as conn:
            type_counts = {
                r["node_type"]: r["c"]
                for r in conn.execute(
                    """SELECT node_type, COUNT(*) c FROM graph_nodes
                       WHERE compression_state NOT IN ('ARCHIVED','DELETED')
                       GROUP BY node_type"""
                ).fetchall()
            }
            edge_count = conn.execute("SELECT COUNT(*) FROM graph_edges").fetchone()[0]
            roots = conn.execute(
                """SELECT * FROM graph_nodes
                   WHERE parent_id IS NULL
                     AND compression_state NOT IN ('ARCHIVED','DELETED')
                     AND (scope = 'global' OR project_id = ?)
                   ORDER BY importance DESC, label ASC LIMIT 200""",
                (project_id or "__none__",),
            ).fetchall()
            root_nodes = [self._row_to_node(r) for r in roots]

            # detailed record counts that stay compressed inside parents
            detail_counts = {
                r["node_type"]: r["c"]
                for r in conn.execute(
                    """SELECT node_type, COUNT(*) c FROM graph_nodes
                       WHERE parent_id IS NOT NULL
                         AND compression_state NOT IN ('ARCHIVED','DELETED')
                       GROUP BY node_type"""
                ).fetchall()
            }

            # Also fetch initial visible nodes & edges (active nodes up to limit 300)
            all_nodes_rows = conn.execute(
                """SELECT * FROM graph_nodes
                   WHERE compression_state NOT IN ('ARCHIVED','DELETED')
                     AND (scope = 'global' OR project_id = ? OR project_id IS NULL)
                   ORDER BY importance DESC LIMIT 300""",
                (project_id or "__none__",),
            ).fetchall()
            all_nodes = [self._row_to_node(r) for r in all_nodes_rows]
            node_ids = {n.id for n in all_nodes}

            all_edges = []
            if node_ids:
                ph = ",".join("?" * len(node_ids))
                edge_rows = conn.execute(
                    f"""SELECT * FROM graph_edges
                       WHERE source_id IN ({ph}) AND target_id IN ({ph})
                       LIMIT 500""",
                    (*node_ids, *node_ids),
                ).fetchall()
                for r in edge_rows:
                    all_edges.append(
                        GraphEdge(
                            id=r["id"],
                            source_id=r["source_id"],
                            target_id=r["target_id"],
                            edge_type=EdgeType(r["edge_type"]),
                            provenance=Provenance(r["provenance"]),
                            weight=r["weight"],
                            metadata=json.loads(r["metadata_json"] or "{}"),
                            created_at=r["created_at"],
                        )
                    )

        return {
            "roots": [n.model_dump() for n in root_nodes],
            "nodes": [n.model_dump() for n in all_nodes],
            "edges": [e.model_dump() for e in all_edges],
            "type_counts": type_counts,
            "detail_counts": detail_counts,
            "edge_count": edge_count,
            "generated_at": utcnow().isoformat(),
        }

    def expand(
        self,
        node_id: str,
        depth: int = 1,
        limit: int = 200,
        project_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Bounded BFS expansion of a group. depth is clamped to <=2, limit to <=200."""
        depth = max(1, min(2, depth))
        limit = max(1, min(200, limit))
        frontier = {node_id}
        visited: Dict[str, GraphNode] = {}
        edges: Dict[str, GraphEdge] = {}
        center = self.get_node(node_id)
        if center:
            visited[center.id] = center

        with self._conn() as conn:
            for _ in range(depth):
                if not frontier or len(visited) >= limit:
                    break
                placeholders = ",".join("?" * len(frontier))
                rows = conn.execute(
                    f"""SELECT * FROM graph_nodes
                        WHERE parent_id IN ({placeholders})
                          AND compression_state != 'DELETED'
                          AND (scope = 'global' OR project_id = ? OR project_id IS NULL)
                        LIMIT ?""",
                    (*frontier, project_id or "__none__", limit - len(visited)),
                ).fetchall()
                next_frontier: set = set()
                for r in rows:
                    node = self._row_to_node(r)
                    visited[node.id] = node
                    next_frontier.add(node.id)
                if next_frontier:
                    ph = ",".join("?" * len(next_frontier))
                    erows = conn.execute(
                        f"""SELECT * FROM graph_edges
                            WHERE (source_id IN ({ph}) OR target_id IN ({ph}))
                              AND edge_type IN ('CONTAINS','BELONGS_TO','REQUIRES','CALLS',
                                                'USES_SKILL','VERIFIED_BY','LEARNED_FROM',
                                                'FAILED_DUE_TO','RECOVERS_WITH','DERIVED_FROM')""",
                        (*next_frontier, *next_frontier),
                    ).fetchall()
                    for r in erows:
                        edges[r["id"]] = GraphEdge(
                            id=r["id"], source_id=r["source_id"], target_id=r["target_id"],
                            edge_type=EdgeType(r["edge_type"]), provenance=Provenance(r["provenance"]),
                            weight=r["weight"], metadata=json.loads(r["metadata_json"] or "{}"),
                            created_at=r["created_at"],
                        )
                frontier = next_frontier

            # also include the center node's own direct relationships
            if center:
                for e in self.edges_of(center.id):
                    edges.setdefault(e.id, e)

            # Ensure all endpoints of collected edges are included in visited so edges are never dangling
            if edges:
                missing_ids = set()
                for e in edges.values():
                    if e.source_id not in visited:
                        missing_ids.add(e.source_id)
                    if e.target_id not in visited:
                        missing_ids.add(e.target_id)
                if missing_ids:
                    ph = ",".join("?" * len(missing_ids))
                    missing_rows = conn.execute(
                        f"""SELECT * FROM graph_nodes WHERE id IN ({ph}) AND compression_state != 'DELETED'""",
                        tuple(missing_ids),
                    ).fetchall()
                    for r in missing_rows:
                        node = self._row_to_node(r)
                        visited[node.id] = node

        return {
            "center": center.model_dump() if center else None,
            "nodes": [n.model_dump() for n in visited.values()],
            "edges": [e.model_dump() for e in edges.values()],
        }

    def search_nodes(
        self,
        q: str,
        node_types: Optional[List[str]] = None,
        project_id: Optional[str] = None,
        limit: int = 50,
    ) -> List[GraphNode]:
        like = f"%{q}%"
        sql = """SELECT * FROM graph_nodes
                 WHERE compression_state NOT IN ('ARCHIVED','DELETED')
                   AND (label LIKE ? OR description LIKE ?)"""
        params: List[Any] = [like, like]
        if node_types:
            sql += f" AND node_type IN ({','.join('?' * len(node_types))})"
            params += node_types
        if project_id:
            sql += " AND (project_id = ? OR scope = 'global')"
            params.append(project_id)
        sql += " ORDER BY importance DESC LIMIT ?"
        params.append(limit)
        with self._conn() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [self._row_to_node(r) for r in rows]

    # --- events -----------------------------------------------------------------
    def append_event(self, event: ExecutionEvent) -> ExecutionEvent:
        with self._write_lock, self._conn() as conn:
            cur = conn.execute(
                """INSERT INTO graph_events
                   (event_id, task_id, step_id, node_id, edge_id, event_type, status,
                    message, payload_json, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?)
                   ON CONFLICT(event_id) DO NOTHING""",
                (
                    event.event_id, event.task_id, event.step_id, event.node_id, event.edge_id,
                    event.event_type.value, event.status, event.message,
                    json.dumps(event.payload, default=str), utcnow().isoformat(),
                ),
            )
            if cur.rowcount:
                event.seq = cur.lastrowid
        return event

    def events_since(self, since_seq: int, task_id: Optional[str] = None, limit: int = 500) -> List[ExecutionEvent]:
        sql = "SELECT * FROM graph_events WHERE seq > ?"
        params: List[Any] = [since_seq]
        if task_id:
            sql += " AND task_id = ?"
            params.append(task_id)
        sql += " ORDER BY seq ASC LIMIT ?"
        params.append(limit)
        with self._conn() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [
            ExecutionEvent(
                seq=r["seq"], event_id=r["event_id"], task_id=r["task_id"], step_id=r["step_id"],
                node_id=r["node_id"], edge_id=r["edge_id"], event_type=EventType(r["event_type"]),
                status=r["status"], message=r["message"],
                payload=json.loads(r["payload_json"] or "{}"), created_at=r["created_at"],
            )
            for r in rows
        ]

    def latest_seq(self) -> int:
        with self._conn() as conn:
            row = conn.execute("SELECT MAX(seq) FROM graph_events").fetchone()
        return row[0] or 0

    # --- task runs ----------------------------------------------------------------
    def create_task_run(self, task_id: str, request: str, project_id: Optional[str],
                        selection: Dict[str, Any], model_id: str) -> None:
        with self._write_lock, self._conn() as conn:
            conn.execute(
                """INSERT OR REPLACE INTO task_runs
                   (task_id, request, project_id, status, skill_selection_json, plan_json,
                    result_json, model_id, started_at, finished_at)
                   VALUES (?,?,?,?,?,?,?,?,?,NULL)""",
                (task_id, request, project_id, "running", json.dumps(selection, default=str),
                 "{}", "{}", model_id, utcnow().isoformat()),
            )

    def update_task_run(self, task_id: str, status: Optional[str] = None,
                        plan: Optional[Dict[str, Any]] = None,
                        result: Optional[Dict[str, Any]] = None,
                        finished: bool = False) -> None:
        sets, params = [], []
        if status is not None:
            sets.append("status = ?"); params.append(status)
        if plan is not None:
            sets.append("plan_json = ?"); params.append(json.dumps(plan, default=str))
        if result is not None:
            sets.append("result_json = ?"); params.append(json.dumps(result, default=str))
        if finished:
            sets.append("finished_at = ?"); params.append(utcnow().isoformat())
        if not sets:
            return
        params.append(task_id)
        with self._write_lock, self._conn() as conn:
            conn.execute(f"UPDATE task_runs SET {', '.join(sets)} WHERE task_id = ?", params)

    def get_task_run(self, task_id: str) -> Optional[Dict[str, Any]]:
        with self._conn() as conn:
            row = conn.execute("SELECT * FROM task_runs WHERE task_id = ?", (task_id,)).fetchone()
        if not row:
            return None
        return {
            "task_id": row["task_id"], "request": row["request"], "project_id": row["project_id"],
            "status": row["status"],
            "skill_selection": json.loads(row["skill_selection_json"] or "{}"),
            "plan": json.loads(row["plan_json"] or "{}"),
            "result": json.loads(row["result_json"] or "{}"),
            "model_id": row["model_id"],
            "started_at": row["started_at"], "finished_at": row["finished_at"],
        }

    def list_task_runs(self, limit: int = 50, project_id: Optional[str] = None) -> List[Dict[str, Any]]:
        sql = "SELECT task_id FROM task_runs"
        params: List[Any] = []
        if project_id:
            sql += " WHERE project_id = ?"
            params.append(project_id)
        sql += " ORDER BY started_at DESC LIMIT ?"
        params.append(limit)
        with self._conn() as conn:
            ids = [r["task_id"] for r in conn.execute(sql, params).fetchall()]
        return [self.get_task_run(t) for t in ids if t]

    # --- failure episodes & recoveries ----------------------------------------------
    def add_failure_episode(self, episode: Dict[str, Any]) -> str:
        fid = episode.get("id") or str(uuid.uuid4())
        with self._write_lock, self._conn() as conn:
            conn.execute(
                """INSERT INTO failure_episodes
                   (id, task_id, step_id, skill_id, tool, error_signature, error_text,
                    evidence_json, diagnosis_status, recovery_procedure_id, verification, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                (fid, episode.get("task_id"), episode.get("step_id"), episode.get("skill_id"),
                 episode.get("tool"), episode.get("error_signature"), episode.get("error_text", ""),
                 json.dumps(episode.get("evidence", {}), default=str),
                 episode.get("diagnosis_status", "hypothesized"),
                 episode.get("recovery_procedure_id"), episode.get("verification", ""),
                 utcnow().isoformat()),
            )
        return fid

    def list_failure_episodes(self, limit: int = 100, project_id: Optional[str] = None) -> List[Dict[str, Any]]:
        sql = """SELECT f.* FROM failure_episodes f"""
        params: List[Any] = []
        # failures inherit task scope
        if project_id:
            sql += """ JOIN task_runs t ON t.task_id = f.task_id WHERE t.project_id = ?"""
            params.append(project_id)
        sql += " ORDER BY f.created_at DESC LIMIT ?"
        params.append(limit)
        with self._conn() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [
            {
                "id": r["id"], "task_id": r["task_id"], "step_id": r["step_id"],
                "skill_id": r["skill_id"], "tool": r["tool"],
                "error_signature": r["error_signature"], "error_text": r["error_text"],
                "evidence": json.loads(r["evidence_json"] or "{}"),
                "diagnosis_status": r["diagnosis_status"],
                "recovery_procedure_id": r["recovery_procedure_id"],
                "verification": r["verification"], "created_at": r["created_at"],
            }
            for r in rows
        ]

    def upsert_recovery_procedure(self, proc: Dict[str, Any]) -> str:
        rid = proc.get("id") or str(uuid.uuid4())
        with self._write_lock, self._conn() as conn:
            conn.execute(
                """INSERT INTO recovery_procedures
                   (id, error_signature, description, steps_json, attempt_count, success_count,
                    status, created_at)
                   VALUES (?,?,?,?,?,?,?,?)
                   ON CONFLICT(id) DO UPDATE SET
                     description=excluded.description,
                     steps_json=excluded.steps_json""",
                (rid, proc.get("error_signature"), proc.get("description", ""),
                 json.dumps(proc.get("steps", []), default=str),
                 proc.get("attempt_count", 0), proc.get("success_count", 0),
                 proc.get("status", "candidate"), utcnow().isoformat()),
            )
        return rid

    def find_recovery_procedure(self, error_signature: str) -> Optional[Dict[str, Any]]:
        with self._conn() as conn:
            row = conn.execute(
                """SELECT * FROM recovery_procedures
                   WHERE error_signature = ? AND status = 'validated'
                   ORDER BY success_count DESC LIMIT 1""",
                (error_signature,),
            ).fetchone()
        if not row:
            return None
        return {
            "id": row["id"], "error_signature": row["error_signature"],
            "description": row["description"], "steps": json.loads(row["steps_json"] or "[]"),
            "attempt_count": row["attempt_count"], "success_count": row["success_count"],
            "status": row["status"], "created_at": row["created_at"],
        }

    def record_recovery_attempt(self, recovery_id: str, success: bool) -> None:
        col = "success_count" if success else "attempt_count"
        # count both: attempts total + successes
        with self._write_lock, self._conn() as conn:
            conn.execute(
                "UPDATE recovery_procedures SET attempt_count = attempt_count + 1"
                + (", success_count = success_count + 1" if success else "")
                + " WHERE id = ?",
                (recovery_id,),
            )
            if success:
                conn.execute(
                    """UPDATE recovery_procedures
                       SET status = CASE WHEN success_count >= 1 AND status = 'candidate'
                                         THEN 'validated' ELSE status END
                       WHERE id = ?""",
                    (recovery_id,),
                )

    def list_recovery_procedures(self, limit: int = 100) -> List[Dict[str, Any]]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM recovery_procedures ORDER BY created_at DESC LIMIT ?", (limit,)
            ).fetchall()
        return [
            {
                "id": r["id"], "error_signature": r["error_signature"],
                "description": r["description"], "steps": json.loads(r["steps_json"] or "[]"),
                "attempt_count": r["attempt_count"], "success_count": r["success_count"],
                "status": r["status"], "created_at": r["created_at"],
            }
            for r in rows
        ]

    # --- curation suggestions ---------------------------------------------------------
    def add_suggestion(self, kind: str, node_ids: List[str], detail: Dict[str, Any]) -> str:
        sid = str(uuid.uuid4())
        with self._write_lock, self._conn() as conn:
            conn.execute(
                """INSERT INTO memory_suggestions (id, kind, node_ids_json, detail_json,
                                                    status, created_at)
                   VALUES (?,?,?,?, 'proposed', ?)""",
                (sid, kind, json.dumps(node_ids), json.dumps(detail, default=str),
                 utcnow().isoformat()),
            )
        return sid

    def list_suggestions(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        sql = "SELECT * FROM memory_suggestions"
        params: List[Any] = []
        if status:
            sql += " WHERE status = ?"
            params.append(status)
        sql += " ORDER BY created_at DESC LIMIT 200"
        with self._conn() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [
            {
                "id": r["id"], "kind": r["kind"], "node_ids": json.loads(r["node_ids_json"]),
                "detail": json.loads(r["detail_json"] or "{}"), "status": r["status"],
                "created_at": r["created_at"], "decided_at": r["decided_at"],
            }
            for r in rows
        ]

    def decide_suggestion(self, suggestion_id: str, decision: str) -> Optional[Dict[str, Any]]:
        if decision not in ("approved", "rejected"):
            raise ValueError("decision must be approved|rejected")
        with self._write_lock, self._conn() as conn:
            cur = conn.execute(
                "UPDATE memory_suggestions SET status = ?, decided_at = ? WHERE id = ? AND status = 'proposed'",
                (decision, utcnow().isoformat(), suggestion_id),
            )
            if not cur.rowcount:
                return None
            row = conn.execute("SELECT * FROM memory_suggestions WHERE id = ?", (suggestion_id,)).fetchone()
        return {
            "id": row["id"], "kind": row["kind"], "node_ids": json.loads(row["node_ids_json"]),
            "detail": json.loads(row["detail_json"] or "{}"), "status": row["status"],
            "created_at": row["created_at"], "decided_at": row["decided_at"],
        }

    def purge_decided_suggestions(self) -> None:
        with self._write_lock, self._conn() as conn:
            conn.execute("DELETE FROM memory_suggestions WHERE status IN ('approved','rejected')")

    # --- statistics ---------------------------------------------------------------------
    def stats(self) -> Dict[str, Any]:
        with self._conn() as conn:
            def one(q: str, *p: Any) -> Any:
                return conn.execute(q, p).fetchone()[0]
            return {
                "nodes": one("SELECT COUNT(*) FROM graph_nodes WHERE compression_state != 'DELETED'"),
                "edges": one("SELECT COUNT(*) FROM graph_edges"),
                "events": one("SELECT COUNT(*) FROM graph_events"),
                "tasks": one("SELECT COUNT(*) FROM task_runs"),
                "failures": one("SELECT COUNT(*) FROM failure_episodes"),
                "recoveries": one("SELECT COUNT(*) FROM recovery_procedures"),
            }


# --- singleton ---------------------------------------------------------------
_store: Optional[GraphStore] = None


def get_graph_store(db_path: Optional[str] = None) -> GraphStore:
    global _store
    if _store is None or (db_path and _store.db_path != db_path):
        _store = GraphStore(db_path)
    return _store
