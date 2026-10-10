# IMPLEMENTATION STATUS

Updated after each milestone. Legend: ✅ done+tested · 🟡 done (partial/limited) · ⬜ not started · ⛔ blocked (reason given)

## Milestones

- **M0 — Audit**: ✅ All 6 project parts, Graphify (3 parts), MiroFish (1 part), `project.md`,
  `design.md` inspected; real state documented in `IMPLEMENTATION_PLAN.md §0`.
- **M1 — Local Qwen via Ollama**: ✅ Provider abstraction confirmed (Mock | Ollama | OpenRouter |
  Gemini). **Model change (owner-directed, 2026-10-10):** the brief specified `qwen2.5:3b`; the
  owner then requested 9B. `qwen2.5:9b` **does not exist** in the Ollama registry (verified 404;
  Qwen2.5 ships 0.5b/1.5b/3b/7b/14b/32b/72b), and the machine has `qwen3.5:9b` installed, so the
  configured default is **`qwen3.5:9b`** (tool-capable, 262k context). Alternatives via
  `OLLAMA_MODEL`: `qwen2.5:7b`, `qwen2.5:3b`. Live end-to-end run recorded in TEST_REPORT.md.
- **M2 — Graph model + persistence**: ✅ Canonical schema (15 node types, 12 edge types,
  4-level provenance, 5 compression states), SQLite store, bounded traversal, real SQL counts.
  Fixes this session: RAG tables now created on every fresh store (retriever no longer crashes
  on an empty DB); `_child_count` fixed to work without an external connection.
- **M3 — RAG 4 channels**: ✅ Knowledge / skill / experience / execution-state channels,
  budgeted retrieval with provenance and honest "keyword retrieval" labeling.
- **M4 — Memory APIs**: ✅ Graph overview/node/expand/collapse/archive/restore/delete, search,
  stats, skills listing + selection validation, RAG documents/ingest/query, tasks, events
  (SSE stream + polling), failures, recoveries, curation analyze/approve/reject, MiroFish status.
- **M5 — Frontend workspace**: ⬜ (next)
- **M6 — Execution engine + verification + failure learning**: ✅ Contract → DAG execution →
  bounded retries → validated-recovery-only → independent verifier (recomputes from source CSV;
  PASS/FAIL/INCONCLUSIVE) → failure episodes → experience write-back. Session additions:
  fail-fast on invalid CSV validation (never aggregate from rejected data); verification report
  now included in failed task results so the UI can show *why*.
- **M7 — Tests + benchmark**: 🟡 10 deterministic E2E scenarios for the sales-report workflow
  all pass (valid CSV, missing columns, malformed rows, transient failure + retry, permanent
  failure bound, wrong output path, falsified values, selected-scope respect, missing-dependency
  block, event replay). 29/29 total suite. Benchmark + live acceptance report in progress.
- **M8 — MiroFish adapter**: 🟡 Adapter implemented, disabled by default, live simulation not tested.
- **M9 — Kotlin package + ZIP**: ⬜

## Acceptance criteria (from the brief)

| # | Criterion | Status |
|---|---|---|
| 1 | Qwen2.5:3B is the local reasoning model | 🟡 owner-directed model change → qwen3.5:9b (see M1) |
| 2 | Existing Open Chat GUI stays functional | 🟡 backend preserved; GUI refresh pending |
| 3 | Memory Management in left sidebar | ⬜ |
| 4 | Distinct, useful graph views | ⬜ |
| 5 | Nodes/edges from real persistent data | ✅ store + APIs verified by tests |
| 6 | Real 3D interaction | ⬜ |
| 7 | Compressed groups expandable, sources preserved | ✅ API-level (expand/collapse/archive/restore/soft-delete) |
| 8 | New chat can select skills/groups | ✅ API-level (selection validation + binding in task_runs) |
| 9 | Selected-skill mode respects scope + mandatory deps | ✅ tested (tests 8 & 9) |
| 10 | Nodes illuminate only on real backend events | ✅ persisted event log + SSE/polling; UI wiring pending |
| 11 | RAG retrieves evidence with provenance | ✅ |
| 12 | Sales-report workflow completes end-to-end | ✅ **live run passed**: qwen3.5:9b, 98.8 s, verdict PASS (6/6 checks incl. recomputation match); see `backend/live_run_result.json` |
| 13 | Recoverable failures handled with bounded retries | ✅ tested (tests 4 & 5) |
| 14 | Verification checks real files/values independently | ✅ tested (tests 1, 6, 7) |
| 15 | Failure memory separates hypotheses vs verified | ✅ diagnosis_status field + validated-only recovery |
| 16 | Project-specific memory isolated | 🟡 scope filters in store/API; frontend pending |
| 17 | Benchmark/test reports from actual runs | 🟡 in progress |
| 18 | MiroFish optional, doesn't compromise normal tasks | ✅ disabled by default; isolated adapter |
| 19 | Kotlin contracts and examples included | ⬜ |
| 20 | Handoff folder + ZIP created | 🟡 updated snapshot ZIP delivered; final package pending |

## Session fixes (2026-10-10)

1. `graph/store.py` — added RAG tables to the canonical schema (fresh-DB crash fix).
2. `graph/store.py` — `_child_count` no longer dereferences a `None` connection.
3. `execution/engine.py` — fail-fast when `validate_csv` reports an invalid file;
   verification report now propagates into failed task results.
4. Config/model switch to `qwen3.5:9b` with full discrepancy documentation.
5. Added `tests/test_engine_e2e.py` — 10 PART-13 scenarios.
