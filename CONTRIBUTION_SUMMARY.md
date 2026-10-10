# Open Chat — Project Contribution & Development Summary

> **Repository:** `Paruppuvada-2.0-tathack-`  
> **Platform:** Autonomous Agentic AI with Graph-Based Memory & Reusable Skills  

---

## 1. Project Overview

**Open Chat** is an autonomous multi-agent AI system combining persistent memory, graph-based project knowledge (Graphify), reusable skills, and built-in security verification.

### Dual Execution Architecture
* **⚡ Simple Mode:** High-speed, terminal-style direct inference with local Ollama (`qwen2.5`) for instant answers with zero orchestrator overhead (~1–2s latency).
* **🧠 Complex Mode:** Full multi-agent orchestration loop featuring:
  1. RAG context & knowledge retrieval
  2. Parallel solving agents (*Direct Solver*, *Critical Thinker*, *Research Synthesizer*)
  3. Automated Judge Rubric & solution evaluation
  4. Verification review against hallucinations and prompt injection
  5. Automatic write-back to persistent SQLite memory and graph store

---

## 2. Completed Implementation & Contributions

### ⚙️ Backend Architecture (FastAPI + Python 3.12 + SQLite + Ollama)
* **API Endpoints:**
  * `GET /health`: Real-time service health, active provider, model name, and agent count.
  * `POST /api/v1/tasks`: Synchronous dual-mode task execution engine.
  * `GET / POST /api/v1/projects`: Project context isolation and management.
  * `GET /api/v1/skills`: 24-skill categorized registry.
  * `GET / POST / DELETE /api/v1/memory`: SQLite persistent RAG memory & graph nodes.
* **Multi-Agent Ensemble Engine:**
  * Autonomous Planner generating Step-by-Step DAG execution plans.
  * Multi-agent parallel dispatching (`ensemble.py`).
  * Solution evaluation with automated scoring rubric.
  * Human-in-the-loop verification and security audit loops.
* **SQLite Graph Store:**
  * Auto-seeded on startup with **73 nodes and 95 relationship edges** (`CONTAINS`, `CALLS`, `REQUIRES`, `VERIFIED_BY`).
* **Sandbox Tooling:**
  * Safe mathematical expression calculator.
  * SQLite memory search and retrieval tools.
  * Web search integration and research connector.
  * REST API simulation and workspace utilities.

---

### 💻 Frontend Workspace (React 19 + TypeScript + Vite + Stratify UI)
* **Stratify Cyber-Deck Design System:** Modern, dark/light theme tokens, glassmorphic UI, responsive layouts.
* **Interactive Chat Stream:**
  * Real-time progress stepper (Memory & Plan ➔ Parallel Agents ➔ Judge Review ➔ Memory Write).
  * Fast mode toggle (Simple vs. Complex).
  * Collapsible DAG trace inspector.
* **3D & 2D Knowledge Graph Visualizer:**
  * Force-directed 3D interactive knowledge graph rendering (`3d-force-graph`).
  * Node category color coding, zoom/rotate camera controls, and node inspector drawer.
* **Project & Skills Manager:**
  * Multi-project workspace switcher with isolated context state.
  * 24-skill capability selector organized across 6 categories.

---

### 🚀 System Engineering & Hardware Optimization
* Configured local offline LLM execution pipeline with Ollama.
* Optimized model deployment on **NVIDIA RTX 3050 (4GB VRAM)**:
  * Downloaded and integrated **`qwen2.5:3b`** (1.9GB) for ultra-fast GPU offloading.
  * Configured **`qwen2.5:7b`** (4.7GB) for advanced multi-agent reasoning tasks.
* Relocated model storage and download directory to secondary drive (`E:\ollama\models`) to resolve C: drive storage constraints.
* Created automated Windows startup launchers (`start_app.bat`, `start_mock.bat`).

---

## 3. Skills Ecosystem (24 Capabilities Across 6 Domains)

| Domain | Capabilities Included |
| :--- | :--- |
| **1. Core Utilities** | Calculation, String Operations, File System Sandbox, System Shell |
| **2. Knowledge & Memory** | Graphify RAG, SQLite Memory, Concept Linking, Failure Extraction |
| **3. Web Research** | Search Querying, Content Extraction, Fact Checking, Competitive Benchmarking |
| **4. Verification & Quality** | Code Linting, Unit Test Runner, Reviewer Security Audit |
| **5. Architecture & Synthesis** | DAG Planner, Multi-Agent Ensemble, Documentation Generation |
| **6. Analysis & Integration** | Data Analysis & Charting, REST API Client, Git Version Control |

---

## 4. How to Run

### Option 1: Automatic Batch Script
```cmd
start_app.bat
```

### Option 2: Manual Start
**Backend:**
```powershell
cd backend
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**Frontend:**
```powershell
cd frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

* **Web UI:** [http://127.0.0.1:5173](http://127.0.0.1:5173)
* **Backend Health:** [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)
* **Interactive API Docs:** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
