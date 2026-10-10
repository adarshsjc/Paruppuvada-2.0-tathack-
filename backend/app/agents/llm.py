import json
import re
import sys
from abc import ABC, abstractmethod
from typing import Type, TypeVar
from pydantic import BaseModel
from app.config import settings

# Ensure safe console output on Windows
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

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
            req_match = re.search(r"request:\s*['\"](.*?)['\"]", prompt, re.DOTALL)
            req_text = req_match.group(1).strip() if req_match else "the submitted task"
            
            p_lower = req_text.lower()
            if any(term in p_lower for term in ["calc", "math", "multipli", "347", "*", "+"]):
                steps = [
                    {"id": 1, "goal": f"Execute calculation for: {req_text}", "expected_output": "Mock output: Precise mathematical result using calculator tool"}
                ]
            elif any(term in p_lower for term in ["save", "note", "memory", "store"]):
                steps = [
                    {"id": 1, "goal": f"Persist memory item for: {req_text}", "expected_output": "Mock output: Confirmation of memory storage"}
                ]
            elif any(term in p_lower for term in ["search", "find", "query"]):
                steps = [
                    {"id": 1, "goal": f"Search contextual memory for: {req_text}", "expected_output": "Mock output: Relevant retrieved memory items"}
                ]
            else:
                steps = [
                    {"id": 1, "goal": f"Execute plan for: {req_text}", "expected_output": "Mock output: Completed task result"}
                ]
            return schema(steps=steps)

        elif name == "ExecutorAction":
            # 1. Check if a tool has already been executed in past execution steps
            tool_res_match = re.search(r"['\"]tool_result['\"]\s*:\s*['\"](.*?)['\"]", prompt, re.DOTALL)
            if tool_res_match:
                tool_res = tool_res_match.group(1)
                if tool_res.startswith("Error"):
                    return schema(
                        thought=f"Tool execution resulted in an error: {tool_res}",
                        tool="none",
                        final_answer=f"[MOCK] Execution error: {tool_res}"
                    )
                return schema(
                    thought=f"Tool execution succeeded with result '{tool_res}'. Providing final answer.",
                    tool="none",
                    final_answer=f"[MOCK] Result: {tool_res}"
                )

            # 2. Check if mock_finished is in prompt
            if "mock_finished" in prompt:
                return schema(thought="Task completed without tools.", tool="none", final_answer="[MOCK] Task completed successfully.")

            # 3. Check if iteration limit or mock_reject test
            if "mock_reject" in prompt and self.call_count > 1:
                return schema(thought="Attempting task resolution despite feedback", tool="none", final_answer="[MOCK] Revised answer.")

            # 4. Check if calculation is requested
            p_lower = prompt.lower()
            if "347" in prompt or "calculator" in p_lower or "multipli" in p_lower or "calc" in p_lower:
                expr = "347 * 829"
                expr_match = re.search(r"(\d+\s*[\+\-\*\/]\s*\d+)", prompt)
                if expr_match:
                    expr = expr_match.group(1).strip()
                return schema(
                    thought=f"Calculating mathematical expression using calculator tool: {expr}",
                    tool="calculator",
                    tool_input={"expression": expr}
                )

            # 5. Check if save_memory is requested
            if "save_memory" in p_lower or ("save" in p_lower and ("note" in p_lower or "memory" in p_lower)):
                return schema(
                    thought="Persisting note to memory using save_memory tool",
                    tool="save_memory",
                    tool_input={"content": "Verified mock note content", "tags": ["note", "mock"]}
                )

            # 6. Check if search_memory is requested
            if "search_memory" in p_lower or "search" in p_lower:
                return schema(
                    thought="Searching memory using search_memory tool",
                    tool="search_memory",
                    tool_input={"query": "test"}
                )

            # 7. Default completion without tools
            return schema(
                thought="No specific tool required for this task.",
                tool="none",
                final_answer="[MOCK] Task completed successfully."
            )

        elif name == "ReviewResult":
            # 1. Explicit mock rejection flag
            if "mock_reject" in prompt:
                return schema(approved=False, feedback="Rejecting for test: mock_reject flag present.")

            # 2. Incomplete or invalid results
            p_lower = prompt.lower()
            if "incomplete" in p_lower or "invalid" in p_lower:
                return schema(approved=False, feedback="Rejecting: Result is incomplete or invalid.")

            # 3. Check if final result indicates failure or error
            res_match = re.search(r"Final result:\s*(.*?)(?:\nDoes this result|\Z)", prompt, re.DOTALL)
            final_res = res_match.group(1).strip() if res_match else ""

            if not final_res or "error" in final_res.lower() or "failed" in final_res.lower() or final_res == "No answer provided.":
                return schema(approved=False, feedback="Result indicates execution failure or is empty.")

            # 4. Check if calculation was requested with 347 and 829, verify 287663 is in answer
            if "347" in prompt and "829" in prompt:
                if "287663" not in final_res:
                    return schema(approved=False, feedback="Result does not contain the expected calculation result (287663).")

            return schema(approved=True, feedback="Approved. The final result satisfies the request.")

        return schema()

    def generate_text(self, prompt: str) -> str:
        if "Summarize" in prompt:
            res_part = prompt.split(":")[-1].strip() if ":" in prompt else prompt
            return f"[MOCK] Summary: {res_part}"
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

