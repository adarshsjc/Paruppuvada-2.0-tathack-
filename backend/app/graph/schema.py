"""Canonical memory-graph models for Open Chat.

The vocabulary deliberately mirrors Graphify's persisted graph format
(nodes / typed edges with EXTRACTED vs INFERRED provenance) so a graph.json
produced by Graphify can be imported, and our graph can be exported, without
a lossy mapping. Graphify itself is a codebase mapper — it is NOT the 3D
renderer and NOT the execution engine; those live in the frontend and in
app/execution.
"""
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class NodeType(str, Enum):
    PROJECT = "project"
    CATEGORY = "category"
    SKILL = "skill"
    TOOL = "tool"
    WORKFLOW = "workflow"
    DOCUMENT = "document"
    KNOWLEDGE = "knowledge"
    EXPERIENCE = "experience"
    FAILURE = "failure"
    RECOVERY = "recovery"
    VERIFICATION_RULE = "verification_rule"
    EXECUTION_STEP = "execution_step"
    MEMORY_SUMMARY = "memory_summary"
    SOURCE = "source"
    TASK = "task"


class EdgeType(str, Enum):
    CONTAINS = "CONTAINS"
    REQUIRES = "REQUIRES"
    CALLS = "CALLS"
    RELATED_TO = "RELATED_TO"
    BELONGS_TO = "BELONGS_TO"
    DERIVED_FROM = "DERIVED_FROM"
    USES_SKILL = "USES_SKILL"
    FAILED_DUE_TO = "FAILED_DUE_TO"
    RECOVERS_WITH = "RECOVERS_WITH"
    VERIFIED_BY = "VERIFIED_BY"
    LEARNED_FROM = "LEARNED_FROM"
    CONFLICTS_WITH = "CONFLICTS_WITH"


class Provenance(str, Enum):
    """How do we know this edge is real? (Graphify vocabulary)"""
    EXPLICIT = "EXPLICIT"            # declared in seed/source data
    EXTRACTED = "EXTRACTED"          # parsed from an artifact (log, file, graph.json)
    INFERRED = "INFERRED"            # heuristic or model suggestion, not yet approved
    USER_APPROVED = "USER_APPROVED"  # a human confirmed it


class CompressionState(str, Enum):
    """These states are NOT interchangeable."""
    EXPANDED = "EXPANDED"                # children visible in current view
    COLLAPSED = "COLLAPSED"              # children hidden visually (view-only; nothing lost)
    SUMMARY_STORED = "SUMMARY_STORED"    # compact summary record exists; children counted
    DETAIL_DEFERRED = "DETAIL_DEFERRED"  # full content stored, not fetched into view/context
    ARCHIVED = "ARCHIVED"                # retained but excluded from default retrieval
    DELETED = "DELETED"                  # explicit user-authorized deletion (soft delete)


class Scope(str, Enum):
    GLOBAL = "global"
    PROJECT = "project"


class GraphNode(BaseModel):
    id: str
    node_type: NodeType
    label: str
    description: str = ""
    project_id: Optional[str] = None
    scope: Scope = Scope.GLOBAL
    status: str = "active"              # active | under_review | inactive
    compression_state: CompressionState = CompressionState.DETAIL_DEFERRED
    parent_id: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    importance: float = 0.5
    access_count: int = 0
    child_count: int = 0                # real count, filled by the store on demand
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class GraphEdge(BaseModel):
    id: str
    source_id: str
    target_id: str
    edge_type: EdgeType
    provenance: Provenance = Provenance.EXPLICIT
    weight: float = 1.0
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[datetime] = None


# --- Execution events (persisted facts; the UI may only react to these) ---

class EventType(str, Enum):
    TASK_STARTED = "TASK_STARTED"
    SKILL_RETRIEVED = "SKILL_RETRIEVED"
    DEPENDENCY_RESOLVED = "DEPENDENCY_RESOLVED"
    KNOWLEDGE_RETRIEVED = "KNOWLEDGE_RETRIEVED"
    PLAN_READY = "PLAN_READY"
    TOOL_STARTED = "TOOL_STARTED"
    TOOL_COMPLETED = "TOOL_COMPLETED"
    VERIFICATION_PASSED = "VERIFICATION_PASSED"
    VERIFICATION_FAILED = "VERIFICATION_FAILED"
    RECOVERY_STARTED = "RECOVERY_STARTED"
    RETRY_SCHEDULED = "RETRY_SCHEDULED"
    TASK_COMPLETED = "TASK_COMPLETED"
    TASK_FAILED = "TASK_FAILED"
    TASK_BLOCKED = "TASK_BLOCKED"


class ExecutionEvent(BaseModel):
    seq: Optional[int] = None
    event_id: str
    task_id: Optional[str] = None
    step_id: Optional[str] = None
    node_id: Optional[str] = None
    edge_id: Optional[str] = None
    event_type: EventType
    status: str = "ok"
    message: str = ""
    payload: Dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[datetime] = None


def utcnow() -> datetime:
    return datetime.now(timezone.utc)
