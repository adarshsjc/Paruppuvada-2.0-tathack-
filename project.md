# Autonomous AI Agent Platform - Context & Onboarding

> **Target Audience:** Any AI assistant (like ChatGPT, Claude, Gemini) reading this file to gain full context of the repository.

## 1. Project Overview
This project is an **Autonomous AI Agent platform** built for a hackathon. The goal is to provide a maintainable, working baseline for a multi-agent system that executes tasks end-to-end. It features persistent memory, project-based knowledge isolation, reusable skills (tools), and built-in security checks.

Currently, it acts as a baseline that can plan, execute, and review tasks using a single LLM interface, while saving contextual data to a local SQLite database.

## 2. Technologies Used
- **Backend:** Python (3.11+), FastAPI, Uvicorn, Pydantic v2, Pytest, standard `sqlite3` library.
- **LLM Integration:** Google Gemini API (`gemini-3.8-flash`) accessed via the `openai` Python SDK with Google's OpenAI-compatible endpoint (`https://generativelanguage.googleapis.com/v1beta/openai/`), alongside a built-in zero-cost `MockLLM` mode.
- **Frontend:** React, TypeScript, Vite, Vanilla CSS (modular design system with dark mode & glassmorphism), `lucide-react` for icons.
- **Orchestration & Tooling:** Custom state machine (Planner -> Executor -> Reviewer), restricted Python tool sandbox (safe math calculator, SQLite memory tools), one-click launcher (`start_app.bat`).

## 3. Architecture & Decisions Made
- **Monorepo Structure:** The codebase is split strictly into `backend/` and `frontend/` to keep concerns decoupled.
- **Abstract Memory Pattern:** Memory is abstracted behind a `MemoryProvider` interface (`backend/app/memory/base.py`). The current implementation is `SQLiteMemoryProvider`, ensuring we can swap it out for Vector databases (for RAG) or Graph databases (like Graphify) without rewriting the agent logic.
- **Orchestrator-Worker Agent Pattern:** Instead of complex external frameworks (like LangChain or AutoGen), the orchestration is a custom, lightweight state machine:
  1. **Planner:** Outputs a step-by-step JSON plan.
  2. **Executor:** Uses ReAct-style loops (up to a 5-iteration limit) to pick tools (e.g., `calculator`, `save_memory`).
  3. **Reviewer:** Validates the Executor's final answer against the original request.
- **Strict JSON Outputs:** Agents are forced to output structured data matching Pydantic schemas using `response_format={"type": "json_object"}`.
- **Mock LLM Mode:** Configured via `.env` (`USE_MOCK_LLM=True`). This allows offline UI/UX development and fast test execution without spending real API credits.
- **Tool Sandbox:** Tools are explicitly defined Python functions. We purposefully avoid unrestricted Python `exec()` or Shell execution for security. For example, the `calculator` tool uses a strict whitelist of math characters.
- **CSS Aesthetics:** The frontend uses deep dark themes (`#0f172a`), glassmorphism (`backdrop-filter`), and gradients to achieve a premium UI feel without heavy CSS frameworks.

## 4. What Has Been Implemented (Phases 1-5)
1. **Phase 1 (Foundation):** FastAPI backend, modular folder structure (`api/`, `agents/`, `tools/`), MockLLM, and basic pytest suite.
2. **Phase 2 (Orchestration):** The Planner -> Executor -> Reviewer loop, tool registry, and CLI tracing.
3. **Phase 3 (Memory & Isolation):** SQLite database creation. Memories are tagged as `global`, `project`, or `session`. Tasks can be submitted with a `project_id`. The Orchestrator automatically searches memory for context before planning and auto-summarizes the result back to memory upon completion.
4. **Phase 4 (Frontend UI):** A React/Vite dashboard featuring a Chat Workspace, an Execution Trace panel (showing agent thoughts and tools in real-time), a Project Selector, and a Memory Explorer.
5. **Phase 5 (Gemini Integration & One-Click Launch):** 
   - Safely integrated Google Gemini API (`gemini-3.8-flash`) via the OpenAI compatibility endpoint (`generativelanguage.googleapis.com`).
   - Configured strict JSON structured outputs for the Orchestrator with enhanced Pydantic schema validation.
   - Built a live test verification suite (`backend/live_tests.py`) covering direct LLM JSON generation, end-to-end task workflows with tool calling, and SQLite persistence.
   - Created `start_app.bat` for one-click startup of both backend and frontend servers with automatic browser launch.

