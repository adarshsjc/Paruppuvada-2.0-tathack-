import os
from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_ROOT_DIR = os.path.dirname(_BACKEND_DIR)
_BACKEND_ENV = os.path.join(_BACKEND_DIR, ".env")
_ROOT_ENV = os.path.join(_ROOT_DIR, ".env")


class Settings(BaseSettings):
    # Set to False so real Ollama Qwen2.5:3B is used by default
    use_mock_llm: bool = False

    # Provider selector: 'ollama', 'openrouter', 'gemini'
    llm_provider: str = "ollama"

    # Ollama (local) Integration — single model reused sequentially for all roles.
    ollama_base_url: str = "http://localhost:11434/v1"
    ollama_model: str = "qwen2.5:3b"

    # OpenRouter API Integration
    openrouter_api_key: str = ""
    openrouter_model: str = "openrouter/free"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_agent_models: str = "openrouter/free,openrouter/free,openrouter/free"

    # Gemini Direct API
    gemini_api_key: str = ""
    gemini_model: str = "gemini-1.5-flash"

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

    model_config = SettingsConfigDict(
        env_file=(_BACKEND_ENV, _ROOT_ENV, ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()

