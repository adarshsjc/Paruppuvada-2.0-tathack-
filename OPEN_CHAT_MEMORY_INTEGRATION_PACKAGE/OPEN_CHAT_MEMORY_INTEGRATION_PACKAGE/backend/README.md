# Autonomous AI Agent - Backend

This backend implements a multi-agent orchestrated workflow using FastAPI.

## Real Workflow
The agent uses an Orchestrator-Worker pattern to solve tasks iteratively:
1. **Planner Agent**: Analyzes the request and outputs a structured JSON plan.
2. **Executor Agent**: Operates in a loop. It decides on tools to run (e.g. `calculator`, `save_note`, `search_notes`), reviews its context, and eventually formulates a final answer.
3. **Reviewer Agent**: Evaluates the Executor's final answer against the original request. If unsatisfactory, the Reviewer rejects it with feedback, sending the Executor back to work.

### Constraints & Security
- **Max Iterations**: Limited to 5 executions to prevent runaway loops.
- **Sandboxed Tools**: Tools are explicitly registered Python functions (e.g., safe math eval via a character whitelist). No direct shell execution.
- **Typed Schemas**: Agents adhere to strict JSON outputs via Pydantic model validation.

## Setup
1. Create a virtual environment: `python -m venv venv`
2. Activate it: `.\venv\Scripts\activate` (Windows)
3. Install dependencies: `pip install -r requirements.txt`
4. Copy `.env.example` to `.env` and configure it (Use `USE_MOCK_LLM=True` for offline testing).

## Running the API
Start the server:
```bash
uvicorn app.main:app --reload
```

Run tests:
```bash
pytest
```

## Terminal CLI Example
Run the CLI to test the workflow without a GUI (Mock LLM will automatically complete standard test paths):
```bash
python cli.py "Calculate 25 * 4 and save the result as a note."
```

Output example:
```text
[User Request] Calculate 25 * 4 and save the result as a note.

[Status] completed

[Final Result]
[MOCK] Task completed successfully.

[Plan]
  - Step 1: Mock goal

[Execution Trace]
  [1] Thought: Mock tool usage
      Tool call: save_note with {'title': 'mock', 'content': 'data'}
      Result: Note 'mock' saved.
  [2] Thought: Done
      Tool call: none with {}
      Result: None
  [Review] Approved: True. Feedback: Approved.
```

*Future plans include Graphify/Neo4j graph memory, vector RAG integrations, n8n webhook nodes, and a frontend GUI. These are not yet implemented.*
