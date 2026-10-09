from unittest.mock import MagicMock, patch

import pytest
import requests

from app.agents.ensemble import _agent_models
from app.agents.llm import OllamaLLM, get_llm
from app.models.schemas import Plan


def test_get_llm_returns_ollama_provider_when_configured():
    with (
        patch("app.config.settings.use_mock_llm", False),
        patch("app.config.settings.llm_provider", "ollama"),
    ):
        llm = get_llm()
    assert isinstance(llm, OllamaLLM)
    assert llm.provider_name == "ollama"
    assert llm.model == "qwen2.5:7b"


def test_get_llm_falls_back_to_openrouter_by_default():
    with (
        patch("app.config.settings.use_mock_llm", False),
        patch("app.config.settings.llm_provider", "openrouter"),
        patch("app.config.settings.openrouter_api_key", "test-key"),
    ):
        llm = get_llm()
    assert isinstance(llm, object)
    assert llm.provider_name == "openrouter"


def test_agent_models_for_ollama():
    class FakeLLM:
        provider_name = "ollama"
        model = "qwen2.5:7b"

    with (
        patch(
            "app.agents.ensemble.settings.ollama_agent_models",
            "qwen2.5:7b,qwen2.5:7b,qwen2.5:7b",
        ),
        patch("app.agents.ensemble.settings.agent_count", 3),
    ):
        models = _agent_models(FakeLLM())
    assert models == ["qwen2.5:7b", "qwen2.5:7b", "qwen2.5:7b"]


def test_ollama_chat_payload_and_response():
    llm = OllamaLLM()
    fake_response = MagicMock(status_code=200)
    fake_response.json.return_value = {
        "model": "qwen2.5:7b",
        "message": {"content": "hello from qwen"},
    }

    with patch("requests.post", return_value=fake_response) as mock_post:
        result = llm.generate_text("Say hi")

    assert result == "hello from qwen"
    args, kwargs = mock_post.call_args
    assert args[0] == "http://127.0.0.1:11434/api/chat"
    assert kwargs["json"]["model"] == "qwen2.5:7b"
    assert kwargs["json"]["options"]["num_ctx"] == 8192
    assert kwargs["json"]["stream"] is False
    assert kwargs["json"]["messages"][0]["role"] == "user"
    assert kwargs["json"]["messages"][0]["content"] == "Say hi"


def test_ollama_generate_json_uses_format_and_validates_schema():
    llm = OllamaLLM()
    fake_response = MagicMock(status_code=200)
    fake_response.json.return_value = {
        "model": "qwen2.5:7b",
        "message": {"content": '```json\n{"steps": [{"id": 1, "goal": "g", "expected_output": "o"}]}\n```'},
    }

    with patch("requests.post", return_value=fake_response) as mock_post:
        plan = llm.generate_json("Create a one-step plan.", Plan)

    assert plan.steps[0].goal == "g"
    _, kwargs = mock_post.call_args
    assert kwargs["json"]["format"] == "json"


def test_ollama_generate_json_retries_without_format_on_invalid_response():
    llm = OllamaLLM()
    invalid = MagicMock(status_code=200)
    invalid.json.return_value = {
        "model": "qwen2.5:7b",
        "message": {"content": "Sorry, I cannot produce valid JSON."},
    }
    valid = MagicMock(status_code=200)
    valid.json.return_value = {
        "model": "qwen2.5:7b",
        "message": {"content": '{"steps": []}'},
    }

    with patch("requests.post", side_effect=[invalid, valid]) as mock_post:
        plan = llm.generate_json("Create a plan.", Plan)

    assert plan.steps == []
    assert mock_post.call_count == 2
    # First attempt asked for format=json, second retry did not.
    assert mock_post.call_args_list[0].kwargs["json"].get("format") == "json"
    assert "format" not in mock_post.call_args_list[1].kwargs["json"]


def test_ollama_connection_failure_has_actionable_message():
    llm = OllamaLLM()
    with patch("requests.post", side_effect=requests.ConnectionError("refused")):
        with pytest.raises(RuntimeError, match="ollama serve"):
            llm.generate_text("hi")


def test_ollama_missing_model_is_reported():
    llm = OllamaLLM()
    fake_response = MagicMock(status_code=404)
    fake_response.text = '{"error":"model \\"qwen2.5:7b\\" not found"}'
    with patch("requests.post", return_value=fake_response):
        with pytest.raises(RuntimeError, match="ollama pull"):
            llm.generate_text("hi")
