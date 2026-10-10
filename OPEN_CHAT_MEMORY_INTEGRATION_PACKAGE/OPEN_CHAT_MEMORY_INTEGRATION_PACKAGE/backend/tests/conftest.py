import os
import pytest
from app.config import settings

@pytest.fixture(autouse=True)
def force_mock_mode(monkeypatch):
    """Ensure all automated tests explicitly use mock mode without external calls."""
    monkeypatch.setenv("USE_MOCK_LLM", "True")
    monkeypatch.setattr(settings, "use_mock_llm", True)
    yield
