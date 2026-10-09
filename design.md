# Autonomous AI Agent Platform - Interface Design System & UX Blueprint (`design.md`)

> **Version:** 2.0  
> **Target:** Frontend UI/UX Overhaul & Modernization  
> **Tech Stack:** React 19, TypeScript, Vite, Modern Vanilla CSS (Tokens, Grid, Glassmorphism, CSS Variables)

---

## 1. Executive Design Vision

The Autonomous AI Agent interface should feel like a **Mission Control Cyber-Deck**: state-of-the-art, hyper-responsive, and visually stunning. It bridges the gap between deep technical transparency (inspecting multi-agent thoughts, execution loops, and database mutations) and effortless user experience.

### Core Design Pillars
1. **Instant Perceived Performance:** Multi-agent workflows make multiple sequential LLM calls. The UI must eliminate perceived waiting times through dynamic multi-stage progress steppers, skeleton pulses, and real-time state visualizers.
2. **Obsidian Glassmorphism:** Deep dark canvas (`#090d16` / `#0f172a`), translucent glass panels with `backdrop-filter: blur(16px)`, radial ambient glow accents, and subtle borders (`rgba(255, 255, 255, 0.08)`).
3. **Structured Visual Hierarchy:** Clear separation between **Chat / Mission Input** (left) and **Real-Time Execution Trace DAG / Inspector** (right), with collapsible sidebars and context headers.
4. **Zero-Dependency Modern CSS:** High-performance, native CSS variables and animations without heavy CSS frameworks, ensuring instant load times and pixel-perfect responsiveness.

---

## 2. Design System & CSS Tokens Specification

Below is the design token blueprint to be defined in `frontend/src/index.css`:

```css
:root {
  /* Canvas & Surfaces */
  --bg-canvas: #090d16;
  --bg-surface: #0f172a;
  --bg-surface-elevated: #1e293b;
  --bg-glass: rgba(15, 23, 42, 0.72);
  --bg-glass-card: rgba(30, 41, 59, 0.55);
  --bg-glass-input: rgba(15, 23, 42, 0.6);

  /* Borders & Dividers */
  --border-subtle: rgba(255, 255, 255, 0.07);
  --border-medium: rgba(255, 255, 255, 0.12);
  --border-accent: rgba(6, 182, 212, 0.35);

  /* Primary Brand & Accents */
  --accent-cyan: #06b6d4;
  --accent-cyan-glow: rgba(6, 182, 212, 0.25);
  --accent-indigo: #6366f1;
  --accent-gradient: linear-gradient(135deg, #06b6d4 0%, #6366f1 100%);
  --accent-gradient-hover: linear-gradient(135deg, #22d3ee 0%, #818cf8 100%);

  /* Semantic Status Colors */
  --status-success: #10b981;
  --status-success-bg: rgba(16, 185, 129, 0.12);
  --status-success-border: rgba(16, 185, 129, 0.3);

  --status-warning: #f59e0b;
  --status-warning-bg: rgba(245, 158, 11, 0.12);
  --status-warning-border: rgba(245, 158, 11, 0.3);

  --status-error: #ef4444;
  --status-error-bg: rgba(239, 68, 68, 0.12);
  --status-error-border: rgba(239, 68, 68, 0.3);

  --status-info: #3b82f6;
  --status-info-bg: rgba(59, 130, 246, 0.12);

  /* Typography Colors */
  --text-primary: #f8fafc;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;
  --text-code: #38bdf8;

  /* Typography Scale */
  --font-family-ui: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-family-mono: 'JetBrains Mono', 'Fira Code', Consolas, monospace;

  /* Elevation & Shadows */
  --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.25);
  --shadow-md: 0 8px 24px rgba(0, 0, 0, 0.35);
  --shadow-lg: 0 16px 40px rgba(0, 0, 0, 0.5);
  --shadow-glow: 0 0 20px var(--accent-cyan-glow);

  /* Radii */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --radius-full: 9999px;

  /* Transitions */
  --transition-fast: 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  --transition-normal: 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
```

---

## 3. UI Layout Architecture & Wireframe

```
+-----------------------------------------------------------------------------------------+
| [LOGO] Antigravity AI  |  Project: [ Alpha Proj v ]  | [⚡ openrouter/free | 1.2s ] [Settings]|
+-----------------------------------------------------------------------------------------+
| [NAV SIDEBAR] |                        MAIN WORKSPACE (SPLIT 50/50)                     |
|               |                                                                         |
| 💬 Workspace  | +-----------------------------------+ +--------------------------------+ |
| 📁 Projects   | | 🤖 MISSION CONTROL (Chat)         | | ⚡ EXECUTION TRACE & DAG       | |
| 🧠 Memory     | |-----------------------------------| |--------------------------------| |
| 📜 History    | | [User Msg]: Calculate 347 * 829   | | [● PLANNER] Step 1 of 1        | |
| ⚙️ Settings   | |                                   | | ├─ Goal: Compute product       | |
|               | | [Agent]: [ ⏳ Processing... ]     | | └─ Expected: 287663            | |
|               | |   ┌─ Multi-Stage Stepper ──────┐  | |                                | |
|               | |   │ ✓ Plan  » ⚙️ Calc  » 🔍 Rev│  | | [● EXECUTOR] Action 1          | |
|               | |   └────────────────────────────┘  | | ├─ Tool: calculator            | |
|               | |                                   | | ├─ Input: {"expr": "347*829"}  | |
|               | | [Final Result Bubble]:            | | └─ Result: 287663 [COPY]       | |
|               | | "The product of 347 * 829 is      | |                                | |
|               | |  287,663..."                      | | [● REVIEWER] Approved (100%)   | |
|               | |-----------------------------------| | └─ Verification: Verified math | |
|               | | [ > Prompt Input Area...    [SEND]| +--------------------------------+ |
|               | +-----------------------------------+                                    |
+-----------------------------------------------------------------------------------------+
```

