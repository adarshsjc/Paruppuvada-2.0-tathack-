from fastapi.testclient import TestClient
from unittest.mock import patch
import uuid
import sqlite3
import pytest

from app.main import app
from app.memory.sqlite import SQLiteMemoryProvider

client = TestClient(app)

@pytest.fixture(autouse=True)
def isolated_memory(monkeypatch):
    """Redirect all memory access to an in-memory DB so API tests never touch memory.db."""
    db_uri = f"file:apimem_{uuid.uuid4().hex}?mode=memory&cache=shared"
    # Hold a connection open for the whole test: SQLite destroys a shared-cache
    # in-memory DB as soon as the last connection to the cache closes/gets GC'd,
    # which would otherwise race with FastAPI's worker threads.
    keeper = sqlite3.connect(db_uri, uri=True)
    db = SQLiteMemoryProvider(db_uri)
    monkeypatch.setattr("app.api.endpoints.get_memory_provider", lambda: db)
    monkeypatch.setattr("app.agents.ensemble.get_memory_provider", lambda: db)
    monkeypatch.setattr("app.memory.sqlite.get_memory_provider", lambda: db)
    yield db
    keeper.close()

def test_health():
    with patch("app.config.settings.agent_count", 3):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"
        assert response.json()["agent_count"] == 3

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

def test_project_recycle_bin_api():
    response = client.post("/api/v1/projects", json={"name": "api-recycle"})
    assert response.status_code == 200
    project_id = response.json()["id"]

    # Soft delete -> moved to the recycle bin
    response = client.delete(f"/api/v1/projects/{project_id}")
    assert response.status_code == 200
    assert response.json()["status"] == "deleted"

    # Hidden from the active list, visible with include_deleted=true
    active = client.get("/api/v1/projects").json()
    assert not any(p["id"] == project_id for p in active)
    all_projects = client.get("/api/v1/projects?include_deleted=true").json()
    assert any(p["id"] == project_id and p["deleted"] for p in all_projects)

    # Restore -> back in the active list
    response = client.post(f"/api/v1/projects/{project_id}/restore")
    assert response.status_code == 200
    assert response.json()["status"] == "restored"
    assert any(p["id"] == project_id and not p["deleted"] for p in client.get("/api/v1/projects").json())

    # Purge -> permanently gone (not even in the recycle bin)
    response = client.delete(f"/api/v1/projects/{project_id}/permanent")
    assert response.status_code == 200
    assert response.json()["status"] == "purged"
    assert not any(p["id"] == project_id for p in client.get("/api/v1/projects?include_deleted=true").json())

    # Missing projects yield 404s
    assert client.delete("/api/v1/projects/missing-id").status_code == 404
    assert client.post("/api/v1/projects/missing-id/restore").status_code == 404
    assert client.delete("/api/v1/projects/missing-id/permanent").status_code == 404