class OllamaLLM(LLMProvider):
    """LLM provider using a local Ollama instance via the OpenAI-compatible API.
    
    Includes small-model compatibility: concrete example prompts instead of raw
    JSON Schema, and post-processing to unwrap common schema-echo failures.
    """

    # Concrete examples for each schema type, so the 3B model sees the
    # expected output shape instead of echoing back the JSON Schema definition.
    SCHEMA_EXAMPLES = {
        "Plan": (
            'You must output a JSON object with a "steps" array. Each step has "id" (integer), '
            '"goal" (string), and "expected_output" (string).\n'
            'Example:\n'
            '{"steps": [{"id": 1, "goal": "Do the task", "expected_output": "Result of the task"}]}'
        ),
        "ExecutorAction": (
            'You must output a JSON object with these exact fields:\n'
            '- "thought": string (your reasoning)\n'
            '- "tool": string (tool name to call, or "none" if you have the final answer)\n'
            '- "tool_input": object (arguments for the tool, e.g. {"expression": "347 * 829"})\n'
            '- "final_answer": string or null (set this when tool is "none")\n\n'
            'Example when calling a tool:\n'
            '{"thought": "I need to calculate this", "tool": "calculator", "tool_input": {"expression": "347 * 829"}, "final_answer": null}\n\n'
            'Example when providing final answer:\n'
            '{"thought": "The calculation result is 287663", "tool": "none", "tool_input": {}, "final_answer": "The result of 347 * 829 is 287663."}'
        ),
        "ReviewResult": (
            'You must output a JSON object with these exact fields:\n'
            '- "approved": boolean (true if the result satisfies the request, false otherwise)\n'
            '- "feedback": string (reason for your decision)\n\n'
            'Example:\n'
            '{"approved": true, "feedback": "The result correctly answers the question."}'
        ),
        "SalesReportParams": (
            'You must output a JSON object with these exact fields:\n'
            '- "csv_path": string (workspace-relative input CSV file name)\n'
            '- "group_by": string (the category column to group totals by)\n'
            '- "sum_column": string (the numeric column to total)\n'
            '- "report_json_path": string (output JSON file name)\n'
            '- "report_md_path": string (output Markdown file name)\n\n'
            'Example:\n'
            '{"csv_path": "sales.csv", "group_by": "product", "sum_column": "revenue", '
            '"report_json_path": "report.json", "report_md_path": "report.md"}'
        ),
    }

    def __init__(self):
        try:
            from openai import OpenAI
        except ImportError:
            raise RuntimeError("openai package is not installed. Run: pip install openai")

        self.client = OpenAI(
            api_key="ollama",  # placeholder; Ollama ignores the key
            base_url=settings.ollama_base_url,
        )
        self.model = settings.ollama_model
        self.provider_name = "ollama"
        self.last_model_used = self.model

    def _build_system_prompt(self, schema_name: str) -> str:
        """Build a system prompt using concrete examples instead of raw JSON Schema."""
        example = self.SCHEMA_EXAMPLES.get(schema_name, "")
        return (
            "You are a JSON-only assistant. Respond with ONLY a single JSON object.\n"
            "CRITICAL RULES:\n"
            "1. Output ONLY the raw JSON object — no markdown, no code fences, no explanation.\n"
            "2. Do NOT output the schema definition. Output actual values.\n"
            "3. Do NOT wrap your answer in a 'properties' key.\n\n"
            f"OUTPUT FORMAT:\n{example}"
        )

    @staticmethod
    def _unwrap_properties(data: dict) -> dict:
        """If the model echoed the schema structure with a 'properties' wrapper,
        unwrap it to extract the actual values.
        
        Common failure mode: model returns {"properties": {"thought": {...}, ...}}
        instead of {"thought": "actual value", ...}
        """
        if "properties" in data and isinstance(data["properties"], dict):
            inner = data["properties"]
            # Check if the inner values look like schema definitions (have 'type'/'description')
            # or actual data values
            sample_val = next(iter(inner.values()), None)
            if isinstance(sample_val, dict) and ("type" in sample_val or "description" in sample_val):
                # Model echoed the schema — try to extract default/example values
                # This is unrecoverable, but we can signal it clearly
                return data  # let it fail at validation with a clear error
            else:
                # Model wrapped actual values in 'properties' — unwrap
                return inner
        return data

    def generate_json(self, prompt: str, schema: Type[T]) -> T:
        schema_name = schema.__name__
        system_prompt = self._build_system_prompt(schema_name)

        last_err = None
        for attempt in range(3):
            try:
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": prompt}
                    ],
                    temperature=0.1,  # low temperature for structured output
                    max_tokens=800,
                )
                self.last_model_used = getattr(response, 'model', self.model)
                raw_content = response.choices[0].message.content or ""
                print(f"  [Ollama] attempt={attempt+1} model={self.last_model_used} raw_len={len(raw_content)}")

                clean_json = extract_json_text(raw_content)
                if not clean_json:
                    raise ValueError(f"No JSON found in Ollama response: {raw_content[:300]}")

                # Parse and attempt to unwrap schema-echo failures
                parsed = json.loads(clean_json)
                parsed = self._unwrap_properties(parsed)

                # Normalize common field-name variations from small models
                if schema_name == "ExecutorAction":
                    parsed = self._normalize_executor_action(parsed)
                elif schema_name == "ReviewResult":
                    parsed = self._normalize_review_result(parsed)

                return schema.model_validate(parsed)
            except Exception as e:
                last_err = e
                print(f"  [Ollama] attempt={attempt+1} parse error: {e}")
                continue

        raise ValueError(
            f"Ollama ({self.last_model_used}) failed to produce valid JSON after 3 attempts: {last_err}"
        )

    @staticmethod
    def _normalize_executor_action(data: dict) -> dict:
        """Normalize field names that small models commonly get wrong."""
        # Map alternative key names to the canonical ones
        if "thought" not in data:
            for alt in ["thinking", "reasoning", "reason", "thoughts", "rationale"]:
                if alt in data:
                    data["thought"] = data.pop(alt)
                    break
            else:
                data["thought"] = "Processing task"

        if "tool" not in data:
            for alt in ["tool_name", "action", "function", "tool_call"]:
                if alt in data:
                    data["tool"] = data.pop(alt)
                    break
            else:
                data["tool"] = "none"

        if "tool_input" not in data:
            for alt in ["tool_args", "args", "arguments", "parameters", "params", "input"]:
                if alt in data:
                    data["tool_input"] = data.pop(alt)
                    break
            else:
                data["tool_input"] = {}

        if "final_answer" not in data:
            for alt in ["answer", "result", "response", "output", "final_result"]:
                if alt in data:
                    data["final_answer"] = data.pop(alt)
                    break

        # Ensure tool_input is a dict
        if not isinstance(data.get("tool_input"), dict):
            ti = data.get("tool_input")
            if isinstance(ti, str):
                data["tool_input"] = {"expression": ti}
            else:
                data["tool_input"] = {}

        return data

    @staticmethod
    def _normalize_review_result(data: dict) -> dict:
        """Normalize ReviewResult fields from small model output."""
        if "approved" not in data:
            for alt in ["approve", "is_approved", "pass", "passed", "accept", "accepted"]:
                if alt in data:
                    data["approved"] = data.pop(alt)
                    break
            else:
                data["approved"] = False

        if "feedback" not in data:
            for alt in ["reason", "comment", "message", "explanation", "note", "review"]:
                if alt in data:
                    data["feedback"] = data.pop(alt)
                    break
            else:
                data["feedback"] = "No feedback provided."

        # Coerce approved to bool
        if isinstance(data["approved"], str):
            data["approved"] = data["approved"].lower() in ("true", "yes", "1", "approved", "pass")

        return data

    def generate_text(self, prompt: str) -> str:
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=300,
        )
        self.last_model_used = getattr(response, 'model', self.model)
        return response.choices[0].message.content or ""


