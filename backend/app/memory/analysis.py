"""Memory analysis & curation pipeline.

Produces SUGGESTIONS only — nothing is merged, archived, linked or deleted
without explicit user approval through the curation API. Deterministic code
does the indexing/traversal/dedup; Qwen would only be used for semantic
judgments (not needed for the current heuristics).
"""
from collections import Counter, defaultdict
from typing import Any, Dict, List

from app.graph.schema import EdgeType, NodeType, Provenance
from app.graph.store import GraphStore
from app.skills.library import tokenize


def _jaccard(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def analyze(store: GraphStore, similarity_threshold: float = 0.82) -> Dict[str, Any]:
    """Run all analyses; returns counts of proposals created (idempotent-ish:
    new proposal rows are added each run, previously decided ones stay)."""
    created = Counter()

    # 1) duplicate / near-duplicate detection among memory summaries & knowledge
    nodes = store.list_nodes(node_types=["memory_summary", "knowledge"], limit=500)
    token_sets = {n.id: set(tokenize(n.description)) | set(tokenize(n.label)) for n in nodes}
    reported = set()
    for i, a in enumerate(nodes):
        for b in nodes[i + 1:]:
            if a.id in reported or b.id in reported:
                continue
            sim = _jaccard(token_sets[a.id], token_sets[b.id])
            if sim >= similarity_threshold:
                store.add_suggestion("merge_candidates", [a.id, b.id],
                                     {"similarity": round(sim, 3),
                                      "reason": "near-duplicate content (token similarity)",
                                      "warning": "merging preserves both sources; provenance kept"})
                reported.add(b.id)
                created["merge_candidates"] += 1

    # 2) orphan detection: no incoming or outgoing edges at all
    for n in store.list_nodes(limit=1000):
        if n.node_type in (NodeType.CATEGORY,):
            continue
        edges = store.edges_of(n.id)
        if not edges and n.parent_id is None:
            store.add_suggestion("orphan", [n.id],
                                 {"reason": "no relationships and no parent; verify it is still needed"})
            created["orphan"] += 1

    # 3) archive candidates: low importance, never accessed, not a failure/recovery
    for n in store.list_nodes(limit=1000):
        if (n.node_type in (NodeType.FAILURE, NodeType.RECOVERY, NodeType.VERIFICATION_RULE,
                            NodeType.SKILL, NodeType.CATEGORY, NodeType.TOOL)):
            continue
        if n.access_count == 0 and n.importance <= 0.35 and n.node_type in (
                NodeType.MEMORY_SUMMARY, NodeType.KNOWLEDGE, NodeType.EXPERIENCE):
            store.add_suggestion("archive_candidate", [n.id],
                                 {"reason": "never accessed and low importance",
                                  "note": "archiving keeps the record; it only leaves default retrieval"})
            created["archive_candidate"] += 1

    # 4) repeated failure patterns → promote recovery procedure
    sig_counts: Dict[str, int] = defaultdict(int)
    for ep in store.list_failure_episodes(limit=500):
        if ep["error_signature"]:
            sig_counts[ep["error_signature"]] += 1
    for sig, count in sig_counts.items():
        if count >= 2:
            existing = [r for r in store.list_recovery_procedures()
                        if r["error_signature"] == sig and r["status"] == "validated"]
            if not existing:
                store.add_suggestion("promote_recovery", [],
                                     {"error_signature": sig, "occurrences": count,
                                      "reason": "repeated failure pattern without a validated recovery"})
                created["promote_recovery"] += 1

    # 5) related-memory suggestions via shared tags/keywords (inferred, needs approval)
    skills = store.list_nodes(node_types=["experience"], limit=300)
    exp_tokens = {n.id: set(tokenize(n.description)) for n in skills}
    for i, a in enumerate(skills):
        for b in skills[i + 1:]:
            sim = _jaccard(exp_tokens[a.id], exp_tokens[b.id])
            if 0.35 <= sim < 0.9:
                store.add_suggestion("related_memories", [a.id, b.id],
                                     {"similarity": round(sim, 3),
                                      "proposed_edge": "RELATED_TO",
                                      "provenance": "INFERRED (user approval required)"})
                created["related_memories"] += 1

    return {"created": dict(created)}


def apply_approval(store: GraphStore, suggestion: Dict[str, Any]) -> Dict[str, Any]:
    """Apply an approved suggestion. Never destroys provenance."""
    kind = suggestion["kind"]
    ids = suggestion["node_ids"]
    detail = suggestion.get("detail", {})

    if kind == "archive_candidate" and ids:
        from app.graph.schema import CompressionState
        store.set_compression_state(ids[0], CompressionState.ARCHIVED)
        return {"action": "archived", "node": ids[0]}

    if kind == "merge_candidates" and len(ids) == 2:
        # keep both records; create a USER_APPROVED RELATED_TO edge and archive the weaker
        store.upsert_edge(ids[0], ids[1], EdgeType.RELATED_TO, Provenance.USER_APPROVED,
                          {"merged_by": "curation", "similarity": detail.get("similarity")})
        return {"action": "linked_related", "kept": ids}

    if kind == "related_memories" and len(ids) == 2:
        store.upsert_edge(ids[0], ids[1], EdgeType.RELATED_TO, Provenance.USER_APPROVED,
                          {"approved_from": detail.get("similarity")})
        return {"action": "edge_created", "edge": "RELATED_TO"}

    if kind == "promote_recovery":
        sig = detail.get("error_signature", "")
        rid = store.upsert_recovery_procedure({
            "error_signature": sig,
            "description": f"User-promoted recovery for repeated failure {sig}",
            "steps": detail.get("steps", []),
            "status": "candidate",
        })
        return {"action": "recovery_registered", "recovery_id": rid, "status": "candidate"}

    if kind == "orphan" and ids:
        return {"action": "reviewed", "node": ids[0], "note": "kept; no destructive action"}

    return {"action": "noop"}
