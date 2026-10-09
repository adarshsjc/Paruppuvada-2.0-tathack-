from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    use_mock_llm: bool = True
    openai_api_key: str = ""
    model_name: str = "gpt-3.5-turbo"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()
