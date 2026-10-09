# Autonomous AI Agent Platform - Context & Onboarding

> **Target Audience:** Any AI assistant (like ChatGPT, Claude, Gemini) reading this file to gain full context of the repository.

## 1. Project Overview
This project is an **Autonomous AI Agent platform** built for a hackathon. The goal is to provide a maintainable, working baseline for a multi-agent system that executes tasks end-to-end. It features persistent memory, project-based knowledge isolation, reusable skills (tools), and built-in security checks.

Tasks are solved by three concurrent solution agents. A judge selects the answer that best matches the request, and the UI shows all candidates and the selected response. The project also retains the original planner/executor/reviewer workflow for CLI use. Context and selected answers are saved to a local SQLite database.

## 2. Technologies Used
- **Backend:** Python (3.11+), FastAPI, Uvicorn, Pydantic v2, Pytest, standard `sqlite3` library.
- **LLM Integration:** OpenRouter Free Models Router (`openrouter/free`) accessed via the `openai` Python SDK with OpenRouter's OpenAI-compatible endpoint (`https://openrouter.ai/api/v1`), alongside a built-in zero-cost `MockLLM` mode.
- **Frontend:** React, TypeScript, Vite, Vanilla CSS (modular design system with dark mode & glassmorphism), `lucide-react` for icons.
- **Orchestration & Tooling:** Concurrent solution agents with a judge, plus a custom planner/executor/reviewer state machine (Planner -> Executor -> Reviewer), restricted Python tool sandbox (safe math calculator, SQLite memory tools), one-click dependency-bootstrapping launcher (`start_app.bat`).

## 3. Architecture & Decisions Made
- **Monorepo Structure:** The codebase is split strictly into `backend/` and `frontend/` to keep concerns decoupled.
- **Abstract Memory Pattern:** Memory is abstracted behind a `MemoryProvider` interface (`backend/app/memory/base.py`). The current implementation is `SQLiteMemoryProvider`, ensuring we can swap it out for Vector databases (for RAG) or Graph databases (like Graphify) without rewriting the agent logic.
- **Orchestrator-Worker Agent Pattern:** Instead of complex external frameworks (like LangChain or AutoGen), the orchestration is a custom, lightweight state machine:
  1. **Planner:** Outputs a step-by-step JSON plan.
  2. **Executor:** Uses ReAct-style loops (up to a 5-iteration limit) to pick tools (e.g., `calculator`, `save_memory`).
  3. **Reviewer:** Validates the Executor's final answer against the original request.
- **Parallel Solutions:** The task API submits three independent solution prompts concurrently, records individual failures without discarding successful candidates, then asks a judge model to select the best successful answer. OpenRouter can route each agent to a free model; `OPENROUTER_AGENT_MODELS` can override the three model routes.
- **Strict JSON Outputs:** Agents are forced to output structured data matching Pydantic schemas using `response_format={"type": "json_object"}` and resilient markdown fence parsing.
- **Mock LLM Mode:** Configured via `.env` (`USE_MOCK_LLM=True`). This allows offline UI/UX development and fast test execution without spending real API credits.
- **Tool Sandbox:** Tools are explicitly defined Python functions. We purposefully avoid unrestricted Python `exec()` or Shell execution for security. For example, the `calculator` tool uses a strict whitelist of math characters.
- **CSS Aesthetics:** The frontend uses deep dark themes (`#0f172a`), glassmorphism (`backdrop-filter`), and gradients to achieve a premium UI feel without heavy CSS frameworks.

