import pytest
import uuid
import os
from fastapi.testclient import TestClient
from app.main import app
from app.agents.orchestrator import run_workflow, MAX_ITERATIONS
from app.tools.registry import execute_tool, TOOLS, ToolException
from app.memory.sqlite import SQLiteMemoryProvider, get_memory_provider
from app.memory.base import MemoryItem

client = TestClient(app)

# ==============================================================================
# Scenario A: Basic API Functionality in Mock Mode
# ==============================================================================
def test_api_health():
    """Verify /health endpoint returns 200 and healthy status."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "provider" in data
    assert "model" in data

def test_api_task_submission_structure():
    """Verify task submission produces the expected API response structure."""
    response = client.post("/api/v1/tasks", json={"description": "Test basic task in mock mode"})
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "result" in data
    assert "details" in data
    assert data["status"] in ["completed", "failed"]
    assert "task_id" in data["details"]
    assert "execution_steps" in data["details"]
    assert "plan" in data["details"]

def test_api_invalid_request_handling():
    """Verify 400 for empty task description and 422 for malformed body."""
    # Empty string
    res_empty = client.post("/api/v1/tasks", json={"description": "   "})
    assert res_empty.status_code == 400
    assert "empty" in res_empty.json()["detail"].lower()

    # Missing required field
    res_malformed = client.post("/api/v1/tasks", json={})
    assert res_malformed.status_code == 422

# ==============================================================================
# Scenario B: Planner in Mock Mode
# ==============================================================================
def test_planner_structured_output():
    """Verify Planner returns structured output adhering to schema with usable steps."""
    state = run_workflow("Research project requirements and draft specification")
    assert state.plan is not None
    assert len(state.plan.steps) > 0
    step = state.plan.steps[0]
    assert step.id == 1
    assert len(step.goal) > 0
    assert len(step.expected_output) > 0
    assert "Research project requirements" in step.goal

# ==============================================================================
# Scenario C: Executor & Actual Tool Execution
# ==============================================================================
def test_calculator_execution_347_times_829():
    """Verify calculator tool executes and returns 287663, and Executor uses actual result."""
    task = "Calculate 347 multiplied by 829 using the calculator tool."
    state = run_workflow(task)
    
    # 1. State completed
    assert state.status == "completed"
    
    # 2. Actual tool execution in execution_steps
    calc_steps = [s for s in state.execution_steps if s.get("action", {}).get("tool") == "calculator"]
    assert len(calc_steps) == 1, "Calculator should execute exactly once"
    assert calc_steps[0]["tool_result"] == "287663"
    
    # 3. Final answer incorporates the actual tool result
    assert "287663" in state.final_result
    
    # 4. Reviewer verified and approved
    assert state.review is not None
    assert state.review.approved is True

def test_tool_invalid_arguments():
    """Verify handling of invalid tool arguments."""
    # Calculator missing required expression
    res = execute_tool("calculator", {"invalid_arg": 123})
    assert "Error" in res or "missing" in res

def test_tool_unknown_name():
    """Verify handling of unknown tool names."""
    res = execute_tool("non_existent_tool_123", {"foo": "bar"})
    assert "Error: Tool 'non_existent_tool_123' not found." in res

def test_tool_security_sandbox():
    """Verify shell execution and arbitrary Python execution are blocked."""
    # Disallowed characters/identifiers
    with pytest.raises(ToolException) as exc_info:
        TOOLS["calculator"](expression="__import__('os').system('dir')")
    assert "Invalid characters" in str(exc_info.value)

    with pytest.raises(ToolException) as exc_info:
        TOOLS["calculator"](expression="open('/etc/passwd').read()")
    assert "Invalid characters" in str(exc_info.value)

# ==============================================================================
# Scenario D: Reviewer & Iteration Limits
# ==============================================================================
def test_reviewer_evaluation_honesty():
    """Verify Reviewer rejects incomplete or requested-reject tasks."""
    state = run_workflow("Task that must fail: mock_reject")
    # Reviewer rejected and loop reached iteration limit
    assert state.status == "failed"
    assert state.iterations == MAX_ITERATIONS
    assert state.final_result == "Max iterations reached without a successful review."

# ==============================================================================
# Scenario E: Persistent Memory & Project Isolation
# ==============================================================================
def test_persistent_memory_and_isolation():
    """Verify memory saving, retrieval, project isolation, and persistence across restart."""
    db_file = f"test_persist_{uuid.uuid4().hex}.db"
    try:
        # Backend Session 1: Save notes into two different projects
        prov1 = SQLiteMemoryProvider(db_file)
        p_alpha = prov1.create_project("Project Alpha")
        p_beta = prov1.create_project("Project Beta")

        prov1.add_memory(MemoryItem(
            project_id=p_alpha.id,
            type="project",
            content="Alpha private secret architecture",
            source="test",
            tags=["arch"]
        ))
        prov1.add_memory(MemoryItem(
            project_id=p_beta.id,
            type="project",
            content="Beta public roadmap",
            source="test",
            tags=["roadmap"]
        ))
        prov1.add_memory(MemoryItem(
            project_id=None,
            type="global",
            content="Global shared guidelines",
            source="test",
            tags=["global"]
        ))

        # Backend Session 2 (simulating restart with new provider instance on same db file):
        prov2 = SQLiteMemoryProvider(db_file)
        
        # Check Project Alpha memory
        alpha_memories = prov2.search_memory("architecture", project_id=p_alpha.id)
        assert any("Alpha private secret" in m.content for m in alpha_memories)

        # Check Project Isolation: Beta memory must NOT appear in Alpha context
        all_alpha_memories = prov2.search_memory("", project_id=p_alpha.id)
        assert not any("Beta public roadmap" in m.content for m in all_alpha_memories)
        # Global memory should appear
        assert any("Global shared guidelines" in m.content for m in all_alpha_memories)

        # Check Project Beta memory
        beta_memories = prov2.search_memory("roadmap", project_id=p_beta.id)
        assert any("Beta public roadmap" in m.content for m in beta_memories)
        assert not any("Alpha private secret" in m.content for m in beta_memories)

    finally:
        # Cleanup test db file safely
        if os.path.exists(db_file):
            try:
                os.remove(db_file)
            except Exception:
                pass

# ==============================================================================
# Scenario F: Workflow Result Completeness
# ==============================================================================
def test_workflow_result_completeness():
    """Verify successful workflow includes stages, tools, result, and review."""
    state = run_workflow("Save project note: verified autonomous agent baseline")
    assert state.task_id is not None
    assert state.plan is not None
    assert state.status == "completed"
    assert len(state.execution_steps) > 0
    assert state.final_result is not None
    assert state.review is not None
    assert state.review.approved is True