class OpenAILLM(LLMProvider):
    """LLM provider for cloud APIs (OpenRouter / Gemini) via the OpenAI SDK."""

    def __init__(self):
        try:
            from openai import OpenAI
            self.last_model_used = None
            # Priority 1: Gemini direct API (fastest, ~600-900ms per step)
            if settings.gemini_api_key and settings.gemini_api_key.strip() not in ("", "PASTE_YOUR_KEY_HERE"):
                self.client = OpenAI(
                    api_key=settings.gemini_api_key.strip(),
                    base_url="https://generativelanguage.googleapis.com/v1beta/openai/"
                )
                self.model = settings.gemini_model
                self.provider_name = "gemini"
            # Priority 2: OpenRouter free models (slower, 5-12s per step)
            elif settings.openrouter_api_key and settings.openrouter_api_key.strip() not in ("", "PASTE_YOUR_API_KEY_HERE"):
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
                raise ValueError("No API key configured. Set GEMINI_API_KEY or OPENROUTER_API_KEY in backend/.env")
        except ImportError:
            raise RuntimeError("openai package is not installed.")


    def generate_json(self, prompt: str, schema: Type[T]) -> T:
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
                        model=self.model,
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
                            model=self.model,
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
            
    def generate_text(self, prompt: str) -> str:
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1000
        )
        self.last_model_used = getattr(response, 'model', self.model)
        return response.choices[0].message.content or ""


def get_llm() -> LLMProvider:
    """Factory: returns the configured LLM provider instance.
    
    Priority:
      1. USE_MOCK_LLM=True  -> MockLLM (offline, no API)
      2. LLM_PROVIDER=ollama -> OllamaLLM (local Ollama)
      3. LLM_PROVIDER=openrouter -> OpenAILLM (cloud, OpenRouter)
      4. LLM_PROVIDER=gemini -> OpenAILLM (cloud, Gemini)
    """
    if settings.use_mock_llm:
        return MockLLM()

    provider = settings.llm_provider.lower().strip()

    if provider == "ollama":
        return OllamaLLM()
    elif provider in ("openrouter", "gemini"):
        return OpenAILLM()
    else:
        raise ValueError(
            f"Unknown LLM_PROVIDER='{provider}'. "
            f"Valid values: 'ollama', 'openrouter', 'gemini'. "
            f"Or set USE_MOCK_LLM=True for offline mode."
        )
