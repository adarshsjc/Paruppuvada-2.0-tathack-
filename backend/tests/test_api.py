from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["agent_count"] == 3

from unittest.mock import patch

def test_create_task_mock_mode():
    with patch('app.config.settings.use_mock_llm', True):
        response = client.post("/api/v1/tasks", json={"description": "Test task"})
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "completed"
        assert "[MOCK]" in data["result"]
        assert "details" in data
        assert "task_id" in data["details"]

def test_create_task_empty():
    response = client.post("/api/v1/tasks", json={"description": "   "})
    assert response.status_code == 400

def test_create_task_simple_mode():
    with patch('app.config.settings.use_mock_llm', True):
        response = client.post("/api/v1/tasks", json={"description": "What is 2+2?", "mode": "simple"})
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "completed"
        assert "[MOCK]" in data["result"]
        assert data["details"]["execution_steps"][0]["mode"] == "simple"

def test_create_task_complex_mode():
    with patch('app.config.settings.use_mock_llm', True):
        response = client.post("/api/v1/tasks", json={"description": "Calculate 347 * 829", "mode": "complex"})
        assert response.status_code == 200
        data = response.json()
        assert data["status"] in ["completed", "failed"]
        assert "details" in data
        assert "task_id" in data["details"]
