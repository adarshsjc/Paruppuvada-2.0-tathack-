import json
from abc import ABC, abstractmethod
from typing import Type, TypeVar
from pydantic import BaseModel
from app.config import settings

T = TypeVar('T', bound=BaseModel)

class LLMProvider(ABC):
    @abstractmethod
    def generate_json(self, prompt: str, schema: Type[T]) -> T:
        pass
    
    @abstractmethod
    def generate_text(self, prompt: str) -> str:
        pass

class MockLLM(LLMProvider):
    def __init__(self):
        self.call_count = 0
        
    def generate_json(self, prompt: str, schema: Type[T]) -> T:
        self.call_count += 1
        name = schema.__name__
        if name == "Plan":
            return schema(steps=[{"id": 1, "goal": "Mock goal", "expected_output": "Mock output"}])
        elif name == "ExecutorAction":
            if "mock_finished" in prompt or self.call_count > 3:
                return schema(thought="Done", tool="none", final_answer="[MOCK] Task completed successfully.")
            if "test_calc" in prompt.lower() or "347" in prompt:
                return schema(thought="Mock calculation", tool="calculator", tool_input={"expression": "347 * 829"})
            return schema(thought="Mock tool usage", tool="save_memory", tool_input={"content": "data", "tags": []})
        elif name == "ReviewResult":
            if "mock_reject" in prompt:
                return schema(approved=False, feedback="Rejecting for test")
            return schema(approved=True, feedback="Approved.")
        return schema()

    def generate_text(self, prompt: str) -> str:
        return f"[MOCK] Processed: {prompt}"

class OpenAILLM(LLMProvider):
    def __init__(self):
        try:
            from openai import OpenAI
            if not settings.gemini_api_key or settings.gemini_api_key == "PASTE_YOUR_KEY_HERE":
                raise ValueError("GEMINI_API_KEY is not set or is still the placeholder.")
            
            # Using the Gemini OpenAI-compatible endpoint
            self.client = OpenAI(
                api_key=settings.gemini_api_key,
                base_url="https://generativelanguage.googleapis.com/v1beta/openai/"
            )
        except ImportError:
            raise RuntimeError("openai package is not installed.")

    def generate_json(self, prompt: str, schema: Type[T]) -> T:
        system_prompt = f"You are a helpful assistant. Return ONLY valid JSON that matches this JSON schema:\n{json.dumps(schema.model_json_schema())}"
        
        try:
            response = self.client.chat.completions.create(
                model=settings.gemini_model,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=2000
            )
            return schema.model_validate_json(response.choices[0].message.content)
        except Exception as e:
            raw_response = response.choices[0].message.content if 'response' in locals() else 'None'
            raise ValueError(f"LLM produced invalid JSON or API call failed: {e}\nRaw output: {raw_response}")
            
    def generate_text(self, prompt: str) -> str:
        response = self.client.chat.completions.create(
            model=settings.gemini_model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1000
        )
        return response.choices[0].message.content

def get_llm() -> LLMProvider:
    if settings.use_mock_llm:
        return MockLLM()
    return OpenAILLM()
