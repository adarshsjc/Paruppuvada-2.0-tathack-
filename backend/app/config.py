from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    use_mock_llm: bool = True

    # LLM Provider selection (used when USE_MOCK_LLM=False):
    #   "openrouter" -> cloud free/open models via OpenRouter (requires API key)
    #   "ollama"     -> fully local models served by Ollama (no API key needed)
    llm_provider: str = "openrouter"

    # OpenRouter API Integration
    openrouter_api_key: str = ""
    openrouter_model: str = "openrouter/free"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_agent_models: str = "openrouter/free,openrouter/free,openrouter/free"

    # Ollama Local LLM Integration (used when llm_provider="ollama").
    # Requires a running Ollama server (https://ollama.com) with the model pulled:
    #   ollama pull qwen2.5:7b
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "qwen2.5:7b"
    ollama_agent_models: str = "qwen2.5:7b,qwen2.5:7b,qwen2.5:7b"
    ollama_num_ctx: int = 8192

    # Workflow tuning
    # Number of parallel solution agents (1 = fastest, 3 = most thorough).
    agent_count: int = 3
    # Judge the candidates with an extra model call. When False, the first
    # successful candidate is used directly (roughly halves wall-clock time).
    ensemble_judge: bool = True

    web_search_enabled: bool = True
    web_search_max_results: int = 5

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()