---

## 4. Key UI Components & Redesign Blueprint

### 4.1. Real-Time Multi-Stage Agent Stepper (`AgentProgressStepper.tsx`)
**Problem:** Sequential LLM calls create a 20–40s quiet period where users wonder if the app is stuck.  
**Solution:** Visual progress stepper animating through the state machine:
```
[ 1. Planning ⏱️ ] ───> [ 2. Tool Execution ⚙️ ] ───> [ 3. Reviewer Verification 🔍 ] ───> [ 4. Memory Persistence 💾 ]
```
- **Active Step Pulse:** Glow pulse on the currently executing agent role.
- **Estimated Duration / Elapsed Counter:** Micro-timer showing `Elapsed: 4.2s`.
- **Model Tag Badge:** Displays the underlying model assigned by OpenRouter (`poolside/laguna-xs-2.1:free`, etc.).

### 4.2. Enhanced Chat Workspace (`ChatWorkspace.tsx`)
- **Interactive Quick-Action Pills:** Preset buttons for rapid testing:
  - `⚡ Calculate 347 * 829`
  - `📝 Save Project Note`
  - `🔍 Search Architecture Memory`
- **Markdown & Code Highlighting:** Automatic formatting for lists, math equations, code snippets, and bold text.
- **Copy-to-Clipboard Actions:** One-click copy icon for answers and calculation results.
- **Agent Avatar & Latency Tag:** Shows the exact time taken for each completed run (`Completed in 14.8s`).

### 4.3. Interactive Execution Trace Inspector (`ExecutionInspector.tsx`)
- **Collapsible Step Cards:** Accordion-style cards for each iteration with status icons:
  - `Planner Step`: Goal & Expected Output card.
  - `Executor Action`: Thought bubble + Tool tag (`calculator`, `save_memory`, `search_memory`).
  - `Tool Result Payload`: Syntax-highlighted output with copy button.
  - `Reviewer Verdict`: Green/Red badge with feedback explanation.
- **Raw JSON Drawer:** Toggle button to inspect the full raw `TaskState` payload for debugging.

### 4.4. Memory Vault & Graph Explorer (`MemoryExplorer.tsx`)
- **Card Grid Layout:** Categorized cards by `[Global]`, `[Project]`, and `[Session]`.
- **Live Search with Debounce:** Instant search filtering as you type.
- **Interactive Tag Cloud:** Clickable tag pills to filter notes by `#math`, `#architecture`, `#notes`.
- **"Add Knowledge" Modal:** Floating glass modal to create new persistent memories without running a chat task.

### 4.5. Latency & Model Settings Hub (`Settings.tsx`)
- **Interactive Model Selector:** Quick-switch between:
  1. `openrouter/free` (Dynamic free router)
  2. `meta-llama/llama-3.3-70b-instruct:free` (Fast 70B reasoning)
  3. `google/gemini-2.0-flash-exp:free` (Ultra-fast multimodal)
  4. `gemini-3.8-flash` (Direct Google API, <1s response time)
  5. `Mock Mode` (Zero-latency offline simulation)
- **Live Latency Ping Test:** Button to test API connection time and measure roundtrip ping.

---

## 5. Micro-Animations & CSS Keyframes

```css
/* Ambient Shimmer for Loading States */
@keyframes shimmerPulse {
  0% { opacity: 0.6; transform: scale(0.99); }
  50% { opacity: 1; transform: scale(1); box-shadow: 0 0 25px var(--accent-cyan-glow); }
  100% { opacity: 0.6; transform: scale(0.99); }
}

/* Slide and Fade-In for New Messages and Cards */
@keyframes cardEntrance {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* Glowing Border Sweep */
@keyframes borderGlowSweep {
  0% { border-color: rgba(6, 182, 212, 0.2); }
  50% { border-color: rgba(99, 102, 241, 0.6); }
  100% { border-color: rgba(6, 182, 212, 0.2); }
}

.step-active {
  animation: shimmerPulse 2s infinite ease-in-out;
  border-color: var(--accent-cyan) !important;
}

.task-card {
  animation: cardEntrance 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
```

---

## 6. Implementation Stages & Action Plan

| Stage | Focus Area | Deliverables |
| :--- | :--- | :--- |
| **Stage 1** | **Design Token Foundation** | Update `index.css` with CSS variables, typography imports, scrollbar stylings, and glass utility classes. |
| **Stage 2** | **Navigation & Header Bar** | Implement top navigation bar with active project pill, latency status, and model selector dropdown. |
| **Stage 3** | **Mission Control Chat** | Upgrade `ChatWorkspace.tsx` with multi-stage progress stepper, preset query pills, and markdown formatting. |
| **Stage 4** | **Execution Trace DAG** | Build collapsible trace cards, tool payload inspector, and reviewer scorecard. |
| **Stage 5** | **Memory Vault Overhaul** | Redesign `MemoryExplorer.tsx` with card grid, tag filters, and knowledge creation modal. |
| **Stage 6** | **Settings & Latency Hub** | Build model switcher and live latency tester in `Settings.tsx`. |

---

## 7. How to Use this Document
Whenever preparing a UI/UX update or asking an AI assistant to enhance the visual design:
1. Refer to the tokens in **Section 2** for color and spacing consistency.
2. Follow the component specifications in **Section 4**.
3. Use the implementation stages in **Section 6** for incremental, bug-free rollouts.
