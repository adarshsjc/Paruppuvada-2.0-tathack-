# Open Chat - Autonomous AI Agent Platform (`project.md`)

> **Target Audience:** Any AI assistant (like ChatGPT, Claude, Gemini) reading this file to gain full context of the repository.

## 1. Project Overview
This project is an **Autonomous AI Agent & Project Management Platform** known as **Open Chat** (modeled after the **Stratify** design system). Built for a hackathon and production-ready iteration, it provides an end-to-end multi-agent system executing complex goals with persistent memory, isolated project contexts, tool sandboxing, reviewer verification loops, 3D memory graph visualizers, and an interactive cyber-deck workspace interface.

The platform provides a **Dual Chat Architecture**:
- **Simple Mode:** Fast, terminal-style direct inference with local Ollama (`qwen2.5:3b`) completing in ~1–2 seconds with zero memory/orchestrator overhead.
- **Complex Mode:** Full multi-agent deliberation loop (Autonomous Planner -> Direct Solver, Critical Thinker, Research Synthesizer -> Judge Evaluation -> Reviewer & Verification -> SQLite & Graph Memory updates).

---

## 2. Technologies Used
- **Backend:** Python (3.11+), FastAPI, Uvicorn, Pydantic v2, Pytest, standard `sqlite3` library.
- **LLM Integration:** Local Ollama inference (`qwen2.5:3b` at `http://127.0.0.1:11434`), OpenRouter Free Models Router, Google Gemini API, and built-in zero-cost `MockLLM` mode.
- **Frontend:** React 19, TypeScript, Vite, Vanilla CSS Design System (Stratify tokens), `3d-force-graph` for 3D Memory Rendering, `lucide-react` for icons.
- **Orchestration & Tooling:** 
  - Dual-mode chat execution (Instant Direct vs Multi-Agent Ensemble).
  - Parallel agent ensemble with Judge Selection rubric (`backend/app/agents/ensemble.py`).
  - Restricted Python tool sandbox (safe math calculator, SQLite memory tools, web search, API client simulation, git ops).
  - Graph Store (`SQLiteGraphStore`) with auto-seeding on startup.
  - Server-Sent Events (SSE) for realtime DAG execution streaming.
- **Packaging & Desktop:** PyInstaller launcher (`OpenChat.exe`) coordinating background Python Uvicorn and Vite servers with automated browser launch and process lifecycle cleanup.

---

## 3. Architecture & Decisions Made

### 3.1. Monorepo Structure
The repository is split strictly into `backend/` and `frontend/` to keep concerns decoupled, with desktop launch utilities in `launcher/` and packaged deliverables in `parts/`.

### 3.2. Dual Execution Engine (Simple Mode vs Complex Mode)
- **Simple Mode (`/api/v1/chat/simple`):** 
  - Directly proxies user prompts to the local LLM (`qwen2.5:3b` via Ollama) with a concise, helpful system instruction.
  - Skips memory RAG searches, step planning, parallel ensemble solvers, and post-verification passes.
  - Delivers answers at terminal speeds (~1–2 seconds), matching user expectations for everyday chatting and rapid inquiries.
- **Complex Mode (`/api/v1/tasks` + `/stream`):**
  - Engages the full multi-agent deliberation pipeline.
  - Retrieves semantic and graph context from SQLite memory.
  - Grounds prompts in the project's selected skill capabilities (`Direct Solver`, `Critical Thinker`, `Research Synthesizer`).
  - Executes tools within the sandbox, scores outputs via the Judge, and persists reflections back to memory and graph.

### 3.3. 24-Skill Capabilities & Graph Ecosystem
- **Skill Manifests (`backend/app/skills/library.py`):** 24 distinct capabilities organized across 6 core categories:
  1. `cat:core-utilities`: Calculation, String Ops, File Ops, System Shell.
  2. `cat:knowledge-memory`: Graphify RAG, SQLite Memory, Concept Linking, Failure Extraction.
  3. `cat:web-research`: Search, Content Extraction, Fact Checking, Competitive Benchmarking.
  4. `cat:verification-quality`: Code Linting, Unit Test Runner, Reviewer Audit.
  5. `cat:architecture-synthesis`: DAG Planner, Multi-Agent Ensemble, Doc Generation.
  6. `cat:analysis-integration`: Data Analysis & Charting, REST API Client, Git Version Control.
