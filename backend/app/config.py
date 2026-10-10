from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    use_mock_llm: bool = True

    # Provider selector: 'ollama', 'openrouter', 'gemini'
    # When use_mock_llm=True this is ignored and MockLLM is used.
    llm_provider: str = "ollama"

    # Ollama (local) Integration — single model reused sequentially for all roles.
    #
    # MODEL SLOT — OWNER-SELECTED, NOT INTEGRATED YET BY DESIGN.
    # The owner installs and selects the model; switching is ONE line in backend/.env:
    #     OLLAMA_MODEL=qwen2.5:3b      (brief default)
    #     OLLAMA_MODEL=qwen2.5:7b      (closest existing 2.5 size to a "9B")
    #     OLLAMA_MODEL=<your-9b-tag>   (e.g. qwen3.5:9b — any tag you `ollama pull`ed)
    # Note: `qwen2.5:9b` does NOT exist in the Ollama registry (verified 404; Qwen2.5
    # ships 0.5b/1.5b/3b/7b/14b/32b/72b). Run `python check_ollama.py` after install —
    # it verifies the server, the model tag, and one live completion.
    # Until then the system runs fully in Mock mode (use_mock_llm=True default).
    ollama_base_url: str = "http://localhost:11434/v1"
    ollama_model: str = "qwen2.5:3b"

    # OpenRouter API Integration
    openrouter_api_key: str = ""
    openrouter_model: str = "openrouter/free"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_agent_models: str = "openrouter/free,openrouter/free,openrouter/free"

    web_search_enabled: bool = True
    web_search_max_results: int = 5

    # --- Memory graph / execution system ---
    memory_db_path: str = "memory.db"

    # Sandbox for file tools (read_csv/write_json/...). Absolute escape is blocked.
    workspace_dir: str = "workspace"

    # Execution bounds
    max_retries_per_step: int = 2
    retry_backoff_seconds: float = 0.2
    max_workflow_steps: int = 24
    context_budget_chars: int = 6000

    # RAG embeddings: 'none' (deterministic keyword retrieval, honestly labeled) or 'ollama'
    embedding_provider: str = "none"
    ollama_embed_model: str = "nomic-embed-text"

    # Optional MiroFish simulation adapter (disabled by default)
    mirofish_enabled: bool = False
    mirofish_base_url: str = "http://127.0.0.1:5000"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
