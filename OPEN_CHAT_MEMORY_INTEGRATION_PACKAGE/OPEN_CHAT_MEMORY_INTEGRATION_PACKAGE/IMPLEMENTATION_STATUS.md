# IMPLEMENTATION STATUS

Updated after each milestone. Legend: ✅ done+tested · 🟡 done (partial/limited) · ⬜ not started · ⛔ blocked (reason given)

## Milestones

- **M0 — Audit**: ✅ All 6 project parts, Graphify (3 parts), MiroFish (1 part), `project.md`,
  `design.md` inspected; real state documented in `IMPLEMENTATION_PLAN.md §0`.
  Environment measured: Ollama up, model `qwen2.5:3b-instruct` (brief said `qwen2.5:3b` —
  discrepancy recorded, not silently switched), no embedding model installed, Node 24/npm 11.
- **M1 — Qwen via Ollama**: ⬜
- **M2 — Graph model + persistence**: ⬜
- **M3 — RAG 4 channels**: ⬜
- **M4 — Memory APIs**: ⬜
- **M5 — Frontend workspace**: ⬜
- **M6 — Execution engine + verification + failure learning**: ⬜
- **M7 — Tests + benchmark**: ⬜
- **M8 — MiroFish adapter**: ⬜
- **M9 — Kotlin package + ZIP**: ⬜

## Acceptance criteria (from the brief)

| # | Criterion | Status |
|---|---|---|
| 1 | Qwen2.5:3B is the local reasoning model | ⬜ |
| 2 | Existing Open Chat GUI stays functional | ⬜ |
| 3 | Memory Management in left sidebar | ⬜ |
| 4 | Distinct, useful graph views | ⬜ |
| 5 | Nodes/edges from real persistent data | ⬜ |
| 6 | Real 3D interaction (rotate/pan/zoom/select/expand/inspect) | ⬜ |
| 7 | Compressed groups expandable, sources preserved | ⬜ |
| 8 | New chat can select skills/groups | ⬜ |
| 9 | Selected-skill mode respects scope + mandatory deps | ⬜ |
| 10 | Nodes illuminate only on real backend events | ⬜ |
| 11 | RAG retrieves evidence with provenance | ⬜ |
| 12 | Sales-report workflow completes end-to-end | ⬜ |
| 13 | Recoverable failures handled with bounded retries | ⬜ |
| 14 | Verification checks real files/values independently | ⬜ |
| 15 | Failure memory separates hypotheses vs verified | ⬜ |
| 16 | Project-specific memory isolated | ⬜ |
| 17 | Benchmark/test reports from actual runs | ⬜ |
| 18 | MiroFish optional, doesn't compromise normal tasks | ⬜ |
| 19 | Kotlin contracts and examples included | ⬜ |
| 20 | Handoff folder + ZIP created | ⬜ |
