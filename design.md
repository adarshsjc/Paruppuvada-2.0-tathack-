# Autonomous AI Agent Platform - Interface Design System & UX Blueprint (`design.md`)

> **Version:** 3.0  
> **Brand & Design Language:** Stratify Clean Workspace & Mission Control  
> **Tech Stack:** React 19, TypeScript, Vite, Modern Vanilla CSS (Stratify Tokens, Flex/Grid, Glass Panels, CSS Variables)  
> **Primary Provider:** Local Ollama (`qwen2.5:3b`)

---

## 1. Executive Design Vision

Open Chat is designed around the **Stratify** visual design system: modern, airy, hyper-functional, and aesthetically pristine. It balances immediate chat responsiveness with deep technical observability into multi-agent decision making, memory nodes, and execution graphs.

### Core Design Pillars
1. **Dual Chat Response Dynamics:**
   - **Simple Mode:** Instant terminal-style responses (~1–2s) powered directly by local Ollama `qwen2.5:3b` without memory search or multi-agent delays.
   - **Complex Mode:** Multi-agent ensemble deliberation (Planner -> 3 Parallel Solvers -> Judge -> Reviewer -> Memory RAG & Reflection) with real-time DAG trace updates.
2. **Stratify Light Canvas Aesthetics:** Clean `#f8fafc` canvas, bright white cards (`#ffffff`), soft floating drop shadows (`0 4px 20px rgba(0, 0, 0, 0.05)`), rounded pill badges, and vibrant cobalt blue accents (`#2563eb`).
3. **Interactive Skill Capabilities Orchestration:** Projects can be configured with modular skills selected from a rich 24-skill library. The interface provides real-time skill category filtering, quick search, selection counters, and an **Active Configured Skills Ribbon** in the chat workspace.
4. **Living 3D Force-Directed Skill & Memory Graph:** Immersive 3D visualization mapping skills, workflows, tools, and memory extractions as interconnected celestial nodes with category-coded colors and real-time inspection.
5. **Zero-Dependency Native CSS:** Ultra-fast rendering using native CSS variables and animations, eliminating bulky CSS frameworks for instant load times and pixel-perfect layouts.

---

## 2. Design System & CSS Tokens Specification

The core design tokens powering Open Chat:

```css
:root {
  /* Canvas & Surface Colors */
  --bg-app: #f4f6fa;
  --bg-surface: #ffffff;
  --bg-surface-subtle: #f8fafc;
  --bg-surface-elevated: #ffffff;
  --bg-glass-card: rgba(255, 255, 255, 0.85);

  /* Borders & Dividers */
  --border-subtle: #e2e8f0;
  --border-medium: #cbd5e1;
  --border-accent: rgba(37, 99, 235, 0.35);

  /* Primary Brand & Gradients */
  --color-primary: #2563eb;
  --color-primary-hover: #1d4ed8;
  --color-primary-light: #eff6ff;
  --gradient-primary: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  --gradient-accent: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);

  /* Skill & Status Semantics */
  --status-success: #10b981;
  --status-success-bg: #ecfdf5;
  --status-success-border: #a7f3d0;

  --status-warning: #f59e0b;
  --status-warning-bg: #fffbeb;
  --status-warning-border: #fde68a;

  --status-error: #ef4444;
  --status-error-bg: #fef2f2;
  --status-error-border: #fecaca;

  --status-simple: #f59e0b;
  --status-complex: #8b5cf6;

  /* Typography Scale & Palette */
  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-muted: #94a3b8;
  --text-code: #0284c7;

  --font-family-ui: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', sans-serif;
  --font-family-mono: 'JetBrains Mono', 'Fira Code', Consolas, monospace;

  /* Shadows & Elevation */
  --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-sm: 0 2px 6px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 6px 16px rgba(0, 0, 0, 0.07);
  --shadow-lg: 0 12px 28px rgba(0, 0, 0, 0.09);
  --shadow-primary-glow: 0 4px 14px rgba(37, 99, 235, 0.25);

  /* Border Radii */
  --radius-xs: 4px;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 18px;
  --radius-xl: 24px;
  --radius-full: 9999px;
}
```