- **SQLite Graph Store (`backend/app/memory/graph_store.py`):**
  - Auto-seeded on application startup with **73 nodes and 95 edges**.
  - Graph relationships include `CONTAINS`, `CALLS`, `REQUIRES`, and `VERIFIED_BY`.
  - Frontend renders the graph in both 3D Force-Directed space (`3d-force-graph`) and 2D canvas with category-colored nodes, interactive inspectors, and camera controls.

### 3.4. Project Context & Active Skill Grounding
- **Project Workspaces (`ProjectSelector.tsx`):**
  - Users can create isolated project contexts and attach custom skill sets using an interactive, categorized checkbox picker.
  - "Create & Launch Chat Workspace ➔" creates the project and immediately transitions into the chat interface with that project active.
- **Active Skills Ribbon (`ChatWorkspace.tsx`):**
  - Displays configured project skills at the top of the chat view (e.g., `Configured Skills (2): [data-analysis] [api-client] Modify`).
  - When in Complex Mode, active skills are resolved to tool signatures and descriptions, directly injected into prompt contexts for all ensemble agents.

### 3.5. Abstract Memory Pattern
- Abstracted behind `MemoryProvider` interface (`backend/app/memory/base.py`) implemented by `SQLiteMemoryProvider`.
- Memories are segmented into `global`, `project`, and `session` scopes.
- Tasks submitted with a `project_id` retrieve and summarize context specifically within that project boundary.

### 3.6. Tool Sandbox & Execution Safety
- Tools are whitelisted, strictly typed Python functions in `backend/app/tools/registry.py`.
- No unrestricted `exec()` or arbitrary OS command execution is allowed.
- Argument normalization guards against LLM hallucination of parameter names.

---

## 4. What Has Been Implemented (Phases 1–10)

1. **Phase 1 (Foundation):** FastAPI backend, modular architecture (`api/`, `agents/`, `tools/`), MockLLM, and basic pytest suite.
2. **Phase 2 (Orchestration):** Planner -> Executor -> Reviewer loop, tool registry, and CLI tracing.
3. **Phase 3 (Memory & Isolation):** SQLite database creation with `global`, `project`, and `session` scopes, auto-summarization of completed runs.
4. **Phase 4 (Frontend UI Foundation):** React/Vite dashboard featuring Chat Workspace, Execution Trace, Project Selector, and Memory Explorer.
5. **Phase 5 (OpenRouter Free Models & Batch Scripts):** Free model routing, live test verification suite (`backend/live_tests.py`), and `start_app.bat`.
6. **Phase 6 (Stratify UI Redesign):** Complete brand and UI overhaul adhering to Stratify clean card aesthetics, bento dashboards, and micro-animations.
7. **Phase 7 (AI Context Splitting):** Monorepo chunking via `split_project.py` and `zip_extra.py` into 6 balanced `.zip` packages under 10MB in `parts/`.
8. **Phase 8 (Memory Graph Integration, Local Inference & Windows Launcher):**
   - Connected backend to local Ollama running `qwen2.5:3b`.
   - 3D Force-Directed Memory Graph workspace (`3d-force-graph`).
   - RAG memory injection and failure learning extraction.
   - Built standalone Windows executable launcher `OpenChat.exe`.
9. **Phase 9 (Dual Chat Modes - Simple vs Complex):**
   - Implemented Simple Mode (`POST /api/v1/chat/simple`) for sub-2-second direct terminal-style Ollama chat responses.
   - Preserved Complex Mode for deep reasoning, tool execution, and memory updates.
   - Added interactive mode toggle in Chat Workspace header and quick prompt bar.
