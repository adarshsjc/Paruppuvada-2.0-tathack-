import json
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.agents.ensemble import _agent_models
from app.main import app

client = TestClient(app)


def test_task_stream_emits_progress_events_and_final_state():
    with (
        patch("app.config.settings.use_mock_llm", True),
        patch("app.config.settings.web_search_enabled", False),
    ):
        with client.stream(
            "POST", "/api/v1/tasks/stream", json={"description": "test stream task"}
        ) as response:
            assert response.status_code == 200
            body = "".join(response.iter_text())

    events = [
        json.loads(line[6:])
        for line in body.splitlines()
        if line.startswith("data: ")
    ]
    assert events, "expected at least one SSE event"
    assert events[0]["event"] == "stage"
    # Progress events should announce agents plus the final result.
    kinds = [event["event"] for event in events]
    assert "agent_start" in kinds
    assert "selected" in kinds
    assert "done" in kinds

    done = [event for event in events if event["event"] == "done"][-1]
    assert done["state"]["status"] == "completed"
    assert "[MOCK]" in done["state"]["final_result"]


def test_task_stream_empty_description_rejected():
    response = client.post("/api/v1/tasks/stream", json={"description": "   "})
    assert response.status_code == 400


def test_agent_count_configurable():
    class FakeLLM:
        provider_name = "ollama"
        model = "qwen2.5:7b"

    with patch("app.agents.ensemble.settings.agent_count", 1):
        models = _agent_models(FakeLLM())
    assert len(models) == 1
