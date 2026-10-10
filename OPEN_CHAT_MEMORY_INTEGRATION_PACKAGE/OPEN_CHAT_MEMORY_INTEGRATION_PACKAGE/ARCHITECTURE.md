# ARCHITECTURE — Open Chat with Memory Management

## 1. System overview

```
┌──────────────────────────────── Frontend (React 19 + Vite + TS) ───────────────────────────────┐
│  Sidebar: Dashboard / Open Chat / Projects / [Memory Management] / Memory Vault / Audit / Cfg   │
│  ChatWorkspace ── skill-selection panel (auto vs selected-skills, dependency check)             │
│  MemoryManagement ── Graph3D (three.js via 3d-force-graph) + list fallback, inspector,          │
│                      compression controls, live activity feed, curation review                  │
└───────────────┬──────────────────────────────┬───────────────────────────────┬─────────────────┘
        REST /api/v1/*                 SSE /api/v1/events/stream         (poll fallback)
┌───────────────┴──────────────────────┴───────────────────────────────┴─────────────────────────┐
│ FastAPI backend                                                                                 │
│  endpoints.py (legacy, kept)      memory_endpoints.py (graph/skills/rag/events/curation)        │
│  execution/engine.py ── DAG executor, checkpoints, bounded retries, duplicate-side-effect guard │
│    ├── skills/library.py (manifests, REQUIRES closure, permissions, canonical workflows)        │
│    ├── rag/retriever.py (4 channels, budget, provenance) ── rag/ingest.py (chunk store)         │
│    ├── tools/registry.py + tools/file_tools.py (permission-enforced)                            │
│    ├── execution/verifier.py (deterministic PASS/FAIL/INCONCLUSIVE)                             │
│    ├── events/bus.py (persisted event log; SSE reads it)                                        │
│    ├── graph/store.py + graph/schema.py (canonical memory graph in SQLite)                      │
│    ├── memory/sqlite.py (existing notes; kept, linked via BELONGS_TO)                            │
│    ├── memory/analysis.py (curation suggestions; user-approved only)                            │
│    └── adapters/mirofish.py (optional, default OFF)                                              │
│  agents/llm.py ── provider abstraction: Mock | OllamaLLM(qwen2.5:3b-instruct) | OpenRouter|Gemini│
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## 2. Canonical graph model (`app/graph/schema.py`)

**Node types** (stored `node_type`): `project, category, skill, tool, workflow, document,
knowledge, experience, failure, recovery, verification_rule, execution_step,
memory_summary, source, task`.

**Edge types**: `CONTAINS, REQUIRES, CALLS, RELATED_TO, BELONGS_TO, DERIVED_FROM,
USES_SKILL, FAILED_DUE_TO, RECOVERS_WITH, VERIFIED_BY, LEARNED_FROM, CONFLICTS_WITH`.

**Edge provenance** (Graphify vocabulary): `EXPLICIT` (declared in source data),
`EXTRACTED` (parsed from artifacts), `INFERRED` (heuristic/model suggestion),
`USER_APPROVED` (human confirmed an inferred/proposed edge).

**Compression states** (distinct, never conflated):
- `COLLAPSED` — children hidden in the current *view* only; nothing changed on disk.
- `SUMMARY_STORED` — a compact summary record exists (parent carries real child counts).
- `DETAIL_DEFERRED` — full content stored; not fetched into this view or context yet.
- `ARCHIVED` — retained but excluded from default retrieval.
- `DELETED` — explicit user deletion (soft-delete row preserved for provenance).

**Overview contract**: the initial graph returns roots (projects, categories, core
skills, workflow families, recovery families) with **real child counts** from SQL
aggregation. Expansion is bounded: `expand(node_id, depth≤2, limit≤200)`.

## 3. Persistence (SQLite, `memory.db` unless `MEMORY_DB_PATH` set)

New tables (auto-created; SQL also exported to `migrations/001_memory_graph.sql`):

- `graph_nodes(id, node_type, label, description, project_id, scope, status,
  compression_state, parent_id, metadata_json, importance, access_count, created_at, updated_at)`
- `graph_edges(id, source_id, target_id, edge_type, provenance, weight, metadata_json, created_at)`
- `graph_events(seq AUTOINCREMENT, event_id, task_id, step_id, node_id, edge_id, event_type,
  status, message, payload_json, created_at)` — append-only fact log
- `task_runs(task_id, request, project_id, status, skill_selection_json, plan_json,
  result_json, model_id, started_at, finished_at)`
- `failure_episodes(id, task_id, step_id, skill_id, tool, error_signature, error_text,
  evidence_json, diagnosis_status, recovery_procedure_id, verification, created_at)`
- `recovery_procedures(id, error_signature, description, steps_json, attempt_count,
  success_count, status, created_at)` — promoted to `validated` only after verified success
- `rag_documents(id, project_id, name, path, mime, ingested_at, metadata_json)`
- `rag_chunks(id, document_id, chunk_index, content, keywords_json, embedding BLOB, created_at)`
- `memory_suggestions(id, kind, node_ids_json, detail_json, status, created_at, decided_at)`

Existing `projects` / `memories` tables are untouched; note rows surface in the graph as
`memory_summary` nodes linked `BELONGS_TO` their project.

## 4. Execution engine (`app/execution/engine.py`)

1. **Contract** built from request + selection: goal, constraints, expected outputs,
   allowed tools (union over selected skills ∩ permissions), completion criteria,
   verification rules (from skill manifests).
2. **Retrieval (4 channels, budgeted)** — emits `SKILL_RETRIEVED`, `KNOWLEDGE_RETRIEVED`
   per item with node IDs.
3. **Skill scope**: `auto` (ranked retrieval; Qwen may re-rank inside budget) or
   `selected` (only chosen skills + mandatory `REQUIRES` closure; missing prerequisites
   are *reported*, optionally auto-added on explicit user flag — never silently).
4. **Plan**: Qwen emits structured steps validated against allowed tools; skills with a
   canonical workflow (e.g. `sales-report`) constrain steps to that template; invalid
   plans fall back to the canonical workflow (recorded in `plan.fallback_reason`).
5. **DAG execution**: topological order; parallel only for independent safe steps
   (sequential by default in this milestone); each step checkpointed
   (`task_runs.plan_json` step states) so a rerun skips completed side-effectful steps
   (duplicate-side-effect guard keyed by step hash).
6. **Bounded recovery**: retryable tool errors retry ≤ `MAX_RETRIES_PER_STEP` (default 2)
   with backoff; error signature looked up in `recovery_procedures`; candidate procedures
   are only *applied* when `status='validated'`; every attempt emits `RECOVERY_STARTED`
   and is recorded in a failure episode with `diagnosis_status` (`hypothesized` vs
   `verified` — verified only after a verifier PASS following recovery).
7. **Independent verification**: `execution/verifier.py` checks *actual artifacts*
   (file exists, JSON parses, recomputed aggregates match report values, required MD
   sections present). Verdict `PASS | FAIL | INCONCLUSIVE`. An LLM's claim of success is
   never sufficient.
8. **Write-back**: task `experience` node (+`LEARNED_FROM` edges to used skills),
   optional failure episodes, Qwen-written summary (deterministic fallback), all events
   persisted; `TASK_COMPLETED` / `TASK_FAILED` / `TASK_BLOCKED` / `TASK_INCONCLUSIVE`.

The LLM never edits its own prompts/permissions; all instruction updates are
user-approved through the curation API.

## 5. Event pipeline

`events/bus.py` offers `emit(event)` → insert row + notify in-process waiters.
SSE endpoint streams rows with `seq > last_seen` (0.4 s poll of the table — survives
multi-worker setups and reconnects). `GET /api/v1/events?since=<seq>` is the polling
fallback and powers "replay past workflow" (events are persisted forever). Event envelope:
`{seq, event_id, task_id, step_id, node_id, edge_id?, event_type, status, message,
payload, created_at}`.

Event types: `TASK_STARTED, SKILL_RETRIEVED, DEPENDENCY_RESOLVED, KNOWLEDGE_RETRIEVED,
PLAN_READY, TOOL_STARTED, TOOL_COMPLETED, VERIFICATION_PASSED, VERIFICATION_FAILED,
RECOVERY_STARTED, RETRY_SCHEDULED, TASK_COMPLETED, TASK_FAILED, TASK_BLOCKED`.

The UI pulses a node **only** on receipt of such an event; on stream drop it shows a
stale-data banner and keeps the last known state.

## 6. RAG (`app/rag/`)

- **Ingest**: TXT, MD, CSV (row-window chunks), JSON (per-key / list-item chunks);
  PDF via `pypdf` when installed. Chunks get deterministic keyword sets (stopword-filtered,
  stemmed-lite). Optional embeddings via `EMBEDDING_PROVIDER=ollama` +
  `OLLAMA_EMBED_MODEL` (kept separate from the chat model).
- **Channels**: `knowledge` (documents), `skill` (manifest texts), `experience`
  (experiences + failures + validated recoveries), `execution_state` (current task's plan/
  checkpoints/outputs from `task_runs`).
- **Scoring (default, no embeddings)**: token-overlap TF ranking — deterministic,
  honestly labeled "keyword retrieval" in the UI. With embeddings: cosine hybrid.
- Every result: `{channel, node_id?, document_id?, chunk_id, score, reason, preview}`.
  Retrieved content is data, never instructions (prompt-injection containment: wrapped as
  untrusted context; backend permissions unchanged by retrieved text).

## 7. Frontend architecture

- `App.tsx` gains view `'memory_management'`; sidebar entry sits directly under
  "Open Chat", styled distinctly (dedicated workspace, not chat history).
- `MemoryManagement.tsx` layout: header (scope filter, graph-type tabs, search,
  compression summary, fit/expand controls) · left rail (overview stats + type filters +
  live activity feed) · center (`Graph3D` or list fallback toggle) · right inspector
  (node details: skills show manifest/prereqs/tools/verification/outcomes/failures;
  memories show scope/source/timestamps/actions; failures show evidence + diagnosis
  status) · curation drawer (approve/reject suggestions).
- `Graph3D.tsx` wraps `3d-force-graph` (three.js): typed node colors/sizes, count badges
  on compressed groups, click-select, hover summary, double-click expand (bounded API
  call), event-driven highlight ring, fit-to-view, camera preservation on expand.
- Skill selection: panel in ChatWorkspace before first message — mode toggle
  (Automatic / Selected skills), category + skill checkboxes with dependency warnings,
  "inspect in graph" deep-link, compact summary chips; stored in conversation state and
  sent with every task.
- Design system: Apple-inspired refresh of tokens in `index.css` (refined system font
  stack, 12–24 px radii, soft layered shadows, restrained translucency, calm palette,
  purposeful 0.2 s transitions). Existing views keep their structure and behavior.

## 8. MiroFish adapter (optional)

`adapters/mirofish.py` targets a running MiroFish Flask backend
(`MIROFISH_BASE_URL`, default `http://127.0.0.1:5000`; `MIROFISH_ENABLED=false`).
Surfaces: `probe()` (health/models), `create_simulation(spec)`, `prepare(id)`,
`status(id)`, `result(id)` → results imported **only** as typed `knowledge` nodes with
`DERIVED_FROM` edges to a `source` node labelled `mirofish:<sim id>`. Never part of the
canonical skill graph, never invoked for ordinary tasks, off by default.

## 9. Model strategy

`agents/llm.py` unchanged in role: one provider instance per workflow run, one Ollama
server, model `qwen2.5:3b-instruct` from config (`OLLAMA_MODEL`). Switching to
`qwen2.5:9b` later: set `OLLAMA_MODEL=qwen2.5:9b` + `ollama pull qwen2.5:9b`. Mock mode
(`USE_MOCK_LLM=True`) remains for offline tests; OpenRouter/Gemini providers preserved.