## 5. What Went Wrong During Implementation (Gotchas & Fixes)
When an AI works on this project in the future, watch out for these known issues that we already solved:

1. **Gemini Model Deprecation (404 Not Found)**
   - *The Issue:* Initial configurations referencing older models like `gemini-2.0-flash` or `gemini-2.5-flash` failed with Google API 404 errors indicating models were unavailable or deprecated for newer keys.
   - *The Fix:* Standardized configuration on `gemini-3.8-flash` in `.env`, `.env.example`, and `backend/app/config.py`.

2. **Gemini Free-Tier Rate Limits (429 Resource Exhausted)**
   - *The Issue:* The orchestrator workflow makes multiple sequential API calls (Plan -> Execute -> Review). On a free-tier Gemini API key, executing complex or repeated workflows can exhaust the per-minute quota, throwing a 429 error.
   - *The Fix:* We wrapped API calls with explicit error capture in `llm.py` and safe fallback handling in the orchestrator. If quota limits are reached, the exact error detail is captured in the trace and reported cleanly to the UI instead of unhandled crashes.

3. **Pytest Offline Mock Isolation**
   - *The Issue:* Running `pytest` when `.env` was configured with `USE_MOCK_LLM=False` attempted real LLM API calls, failing unit tests if no API key was available in CI/local test runners.
   - *The Fix:* Patched `app.config.settings.use_mock_llm` to `True` within unit test fixtures in `test_api.py` and `test_workflow.py`, reserving live API calls for `live_tests.py`.

4. **SQLite File Locking in Pytest (`WinError 32`)**
   - *The Issue:* The memory tests initially used a physical `test_memory.db` file. During teardown, Windows threw a Permission Error because the SQLite connection remained open/cached, preventing file deletion.
   - *The Fix:* We migrated the pytest fixtures to use a unique shared in-memory database URI (`file:memdb_...?mode=memory&cache=shared`) and updated the `SQLiteMemoryProvider` to support passing `uri=True` to `sqlite3.connect()`.

5. **Tool Renaming Test Failures**
   - *The Issue:* During Phase 3, we renamed the `save_note` tool to `save_memory` to integrate with SQLite. We forgot to update `test_workflow.py`, causing `KeyError: 'save_note'`.
   - *The Fix:* Updated the test file to match the new function signatures.

6. **TypeScript `verbatimModuleSyntax` Errors**
   - *The Issue:* During Phase 4 frontend compilation (`npm run build`), Vite/TypeScript threw `error TS1484` complaining that types must be imported using a type-only import.
   - *The Fix:* Explicitly updated imports across React components to use `import type { Project, MemoryItem } from './types'`.

7. **Environment File Security (.env in git)**
   - *The Issue:* The initial repository `.gitignore` omitted `.env`, which could accidentally lead to leaking API keys.
   - *The Fix:* Updated root `.gitignore` to explicitly ignore `.env`, `*.env`, and `backend/.env`.

## 6. How to Run the Platform
- **Option A (One-Click):** Run `start_app.bat` from the root directory.
- **Option B (Manual):**
  1. Backend: `cd backend && .\venv\Scripts\activate && uvicorn app.main:app --reload`
  2. Frontend: `cd frontend && npm run dev`
  3. Open `http://localhost:5173`

## 7. Future Roadmap (Not Yet Implemented)
- **Vector RAG:** Swapping/extending SQLite with Chroma/Qdrant for semantic search over ingested documents.
- **Graph Memory:** Integrating Neo4j or Graphify to store entities, relationships, and concepts across projects.
- **n8n Webhooks:** Allowing the Executor to call n8n webhooks as "tools", and allowing n8n to trigger the FastAPI endpoints.
- **Human-in-the-Loop:** Pausing the execution loop in the backend to wait for a human approval via the React UI before executing sensitive tools.
