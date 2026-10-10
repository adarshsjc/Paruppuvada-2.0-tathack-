"""Optional MiroFish simulation adapter.

MiroFish (Flask backend) runs LLM-driven agent-society simulations — a
different purpose from Open Chat's skill-memory graph. This adapter therefore:
- is DISABLED by default (MIROFISH_ENABLED=false)
- only talks HTTP to a running MiroFish instance; no code merge
- imports results as typed knowledge nodes with DERIVED_FROM provenance to a
  source node 'mirofish:<simulation_id>'
- is never invoked for ordinary tasks the local agent can complete directly
"""
import json
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import requests

from app.config import settings
from app.graph.schema import (CompressionState, EdgeType, GraphNode, NodeType,
                              Provenance, Scope)
from app.graph.store import GraphStore


class MiroFishDisabled(RuntimeError):
    pass


def status() -> Dict[str, Any]:
    enabled = settings.mirofish_enabled
    info: Dict[str, Any] = {"enabled": enabled, "base_url": settings.mirofish_base_url}
    if not enabled:
        info["reachable"] = False
        info["note"] = "MiroFish adapter is disabled by default; core execution never depends on it."
        return info
    try:
        resp = requests.get(f"{settings.mirofish_base_url}/", timeout=3)
        info["reachable"] = resp.status_code < 500
        info["http_status"] = resp.status_code
    except Exception as e:
        info["reachable"] = False
        info["error"] = str(e)
    return info


def _require_enabled() -> None:
    if not settings.mirofish_enabled:
        raise MiroFishDisabled(
            "MiroFish adapter is disabled (MIROFISH_ENABLED=false). Enable only after the "
            "adapter test passes; normal task execution never needs it.")


def list_simulations() -> Dict[str, Any]:
    _require_enabled()
    resp = requests.get(f"{settings.mirofish_base_url}/simulation/list", timeout=10)
    resp.raise_for_status()
    return resp.json()


def create_simulation(spec: Dict[str, Any]) -> Dict[str, Any]:
    _require_enabled()
    resp = requests.post(f"{settings.mirofish_base_url}/simulation/create", json=spec, timeout=30)
    resp.raise_for_status()
    return resp.json()


def simulation_status(simulation_id: str) -> Dict[str, Any]:
    _require_enabled()
    resp = requests.get(f"{settings.mirofish_base_url}/simulation/{simulation_id}", timeout=10)
    resp.raise_for_status()
    return resp.json()


def import_result(simulation_id: str, summary: str, store: GraphStore,
                  project_id: Optional[str] = None) -> Dict[str, Any]:
    """Import a simulation result as typed, provenance-preserving records."""
    _require_enabled()
    src_id = f"source:mirofish:{simulation_id}"
    store.upsert_node(GraphNode(
        id=src_id, node_type=NodeType.SOURCE, label=f"mirofish:{simulation_id}",
        description="MiroFish simulation (separate from the canonical skill graph)",
        compression_state=CompressionState.DETAIL_DEFERRED, importance=0.3,
    ))
    node_id = f"knowledge:mirofish:{simulation_id}"
    store.upsert_node(GraphNode(
        id=node_id, node_type=NodeType.KNOWLEDGE, label=f"Simulation {simulation_id[:12]} result",
        description=summary, project_id=project_id,
        scope=Scope.PROJECT if project_id else Scope.GLOBAL,
        compression_state=CompressionState.SUMMARY_STORED, importance=0.4,
        metadata={"simulation_id": simulation_id, "imported_at":
                  datetime.now(timezone.utc).isoformat()},
    ))
    store.upsert_edge(node_id, src_id, EdgeType.DERIVED_FROM, Provenance.EXPLICIT,
                      {"adapter": "mirofish"})
    return {"knowledge_node": node_id, "source_node": src_id}
