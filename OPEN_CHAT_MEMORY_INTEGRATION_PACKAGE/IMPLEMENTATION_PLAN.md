# IMPLEMENTATION PLAN — Open Chat Memory Management Upgrade

## 0. Audited Starting State (Milestone 0 — verified against source, not docs)

The six uploaded project ZIPs (`parts/part_1..6.zip`) are a split of the repository at
`D:\project\Thtava final\` (split by `split_project.py`, each part carries
`00_AI_READ_ME_FIRST`, `PROJECT_STRUCTURE.txt`, `project.md`, `design.md`). The extracted
tree at `D:\project\Thtava final\` is the working copy and matches the parts; work is done
in place there and packaged at the end.

### What actually exists in code (verified file-by-file)

| Component | File(s) | Actual state |
|---|---|---|
| FastAPI app | `backend/app/main.py` (15 lines) | CORS + one router. No SSE, no events. |
| API | `backend/app/api/endpoints.py` (72 lines) | `/health`, projects CRUD-lite, memory list/search/add/delete, **synchronous** `POST /api/v1/tasks`. |
| LLM providers | `backend/app/agents/llm.py` (492 lines) | `MockLLM`, `OllamaLLM` (OpenAI-compat, small-model JSON normalization, 3 retries), `OpenAILLM` (OpenRouter/Gemini). Provider factory reads `USE_MOCK_LLM`, `LLM_PROVIDER`. |
| Orchestrator | `backend/app/agents/orchestrator.py` (90 lines) | Plan → Executor ReAct loop (max 5 iters) → LLM Reviewer → auto memory write-back. No DAG, no checkpoints, no retries, no deterministic verification, no events. |
| Memory | `backend/app/memory/base.py`, `sqlite.py` | `MemoryProvider` ABC + SQLite impl. `LIKE '%q%'` search only. Types: global/project/session. No vectors, no graph, no provenance. |
| Tools | `backend/app/tools/registry.py` (48 lines) | 3 tools: `calculator`, `save_memory`, `search_memory`. No file tools, no permissions model. |
| Schemas | `backend/app/models/schemas.py` | `Plan`, `ExecutorAction`, `ReviewResult`, `TaskState` (flat). |
| Config | `backend/app/config.py` | `LLM_PROVIDER=ollama`, `OLLAMA_MODEL=qwen2.5:3b-instruct`, OpenRouter/Gemini keys, mock flag. |
| Tests | `backend/tests/` | test_api, test_memory, test_mock_validation, test_workflow (mock-isolated). `live_tests.py`, `ollama_tests.py` scripts exist. |
| Frontend | `frontend/src/` | React 19 + Vite + TS, vanilla CSS (Stratify light theme, `App.css` 1695 lines). Views: Dashboard, ChatWorkspace (sync submit + stepper), ProjectSelector, MemoryExplorer (flat cards), ExecutionHistory, Settings. **No graph view, no SSE, no skill selection, no Memory Management workspace.** |
| Graphify | `graphify/` | Apache-2.0 CLI that maps a *codebase* into `graph.json` (tree-sitter AST; edges tagged `EXTRACTED`/`INFERRED`; interactive `graph.html`). It is **not** a 3D renderer and **not** an execution engine. We reuse: (a) its provenance vocabulary, (b) its node/edge JSON shape as a canonical exchange format, (c) optional import of a `graph.json` as a `document`+`knowledge` subgraph. |
| MiroFish | `MiroFish/` | Flask backend (`simulation/create`, `/prepare`, `/<id>`, `/list`, `/history`), Vue frontend, OASIS-style agent-society simulation with Zep graph memory. Purpose (simulated societies) ≠ skill-memory graph → keep separate; optional HTTP adapter, disabled by default. |
| Kotlin target | not supplied | Per instructions: do **not** invent packages/framework. Produce API contracts, Kotlin DTOs, a Ktor-based client sample (clearly labeled), Compose integration guidance. |

### Environment facts (measured)

- Ollama running at `http://localhost:11434`. Installed model: **`qwen2.5:3b-instruct`**
  (qwen2 family, 3.1B params, Q4_K_M, 32k ctx, capabilities `completion, tools`).
  **Discrepancy note:** the brief says `qwen2.5:3b`; the actual installed ID is
  `qwen2.5:3b-instruct` (the instruction-tuned 3B — same size class). We use the installed
  ID via `OLLAMA_MODEL` config, single instance reused sequentially. Swapping to
  `qwen2.5:9b` later = one config change (`OLLAMA_MODEL=qwen2.5:9b`), no code changes.