## 4. What Has Been Implemented (Phases 1-5)
1. **Phase 1 (Foundation):** FastAPI backend, modular folder structure (`api/`, `agents/`, `tools/`), MockLLM, and basic pytest suite.
2. **Phase 2 (Orchestration):** The Planner -> Executor -> Reviewer loop, tool registry, and CLI tracing.
3. **Phase 3 (Memory & Isolation):** SQLite database creation. Memories are tagged as `global`, `project`, or `session`. Tasks can be submitted with a `project_id`. The Orchestrator automatically searches memory for context before planning and auto-summarizes the result back to memory upon completion.
4. **Phase 4 (Frontend UI):** A React/Vite dashboard featuring a Chat Workspace, an Execution Trace panel (showing agent thoughts and tools in real-time), a Project Selector, and a Memory Explorer.
5. **Phase 5 (OpenRouter Free Models Integration & One-Click Launch):**
   - Integrated OpenRouter's Free Models Router (`openrouter/free`) via `https://openrouter.ai/api/v1` using OpenAI SDK.
   - Dynamic model ID detection (`response.model`) capturing the exact underlying model selected per request (e.g. `meta-llama/llama-3.3-70b-instruct:free`, `cohere/north-mini-code:free`, `poolside/laguna-xs-2.1:free`).
   - Resilient JSON schema extraction with retry protection against non-instruct or moderation models.
   - Enhanced tool argument normalization in `registry.py` and clear parameter documentation in orchestrator prompts.
   - Built a live test verification suite (`backend/live_tests.py`) covering direct LLM connection, structured planning, tool execution verification, reviewer approval, and SQLite persistence.
   - Created `start_app.bat` for one-click startup of both backend and frontend servers with automatic browser launch.
6. **Phase 6 (Parallel Agent Ensemble & Startup Recovery):**
   - Added three concurrent answer agents and a judge to select the best candidate for API tasks; all candidates are visible in the execution trace.
   - Updated the Windows launcher to bootstrap Python and Node dependencies and wait for both services to become reachable before opening the site.
   - Added a live API-health badge and made mock mode the default for a working offline first launch.
7. **Phase 7 (Memory-Gated Web Research):**
   - When memory search has no matching entries, query Bing's public search results and provide titles, snippets, and URLs as untrusted reference context to the parallel agents.
   - Display retrieved source links and explicit search errors in the execution trace; web search can be disabled or capped using backend settings.

## 5. What Went Wrong During Implementation (Gotchas & Fixes)
When an AI works on this project in the future, watch out for these known issues that we already solved:

1. **OpenRouter Free Pool Routing to Moderation Models**
   - *The Issue:* `openrouter/free` dynamically routes requests across available free models. Occasionally it routes to a content safety filter (such as `nvidia/nemotron-3.5-content-safety:free`), which outputs `"User Safety: safe"` instead of valid JSON, failing schema validation.
   - *The Fix:* Implemented a retry loop (up to 3 attempts) in `llm.py`'s `generate_json`. If an incompatible model is returned, it automatically retries with OpenRouter, routing to an instruction-tuned model.

2. **Windows Console Charmap Encoding (`\u2011`)**
   - *The Issue:* Modern LLMs often return unicode characters (like non-breaking hyphens `\u2011` or em-dashes). On Windows PowerShell with default `cp1252` encoding, printing LLM feedback threw a `UnicodeEncodeError`.
   - *The Fix:* Added `sys.stdout.reconfigure(encoding='utf-8', errors='replace')` to guarantee safe console logging.

3. **Tool Parameter Name Ambiguity in Small Models**
   - *The Issue:* Without explicit parameter documentation in the prompt, smaller free models guessed parameter names like `calculation` or `action` instead of `expression` for the calculator tool.
   - *The Fix:* Added clear tool signatures and example JSON payloads to the orchestrator prompt and added automatic argument normalization in `execute_tool`.

4. **Pytest Offline Mock Isolation**
   - *The Issue:* Running `pytest` when `.env` was configured with `USE_MOCK_LLM=False` attempted real LLM API calls, failing unit tests if no API key was available in CI/local test runners.
   - *The Fix:* Patched `app.config.settings.use_mock_llm` to `True` within unit test fixtures in `test_api.py` and `test_workflow.py`, reserving live API calls for `live_tests.py`.