10. **Phase 10 (24-Skill Graph Ecosystem, Interactive Project Skills & Ensemble Grounding):**
    - Expanded skill library from 18 to 24 skills across 6 categories with complete graph relations (73 nodes, 95 edges).
    - Built Interactive Skill Capabilities Selector in `ProjectSelector.tsx` with search, category filtering, and direct launch.
    - Added Active Skills Ribbon in `ChatWorkspace.tsx`.
    - Integrated skill manifests into ensemble agent prompts (`ensemble.py`) in Complex Mode.
    - Validated all 36 backend tests and rebuilt `OpenChat.exe`.

---

## 5. What Went Wrong During Implementation (Gotchas & Fixes)

1. **Chat Latency & Waiting at Memory Stage**
   - *The Issue:* Users reported chat was hanging/waiting too long at the memory stage when asking simple queries like "Hello" or quick math.
   - *Why It Happened:* The complex orchestration pipeline sequentially performed memory RAG search, multi-step planning, 3-agent ensemble execution, judge scoring, and memory auto-summarization.
   - *The Fix:* Implemented dual chat modes. Simple Mode connects straight to Ollama `qwen2.5:3b` without memory search overhead (~1.2s response). Complex Mode is reserved for deep, multi-tool agent tasks.

2. **Skills Missing from 3D/2D Graph View**
   - *The Issue:* The memory graph visualization was empty or missing skill nodes on fresh startup.
   - *Why It Happened:* Skill nodes and relationship edges had to be explicitly seeded into `SQLiteGraphStore`.
   - *The Fix:* Created `seed_graph(store)` in `backend/app/skills/library.py` and hooked it directly into FastAPI `lifespan` in `app/main.py`. On startup, all 24 skills, 6 workflows, and rules are automatically seeded (73 nodes, 95 edges).

3. **Tool Parameter Name Ambiguity in Small Models**
   - *The Issue:* Smaller models like `qwen2.5:3b` sometimes passed parameters as `calculation` or `action` instead of `expression`.
   - *The Fix:* Added automatic parameter normalization in `execute_tool()` and clear argument schemas in agent system prompts.

4. **Windows Console Charmap Encoding (`\u2011`)**
   - *The Issue:* Printing LLM unicode responses on Windows PowerShell with default `cp1252` encoding threw `UnicodeEncodeError`.
   - *The Fix:* Added `sys.stdout.reconfigure(encoding='utf-8', errors='replace')` in startup entrypoints.

5. **Pytest SQLite File Locking on Windows (`WinError 32`)**
   - *The Issue:* Physical test databases locked during teardown on Windows.
   - *The Fix:* Migrated pytest fixtures to unique in-memory shared database URIs (`file:memdb_...?mode=memory&cache=shared`).

6. **TypeScript Strict Type Imports & Unused Locals**
   - *The Issue:* Build failed with `TS6133: 'xyz' is declared but its value is never read`.
   - *The Fix:* Pruned unused imports in TSX views and used explicit `import type` syntax.

---

## 6. How to Run the Platform

### Step 1: Start Local Ollama AI Engine
Ensure Ollama is installed and running with `qwen2.5:3b`:
```powershell
ollama run qwen2.5:3b
```
The backend automatically connects to Ollama at `http://127.0.0.1:11434`.

### Step 2: Launch Platform
- **Option A (One-Click Windows EXE - Recommended):** Double-click `OpenChat.exe` in the root folder. It starts the backend API, frontend server, checks Ollama, and opens your browser.
- **Option B (Batch Script):** Run `start_app.bat`.
- **Option C (Manual Terminal):**
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

---

## 7. Verification & Testing
- **Backend Unit Tests:** Run `pytest backend/tests` (36 tests covering API, E2E engine, ensemble, memory, mock validation, web search, and workflows).
- **Frontend Build:** Run `npm run build` in `frontend/` (TypeScript verification & Vite production build).
- **Live Tests:** Run `python backend/live_tests.py` for end-to-end Ollama/OpenRouter verification.