- No embedding model installed in Ollama → default retrieval is deterministic
  keyword/TF-IDF (honestly labeled in the UI); `EMBEDDING_PROVIDER=ollama` +
  `OLLAMA_EMBED_MODEL` enables semantic retrieval later.
- Backend venv Python 3.11.9 exists. Node v24.21.0 / npm 11.19.0, `node_modules` present.

### Gaps vs. the brief (what "documented but not implemented" means here)

`project.md` Phase list is accurate for Phases 1–7. **None** of the following exist in
code before this upgrade: memory graph, 3D workspace, compression/decompression, skill
selection, live events, RAG, four retrieval channels, DAG execution, independent
verification, failure learning, recovery promotion, curation pipeline, MiroFish adapter,
Kotlin handoff. All are built in this plan.

---

## 1. Target Architecture (summary — full detail in ARCHITECTURE.md)

New backend packages (all additive; existing files keep working):

```
backend/app/
  graph/schema.py      canonical Node/Edge/Event Pydantic models (Graphify-compatible vocab)
  graph/store.py       SQLite graph store: nodes, edges, bounded traversal, real counts,
                       compression states (collapsed/summary/detail-deferred/archived)
  skills/library.py    skill registry: manifest, dependencies (REQUIRES), allowed tools,
                       permissions, verification requirements, canonical workflows
  rag/ingest.py        TXT/MD/CSV/JSON (+PDF if pypdf present) → chunks + keywords
  rag/retriever.py     4 channels (knowledge/skill/experience/execution-state),
                       keyword scoring default, optional embeddings, context budget,
                       provenance for every retrieved item
  events/bus.py        persistent execution-event log + in-process bus + SSE reader
  execution/contracts.py  TaskContract, WorkflowStep, verdicts (PASS/FAIL/INCONCLUSIVE)
  execution/engine.py  dependency-aware DAG executor: order+permission enforcement,
                       checkpoints, bounded retries, duplicate-side-effect guard,
                       event emission, graph linkage, experience write-back
  execution/verifier.py   deterministic verifiers independent of the LLM
  memory/analysis.py   curation pipeline: duplicates, orphans, archive/merge candidates,
                       failure patterns; suggestions require explicit user approval
  adapters/mirofish.py optional simulation adapter (HTTP, disabled by default)
  api/memory_endpoints.py  all Memory-Management APIs incl. SSE stream
  tools/file_tools.py  read_csv/validate_csv/aggregate/write_json/write_md/verify_* with
                       backend-enforced permissions
```

Frontend additions: `views/MemoryManagement.tsx` (workspace), `components/Graph3D.tsx`
(`3d-force-graph`/three.js wrapper with list fallback), skill-selection panel in
ChatWorkspace, SSE client in `api.ts`, Apple-inspired token refresh in `index.css`/
`App.css`, new sidebar entry **Memory Management**.

## 2. Milestones (from the brief, Part 17)

- **M0** Audit (this document, section 0). ✅
- **M1** Qwen2.5:3B-instruct via Ollama confirmed as reasoning model; config single-source;
  smoke sales task through the agent. **Approach:** provider already exists; harden it
  (schema examples for new schemas), keep Mock mode for tests, add `/health` model report.
- **M2** Canonical graph model + persistence + bounded traversal + seeded skill library
  (skills, categories, tools, workflows, knowledge, recovery seeds) with real counts.
