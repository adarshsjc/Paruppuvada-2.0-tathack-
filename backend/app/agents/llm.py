import json
from abc import ABC, abstractmethod
from typing import Optional, Type, TypeVar
from pydantic import BaseModel
from app.config import settings

T = TypeVar('T', bound=BaseModel)

class LLMProvider(ABC):
    @abstractmethod
    def generate_json(self, prompt: str, schema: Type[T], model: Optional[str] = None) -> T:
        pass
    
    @abstractmethod
    def generate_text(self, prompt: str, model: Optional[str] = None) -> str:
        pass

class MockLLM(LLMProvider):
    def __init__(self):
        self.call_count = 0
        
    def generate_json(self, prompt: str, schema: Type[T], model: Optional[str] = None) -> T:
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
        elif name == "CandidateSelection":
            return schema(selected_agent=1, rationale="Selected the first available mock solution.")
        return schema()

    def generate_text(self, prompt: str, model: Optional[str] = None) -> str:
        if "Agent role: Direct Solver" in prompt:
            return (
                "[MOCK] Direct Solver: simulated direct-answer candidate. "
                "Configure an OpenRouter API key for a real model response."
            )
        if "Agent role: Critical Thinker" in prompt:
            return (
                "[MOCK] Critical Thinker: simulated independent analysis candidate, "
                "including a check for assumptions and edge cases. Configure OpenRouter "
                "for a real model response."
            )
        if "Agent role: Research Synthesizer" in prompt:
            return (
                "[MOCK] Research Synthesizer: simulated evidence-and-alternatives candidate. "
                "Configure OpenRouter for a real model response."
            )
        return f"[MOCK] Processed: {prompt}"

def extract_json_text(content: str) -> str:
    """Extract clean JSON text from LLM response, handling markdown fences and extraneous text."""
    if not content:
        return ""
    text = content.strip()
    # Check for markdown code fences
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    # Locate first '{' and last '}'
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end >= start:
        return text[start:end+1]
    return text

class OpenAILLM(LLMProvider):
    def __init__(self):
        try:
            from openai import OpenAI
            self.last_model_used = None
            if settings.openrouter_api_key and settings.openrouter_api_key.strip() not in ("", "PASTE_YOUR_API_KEY_HERE"):
                self.client = OpenAI(
                    api_key=settings.openrouter_api_key.strip(),
                    base_url=settings.openrouter_base_url,
                    default_headers={
                        "HTTP-Referer": "http://localhost:5173",
                        "X-Title": "Autonomous AI Agent Platform",
                    }
                )
                self.model = settings.openrouter_model
                self.provider_name = "openrouter"
            else:
                raise ValueError("OPENROUTER_API_KEY is not configured or is still the placeholder.")
        except ImportError:
            raise RuntimeError("openai package is not installed.")

    def generate_json(self, prompt: str, schema: Type[T], model: Optional[str] = None) -> T:
        system_prompt = (
            "You are a helpful assistant that strictly follows instructions. "
            f"You MUST return ONLY valid JSON matching this schema, with no conversational filler or markdown before or after:\n"
            f"{json.dumps(schema.model_json_schema())}"
        )
        
        last_err = None
        # Retry up to 3 times in case openrouter/free routes to an incompatible/moderation model
        for attempt in range(3):
            try:
                # Attempt with response_format={"type": "json_object"} first
                try:
                    response = self.client.chat.completions.create(
                        model=model or self.model,
                        response_format={"type": "json_object"},
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": prompt}
                        ],
                        max_tokens=2000
                    )
                except Exception as api_err:
                    # Some free models on OpenRouter do not support response_format parameter
                    if "response_format" in str(api_err).lower() or "400" in str(api_err):
                        response = self.client.chat.completions.create(
                            model=model or self.model,
                            messages=[
                                {"role": "system", "content": system_prompt},
                                {"role": "user", "content": prompt}
                            ],
                            max_tokens=2000
                        )
                    else:
                        raise api_err

                # Record actual model ID selected by OpenRouter (e.g. meta-llama/llama-3.3-70b-instruct:free)
                self.last_model_used = getattr(response, 'model', self.model)
                raw_content = response.choices[0].message.content or ""
                
                clean_json = extract_json_text(raw_content)
                return schema.model_validate_json(clean_json)
            except Exception as e:
                last_err = e
                # If using openrouter/free, a retry may pick a different free model
                continue
                
        raise ValueError(f"LLM (model: {self.last_model_used}) produced invalid JSON matching schema: {last_err}")
            
    def generate_text(self, prompt: str, model: Optional[str] = None) -> str:
        response = self.client.chat.completions.create(
            model=model or self.model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1000
        )
        self.last_model_used = getattr(response, 'model', self.model)
        return response.choices[0].message.content or ""

def get_llm() -> LLMProvider:
    if settings.use_mock_llm:
        return MockLLM()
    return OpenAILLM()