5. **SQLite File Locking in Pytest (`WinError 32`)**
   - *The Issue:* The memory tests initially used a physical `test_memory.db` file. During teardown, Windows threw a Permission Error because the SQLite connection remained open/cached, preventing file deletion.
   - *The Fix:* We migrated the pytest fixtures to use a unique shared in-memory database URI (`file:memdb_...?mode=memory&cache=shared`) and updated the `SQLiteMemoryProvider` to support passing `uri=True` to `sqlite3.connect()`.

6. **TypeScript `verbatimModuleSyntax` Errors**
   - *The Issue:* During Phase 4 frontend compilation (`npm run build`), Vite/TypeScript threw `error TS1484` complaining that types must be imported using a type-only import.
   - *The Fix:* Explicitly updated imports across React components to use `import type { Project, MemoryItem } from './types'`.

7. **Environment File Security (.env in git)**
   - *The Issue:* The initial repository `.gitignore` omitted `.env`, which could accidentally lead to leaking API keys.
   - *The Fix:* Updated root `.gitignore` to explicitly ignore `.env`, `*.env`, and `backend/.env`.

8. **Multi-Agent Latency & Free Router Performance**
   - *The Issue:* Tasks submitted to the agent can take 20–45 seconds before the final result is displayed in the UI. 
   - *Why It Happens:* The orchestration is a multi-step sequential state machine (Planner -> Executor [Step 1] -> Tool Execution -> Executor [Step 2] -> Reviewer -> Memory Auto-Summary). Each task makes 4 to 5 separate LLM API roundtrips. When using the generic `openrouter/free` router, free-tier upstream providers often have cold-start queueing (5–12s per roundtrip).
   - *How to Speed It Up:*
     1. **Target Specific Fast Free Models in `.env`:** Instead of the generic `openrouter/free` router (which adds routing delay), specify high-throughput free models directly:
        - `OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct:free`
        - `OPENROUTER_MODEL=google/gemini-2.0-flash-exp:free`
        - `OPENROUTER_MODEL=mistralai/mistral-7b-instruct:free`
     2. **Use Direct Gemini Provider:** Setting `USE_MOCK_LLM=False` with `GEMINI_API_KEY` and `GEMINI_MODEL=gemini-3.8-flash` processes each agent step in ~600–900ms.
     3. **Frontend Multi-Stage Progress Stepper:** Described in [design.md](file:///d:/project/Thtava%20final/design.md), visual stage transitions (Planning ⏳ -> Executing ⚙️ -> Reviewing 🔍 -> Done ✅) provide immediate visual feedback.

## 6. How to Run the Platform
- **Option A (One-Click Windows):** Double-click or run `start_app.bat`.
- **Option B (PowerShell Commands):**
  1. Backend:
     ```powershell
     cd backend
     .\venv\Scripts\Activate.ps1
     uvicorn app.main:app --reload --port 8000
     ```
  2. Frontend:
     ```powershell
     cd frontend
     npm run dev
     ```
  3. Open `http://localhost:5173` in your browser.

## 7. UI/UX & Frontend Design System
A comprehensive design system, component hierarchy, color tokens, and interface overhaul blueprint is documented in [design.md](./design.md).

For live free-model answers, set `USE_MOCK_LLM=False` and `OPENROUTER_API_KEY` in `backend/.env`. Without that configuration, the app starts in mock mode so the site remains available offline.

## 8. Future Roadmap (Not Yet Implemented)
- **Vector RAG:** Swapping/extending SQLite with Chroma/Qdrant for semantic search over ingested documents.
- **Graph Memory:** Integrating Neo4j or Graphify to store entities, relationships, and concepts across projects.
- **n8n Webhooks:** Allowing the Executor to call n8n webhooks as "tools", and allowing n8n to trigger the FastAPI endpoints.
- **Human-in-the-Loop:** Pausing the execution loop in the backend to wait for a human approval via the React UI before executing sensitive tools.
- **Streaming Execution Traces (SSE / WebSockets):** Streaming each agent state step in real-time to the frontend UI as it occurs.