- **M3** RAG: ingestion + 4-channel retriever with provenance + budget; honest labeling
  when embeddings are off.
- **M4** Memory-Management APIs: overview, node detail, bounded expansion, search, skills,
  selection validation, RAG inspection, events (SSE + poll), failures, curation,
  compression states. Task submission becomes event-emitting (async by default, sync kept
  for tests/compat).
- **M5** Frontend: Memory Management workspace in sidebar, interactive 3D graph
  (rotate/pan/zoom/fit/search/select/expand/collapse/inspect), compressed overview,
  decompression, skill selection for new chats, live activity from real events, list
  fallback, Apple-inspired restyle.
- **M6** Dependency-aware execution engine + independent verification + failure episodes +
  validated recovery promotion (bounded, never self-modifying permissions).
- **M7** Tests + benchmark: `sales.csv` fixture with documented expected results; the 10
  scenarios of Part 13; live Ollama run measured and reported honestly.
- **M8** MiroFish optional adapter (disabled by default; capability probe + simulation
  submit/result as typed records with provenance; never used for ordinary tasks).
- **M9** Kotlin handoff package: `API_SPEC.md`, `KOTLIN_INTEGRATION_GUIDE.md`, Kotlin DTOs
  (kotlinx.serialization), Ktor client sample, Compose guidance, component mapping; final
  `OPEN_CHAT_MEMORY_INTEGRATION_PACKAGE.zip`.

M1–M6 are implemented back-to-front where possible: the engine (M6) lands with the graph
(M2) because events need node IDs; the docs are updated after each milestone in
`IMPLEMENTATION_STATUS.md`.

## 3. Key design decisions

1. **One model, sequential reuse.** Single Ollama server, single model for planner/
   executor/reviewer/summarizer roles — never parallel instances. Deterministic work
   (CSV math, scheduling, validation, persistence) is plain Python.
2. **Backend enforces, LLM proposes.** Tool permissions, dependency order, retry bounds,
   and verification are enforced in Python. Qwen only proposes/interprets/summarizes.
3. **Canonical workflow beats LLM improvisation for the demo skill.** The `sales-report`
   skill carries a deterministic workflow template (validate → aggregate → write JSON →
   write MD → verify). Qwen plans within the template's degrees of freedom (paths, keys).
   If Qwen's plan fails validation, the engine falls back to the canonical workflow and
   records that fact — the task still runs, honestly labeled.
4. **Compression is visual + summary-level, never destructive.** States: `COLLAPSED`
   (hidden in view), `SUMMARY_STORED`, `DETAIL_DEFERRED`, `ARCHIVED`, `DELETED` (explicit
   user action only). Expanding a group never loads instructions into model context —
   graph expansion and context loading are separate operations.
5. **Provenance everywhere.** Every edge: `EXPLICIT | EXTRACTED | INFERRED | USER_APPROVED`
   (Graphify vocabulary). Retrieved RAG items carry document/chunk/offset + selection
   reason + channel.
6. **Events are persisted facts, not animations.** The graph lights a node only when a
   persisted row says the backend actually did that thing. SSE streams from the events
   table; polling endpoint provided; disconnect ⇒ stale-state banner in UI.
7. **Scope isolation.** Project memory stays behind `project_id`; retrieval merges
   `global` + own project only; failures/recoveries inherit task scope.
8. **Honest degradation.** No embeddings configured ⇒ UI says "keyword retrieval".
   MiroFish off ⇒ adapter reports disabled. PDF parsing only if `pypdf` present.

## 4. Risks / blockers policy

- If `npm install 3d-force-graph` cannot reach the registry, the workspace still ships
  with the list/table fallback and the 3D component loads lazily; documented in status.
- If Ollama is stopped mid-run, tests report the failure rather than falling back to
  mocked success; `USE_MOCK_LLM=True` path exists for offline unit tests only.
- PDF ingestion requires `pypdf`; if absent, `.pdf` ingest returns a clear error and the
  other formats still work.
