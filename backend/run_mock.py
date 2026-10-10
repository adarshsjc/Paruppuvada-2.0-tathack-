import os
import uvicorn

if __name__ == "__main__":
    # Force mock mode explicitly without requiring API keys or touching .env
    os.environ["USE_MOCK_LLM"] = "True"
    from app.config import settings
    settings.use_mock_llm = True
    print(f"Starting FastAPI backend in MOCK MODE (use_mock_llm={settings.use_mock_llm})...")
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=False)