---

## 3. UI Layout Architecture & Wireframe

```
+------------------------------------------------------------------------------------------------------------------------+
| [⚡ Open Chat AI] |  DESK APP  [OPEN CHAT]  ● AUTONOMOUS  |  PROJECT: [ FinTech Analytics ]  |  PROVIDER: OLLAMA LOCAL (qwen2.5:3b) |
+------------------------------------------------------------------------------------------------------------------------+
| [NAV SIDEBAR]    |                                   MAIN WORKSPACE AREA (SPLIT LAYOUT)                                |
|                  |                                                                                                     |
| 👤 Sam Smith     | +---------------------------------------------------+ +---------------------------------------------+ |
|   UX Lead        | | 💬 OPEN CHAT WORKSPACE                            | | ⚡ EXECUTION TRACE & DAG                    | |
|   ● FinTech Act. | | Context: Project 1bdd2cfd...                      | |---------------------------------------------| |
|                  | | [Mode: Simple ⚡ | Complex 🧠]  [🌿 2 Skills]     | | [● AUTONOMOUS PLANNER]                      | |
| 🪟 Dashboard     | |---------------------------------------------------| | Goal: Compute financial metrics             | |
| 💬 Open Chat     | | 🌿 Configured Skills (2): [data-analysis] [api]   | |                                             | |
| 📁 Projects      | |---------------------------------------------------| | [● AGENT 1 · DIRECT SOLVER] [SELECTED]      | |
| 🧠 Memory Vault  | | [User Msg]: Analyze financial metrics using API   | | Model: qwen2.5:3b                           | |
| 📜 Audit Log     | |                                                   | | 1. Use REST API Client skill to query...    | |
| 🌐 3D Skill Graph| | [Open Chat] 🧠 Complex                     08:48  | | 2. Use Data Analysis skill to compute...    | |
|                  | | Solution generated using 2 configured skills...   | |                                             | |
| ● API Online     | | [ID: 5a962214... Inspect Trace DAG]               | | [● AGENT 2 · CRITICAL THINKER]              | |
|   Ollama 3 agents| |---------------------------------------------------| | Validates security and schema compliance    | |
|                  | | [⚡ 25 * 4]  [🧠 Save Note]  [🔍 Search Memory]   | |                                             | |
| ⚙️ Settings      | | [Mode: ⚡ Simple (Fast) | 🧠 Complex (Agent)]      | | [● VERIFICATION & REVIEW]                   | |
|                  | | [ Ask Open Chat...                        [SEND] ]| | Score: 0.94 Approved                        | |
|                  | +---------------------------------------------------+ +---------------------------------------------+ |
+------------------------------------------------------------------------------------------------------------------------+
```

---

## 4. Key View Modules & Component Blueprints

### 4.1. Dual-Mode Chat Workspace (`ChatWorkspace.tsx`)
- **Mode Toggle Bar:**
  - `⚡ Simple (Fast Qwen 2.5)`: Direct terminal response bypassing memory and ensemble delays.
  - `🧠 Complex (Agent + Memory)`: Deep reasoning using SQLite memory RAG, 3-agent ensemble, and DAG execution.
- **Configured Skills Ribbon:**
  - Located directly below the chat header.
  - Displays tags for all attached skills (`data-analysis`, `api-client`, etc.) with a "Modify" quick-link.
- **Message Cards & Badges:**
  - Clear user message cards and AI assistant responses labeled with active mode tags (`⚡ Simple` or `🧠 Complex`).
  - Markdown code formatting with copy action.
  - "Inspect Trace DAG" link jumping directly to the execution trace.

### 4.2. Interactive Project & Skill Capabilities Selector (`ProjectSelector.tsx`)
- **Project Setup Header:** Input field for project naming and brief overview.
- **Skill Capabilities Selector:**
  - **Category Filter Pills:** `All Categories`, `Core Utilities`, `Knowledge & Memory`, `Web Research`, `Verification & Quality`, `Architecture & Synthesis`, `Analysis & Integration`.
  - **Live Search Input:** Debounced search filtering skills across name and description.
  - **Selection Counters:** Live counter showing selected skills count.
  - **Skill Cards Grid:**
    - Custom styled checkboxes with hover glow.
    - Skill title and category tag.
    - 2-line clamped capability description.
    - Allowed tool badges (e.g. `python-calc`, `curl`, `git`).
    - Prerequisite requirement tags.
