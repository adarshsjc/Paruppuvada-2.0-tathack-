from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict

class Step(BaseModel):
    id: int
    goal: str
    expected_output: str

class Plan(BaseModel):
    steps: List[Step] = Field(description="List of steps to achieve the goal")

class ExecutorAction(BaseModel):
    thought: str = Field(description="Reasoning for the next action")
    tool: str = Field(description="Name of the tool to use, or 'none' if finished")
    tool_input: Dict[str, Any] = Field(default_factory=dict, description="Arguments for the tool")
    final_answer: Optional[str] = Field(None, description="The final answer if tool is 'none'")

class ReviewResult(BaseModel):
    approved: bool = Field(description="True if the result meets the original request")
    feedback: str = Field(description="Feedback for the executor if rejected, or reasoning if approved")

class CandidateSelection(BaseModel):
    selected_agent: int = Field(description="The selected agent number from the supplied candidates")
    rationale: str = Field(description="Why this candidate best satisfies the user's request")

class TaskState(BaseModel):
    task_id: str
    request: str
    plan: Optional[Plan] = None
    execution_steps: List[Dict[str, Any]] = []
    final_result: Optional[str] = None
    review: Optional[ReviewResult] = None
    status: str = "pending"
    iterations: int = 0
