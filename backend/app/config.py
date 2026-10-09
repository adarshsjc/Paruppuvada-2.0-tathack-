from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    use_mock_llm: bool = True
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.8-flash"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()
