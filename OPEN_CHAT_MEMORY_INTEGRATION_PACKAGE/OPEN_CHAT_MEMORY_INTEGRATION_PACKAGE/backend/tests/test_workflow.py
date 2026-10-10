import os
from unittest.mock import patch
from app.agents.orchestrator import run_workflow
from app.tools.registry import TOOLS
from app.config import settings

def test_workflow_mock_execution():
    with patch('app.config.settings.use_mock_llm', True):
        state = run_workflow("test request")
        assert state.task_id is not None
        assert state.plan is not None
        assert state.status == "completed"
        assert "Mock output" in state.plan.steps[0].expected_output
        assert len(state.execution_steps) > 0
        assert state.review.approved is True

def test_calculator_tool():
    result = TOOLS['calculator'](expression="5 + 10 * 2")
    assert result == "25"
    
    try:
        TOOLS['calculator'](expression="import os")
        assert False, "Should raise exception for invalid chars"
    except Exception as e:
        assert "Invalid characters" in str(e)

def test_notes_tool():
    res1 = TOOLS['save_memory'](content="secret msg", is_global=False, tags=[], project_id="123")
    assert "saved" in res1
    res2 = TOOLS['search_memory'](query="secret", project_id="123")
    assert "secret msg" in res2
