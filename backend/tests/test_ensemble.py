from threading import Barrier
from unittest.mock import patch

from app.agents.ensemble import run_parallel_workflow
from app.models.schemas import CandidateSelection


class ParallelLLM:
    provider_name = "openrouter"

    def __init__(self):
        self.barrier = Barrier(3)
        self.prompts = []

    def generate_text(self, prompt, model=None):
        if model:
            self.prompts.append(prompt)
            self.barrier.wait(timeout=5)
            return f"Solution from {model}"
        return "Task summary"

    def generate_json(self, prompt, schema, model=None):
        assert schema is CandidateSelection
        return CandidateSelection(selected_agent=2, rationale="More complete and relevant.")


class MemoryProvider:
    def __init__(self):
        self.saved = []

    def search_memory(self, request, project_id=None):
        return []

    def add_memory(self, item):
        self.saved.append(item)
        return item


def test_parallel_agents_finish_together_and_selected_answer_is_returned():
    llm = ParallelLLM()
    memory = MemoryProvider()
    results = [{
        "title": "Helpful result",
        "url": "https://example.com/answer",
        "snippet": "Relevant public information.",
    }]

    with (
        patch("app.agents.ensemble.get_llm", return_value=llm),
        patch("app.agents.ensemble.get_memory_provider", return_value=memory),
        patch("app.agents.ensemble.search_web", return_value=results) as web_search,
        patch("app.agents.ensemble.settings.openrouter_agent_models", "agent-a,agent-b,agent-c"),
        patch("app.agents.ensemble.settings.agent_count", 3),
        patch("app.agents.ensemble.settings.ensemble_judge", True),
    ):
        state = run_parallel_workflow("Solve this task")

    web_search.assert_called_once_with("Solve this task", max_results=5)
    assert state.status == "completed"
    assert state.final_result == "Solution from agent-b"
    candidates = state.execution_steps[0]["parallel_agents"]
    assert [candidate["model"] for candidate in candidates] == ["agent-a", "agent-b", "agent-c"]
    assert [candidate["role"] for candidate in candidates] == [
        "Direct Solver",
        "Critical Thinker",
        "Research Synthesizer",
    ]
    assert candidates[1]["selected"] is True
    assert state.execution_steps[0]["web_research"] == results
    assert all("https://example.com/answer" in prompt for prompt in llm.prompts)
    assert "Agent role: Direct Solver" in llm.prompts[0]
    assert "Agent role: Critical Thinker" in llm.prompts[1]
    assert "Agent role: Research Synthesizer" in llm.prompts[2]
    assert len(set(llm.prompts)) == 3
    assert len(memory.saved) == 1


def test_memory_match_skips_web_search():
    llm = ParallelLLM()
    memory = MemoryProvider()
    memory.search_memory = lambda request, project_id=None: [
        type("Memory", (), {"type": "project", "content": "Previously saved solution"})()
    ]

    with (
        patch("app.agents.ensemble.get_llm", return_value=llm),
        patch("app.agents.ensemble.get_memory_provider", return_value=memory),
        patch("app.agents.ensemble.search_web") as web_search,
        patch("app.agents.ensemble.settings.openrouter_agent_models", "agent-a,agent-b,agent-c"),
        patch("app.agents.ensemble.settings.agent_count", 3),
        patch("app.agents.ensemble.settings.ensemble_judge", True),
    ):
        state = run_parallel_workflow("Solve this task")

    web_search.assert_not_called()
    assert state.status == "completed"
    assert all("Previously saved solution" in prompt for prompt in llm.prompts)
