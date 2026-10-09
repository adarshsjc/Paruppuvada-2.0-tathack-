from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    use_mock_llm: bool = True
    
    # OpenRouter API Integration
    openrouter_api_key: str = ""
    openrouter_model: str = "openrouter/free"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_agent_models: str = "openrouter/free,openrouter/free,openrouter/free"

    web_search_enabled: bool = True
    web_search_max_results: int = 5

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()
