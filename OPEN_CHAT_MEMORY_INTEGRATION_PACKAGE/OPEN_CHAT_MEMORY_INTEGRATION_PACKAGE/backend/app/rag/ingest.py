"""RAG ingestion: TXT / Markdown / CSV / JSON (+ PDF if pypdf is installed).

Chunks are stored with deterministic keyword sets. Documents and their chunks
are also mirrored into the canonical graph (document -> CONTAINS -> knowledge)
so the Memory Management workspace shows real ingested knowledge with real
counts and provenance (DERIVED_FROM the source record).
"""
import csv
import io
import json
import os
import re
import uuid
from collections import Counter
from typing import Any, Dict, List, Optional

from app.graph.schema import CompressionState, EdgeType, GraphNode, NodeType, Provenance
from app.graph.store import GraphStore
from app.skills.library import tokenize

CHUNK_CHARS = 700
CHUNK_OVERLAP = 100

_RAG_SCHEMA = """
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


def _keywords_of(text: str, top: int = 18) -> List[str]:
    tokens = tokenize(text)
    counts = Counter(tokens)
    return [w for w, _ in counts.most_common(top)]


def _split_paragraphs(text: str) -> List[str]:
    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    if not paras:
        return [text] if text.strip() else []
    # merge into ~CHUNK_CHARS windows with overlap
    chunks: List[str] = []
    buf = ""
    for p in paras:
        if len(buf) + len(p) + 2 <= CHUNK_CHARS or not buf:
            buf = (buf + "\n\n" + p).strip()
        else:
            chunks.append(buf)
            tail = buf[-CHUNK_OVERLAP:]
            buf = (tail + "\n\n" + p).strip()
    if buf:
        chunks.append(buf)
    return chunks


def _split_csv_rows(text: str, window: int = 25) -> List[str]:
    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    if not rows:
        return []
    header = ",".join(rows[0])
    out = []
    for start in range(1, len(rows), window):
        block = rows[start:start + window]
        out.append(header + "\n" + "\n".join(",".join(r) for r in block))
    return out


def _split_json(obj: Any, prefix: str = "") -> List[str]:
    out: List[str] = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            out.extend(_split_json(v, f"{prefix}.{k}" if prefix else k))
    elif isinstance(obj, list):
        for i, v in enumerate(obj[:200]):
            out.extend(_split_json(v, f"{prefix}[{i}]"))
    else:
        out.append(f"{prefix}: {obj}")
    # merge leaves into windows
    return _split_paragraphs("\n\n".join(out))


def parse_document(name: str, content: str) -> List[str]:
    ext = os.path.splitext(name)[1].lower()
    if ext == ".csv":
        return _split_csv_rows(content)
    if ext == ".json":
        try:
            return _split_json(json.loads(content))
        except json.JSONDecodeError:
            return _split_paragraphs(content)
    return _split_paragraphs(content)  # .txt, .md and anything textual


def ingest_text(
    name: str,
    content: str,
    project_id: Optional[str],
    store: GraphStore,
    db_path: Optional[str] = None,
    source_label: Optional[str] = None,
) -> Dict[str, Any]:
    """Ingest textual content. Returns document summary with real chunk count."""
    import sqlite3
    from app.config import settings
    from app.graph.schema import utcnow

    db = db_path or settings.memory_db_path
    doc_id = f"doc:{uuid.uuid5(uuid.NAMESPACE_URL, (project_id or 'global') + '/' + name)}"
    chunks = parse_document(name, content)
    mime = {
        ".csv": "text/csv", ".json": "application/json", ".md": "text/markdown",
        ".txt": "text/plain", ".pdf": "application/pdf",
    }.get(os.path.splitext(name)[1].lower(), "text/plain")

    conn = sqlite3.connect(db, timeout=15)
    try:
        conn.executescript(_RAG_SCHEMA)
        conn.execute("DELETE FROM rag_chunks WHERE document_id = ?", (doc_id,))
        conn.execute(
            """INSERT OR REPLACE INTO rag_documents
               (id, project_id, name, path, mime, ingested_at, metadata_json)
               VALUES (?,?,?,?,?,?,?)""",
            (doc_id, project_id, name, None, mime, utcnow().isoformat(),
             json.dumps({"chars": len(content), "chunks": len(chunks)})),
        )
        chunk_rows = []
        for i, chunk in enumerate(chunks):
            cid = f"{doc_id}#chunk{i}"
            kws = _keywords_of(chunk)
            conn.execute(
                """INSERT INTO rag_chunks
                   (id, document_id, chunk_index, content, keywords_json, embedding,
                    graph_node_id, created_at)
                   VALUES (?,?,?,?,?,NULL,?,?)""",
                (cid, doc_id, i, chunk, json.dumps(kws), None, utcnow().isoformat()),
            )
            chunk_rows.append((cid, chunk, kws))
    finally:
        conn.commit()
        conn.close()

    # mirror into the canonical graph
    store.upsert_node(GraphNode(
        id=doc_id, node_type=NodeType.DOCUMENT, label=name,
        description=f"{len(chunks)} knowledge chunks ingested from {name}",
        project_id=project_id,
        scope="project" if project_id else "global",
        compression_state=CompressionState.SUMMARY_STORED,
        importance=0.6,
        metadata={"mime": mime, "chunk_count": len(chunks)},
    ))
    src_id = f"source:{source_label or ('upload:' + name)}"
    store.upsert_node(GraphNode(
        id=src_id, node_type=NodeType.SOURCE, label=source_label or f"upload:{name}",
        description="Provenance record for ingested knowledge",
        compression_state=CompressionState.DETAIL_DEFERRED, importance=0.3,
    ))
    store.upsert_edge(doc_id, src_id, EdgeType.DERIVED_FROM, Provenance.EXPLICIT)
    for cid, chunk, kws in chunk_rows:
        store.upsert_node(GraphNode(
            id=cid, node_type=NodeType.KNOWLEDGE, label=f"{name} · chunk {cid.split('#chunk')[-1]}",
            description=(chunk[:180] + "…") if len(chunk) > 180 else chunk,
            project_id=project_id,
            scope="project" if project_id else "global",
            parent_id=doc_id,
            compression_state=CompressionState.DETAIL_DEFERRED,
            importance=0.4, metadata={"keywords": kws},
        ))
        store.upsert_edge(doc_id, cid, EdgeType.CONTAINS, Provenance.EXTRACTED)

    return {"document_id": doc_id, "name": name, "chunks": len(chunks), "mime": mime}


def ingest_file(path: str, project_id: Optional[str], store: GraphStore,
                db_path: Optional[str] = None) -> Dict[str, Any]:
    ext = os.path.splitext(path)[1].lower()
    if ext == ".pdf":
        try:
            from pypdf import PdfReader
        except ImportError:
            raise ValueError("PDF ingestion requires the 'pypdf' package (not installed). "
                             "TXT/MD/CSV/JSON are supported.")
        reader = PdfReader(path)
        content = "\n\n".join((page.extract_text() or "") for page in reader.pages)
    else:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    return ingest_text(os.path.basename(path), content, project_id, store, db_path=db_path,
                       source_label=f"file:{os.path.basename(path)}")


def list_documents(db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    import sqlite3
    from app.config import settings
    conn = sqlite3.connect(db_path or settings.memory_db_path, timeout=15)
    conn.row_factory = sqlite3.Row
    try:
        conn.executescript(_RAG_SCHEMA)
        rows = conn.execute(
            """SELECT d.*, COUNT(c.id) AS chunk_count FROM rag_documents d
               LEFT JOIN rag_chunks c ON c.document_id = d.id
               GROUP BY d.id ORDER BY d.ingested_at DESC LIMIT 200"""
        ).fetchall()
        return [
            {"id": r["id"], "project_id": r["project_id"], "name": r["name"], "path": r["path"],
             "mime": r["mime"], "ingested_at": r["ingested_at"],
             "metadata": json.loads(r["metadata_json"] or "{}"), "chunk_count": r["chunk_count"]}
            for r in rows
        ]
    finally:
        conn.close()