- **Dual Action Bar:**
  - `Create Project Only`: Saves project without navigating away.
  - `Create & Launch Chat Workspace ➔`: Primary action creating the project, saving the selected skills to memory, and immediately opening the Chat Workspace with the new project active.

### 4.3. Knowledge Graph & Memory Central Hub (`MemoryWorkspace.tsx`)
- **Living Knowledge Hub:**
  - Renamed from "3D Skill Graph" to "Knowledge Graph" as the primary knowledge visualization.
  - Multi-dimensional stats banner displaying live counts: `73 Nodes · 125 Edges · 24 Skills · Projects · Memories`.
  - **"Grant Access to Chat" Toggle:**
    - Interactive switch button in header (`RESTRICTED / GRANTED`).
    - When enabled, sends `POST /api/v1/settings/graph-access` with `{ enabled: true }`.
    - Enables lightweight RAG injection into Simple Mode and signals graph grounding in chat.
  - Comprehensive overview loading roots and expanded branches across skills, categories, workflows, tools, and rules.

### 4.4. Skills-First Project Creation Flow (`SkillsTab.tsx`)
- **First-Class Entry Point:**
  - Browse and filter all 24 skills by categories or keywords.
  - **Quick Skill Presets Strip:** Instant 1-click presets for common workflows:
    - `📊 Data & Analytics`
    - `💻 Engineering & Code`
    - `🌐 Web & Research`
    - `🤖 Autonomous Orchestration`
  - **Integrated Project Creation Bar:**
    - Input for custom project name directly below selected skills.
    - `🚀 Create Project & Open Chat →` button initializes project with chosen skills and seamlessly transitions to the Project Chat Workspace.

### 4.5. Embedded Project Graph Panel in Chat Workspace (`ProjectGraphPanel.tsx`)
- **Dual Right-Panel Tab Switcher:**
  - `Trace & DAG`: Standard execution trace inspector for multi-agent loops and tool runs.
  - `Project Graph`: Live, interactive 3D WebGL knowledge graph scoped directly to the current project context.
- **Embedded Visual Features:**
  - Displays project root node, active skill nodes, connected tools, and execution run entities.
  - Active Skills chip strip at top allowing single-click camera focus on any skill node in 3D space.
  - Live pulse animation via SSE subscription whenever complex tasks complete.
  - Interactive click-to-inspect drawer showing node label, child counts, descriptions, and branch expansion controls.

### 4.6. Skill-Grounded Chat & Live Badging
- **Skill Usage Badges on AI Response Bubbles:**
  - Highlights active skills utilized in the query (`🔧 Used: [skill_name]`).
  - Displays `🌐 Knowledge Graph Grounded` when graph retrieval was included.
- **Context-Aware Dynamic Quick Prompts:**
  - When skills are configured, dynamically renders tailored quick action prompt chips based on active skills (e.g. data analysis, python coding, web research).

---

## 5. Micro-Animations & Interaction Polish

```css
/* Card Entrance Animation */
@keyframes cardEntrance {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.99);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* Pulse on Selected Skill Cards */
@keyframes skillSelectedPulse {
  0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
  70% { box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
  100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
}

/* Fast Simple Mode Glow */
@keyframes lightningPulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.05); }
  100% { transform: scale(1); }
}
```

---

## 6. Guidelines for Future UI Modifications

1. **Maintain Dual-Mode Clarity:** Always keep Simple and Complex modes clearly separated visually and logically.
2. **Preserve Stratify Design Hierarchy:** Use defined variables from `--bg-surface`, `--color-primary`, and `--border-subtle` rather than arbitrary inline hex values.
3. **Keep Interactive Elements Responsive:** Ensure all buttons, toggles, and cards feature distinct hover and active states.
4. **Strict TypeScript Imports:** Maintain `import type` syntax to satisfy strict build requirements.
