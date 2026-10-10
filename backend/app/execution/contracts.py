"""Task contracts and workflow-step models for dependency-aware execution."""
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class StepState(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"
    VERIFIED = "verified"
    VERIFICATION_FAILED = "verification_failed"


class Verdict(str, Enum):
    PASS = "PASS"
    FAIL = "FAIL"
    INCONCLUSIVE = "INCONCLUSIVE"


class WorkflowStep(BaseModel):
    step_id: str
    goal: str
    tool: str
    expected_output: str = ""
    depends_on: List[str] = Field(default_factory=list)
    inputs: Dict[str, Any] = Field(default_factory=dict)
    permission: str = "workspace"
    retryable: bool = True
    skill_id: Optional[str] = None
    state: StepState = StepState.PENDING
    attempts: int = 0
    result: Optional[Any] = None
    error: Optional[str] = None
    node_id: Optional[str] = None


class TaskContract(BaseModel):
    task_id: str
    goal: str
    constraints: List[str] = Field(default_factory=list)
    expected_outputs: List[str] = Field(default_factory=list)
    required_capabilities: List[str] = Field(default_factory=list)
    allowed_tools: List[str] = Field(default_factory=list)
    completion_criteria: str = ""
    verification_rules: List[str] = Field(default_factory=list)
    selection_mode: str = "auto"  # auto | selected
    selected_skills: List[str] = Field(default_factory=list)
    automatically_retrieved: List[str] = Field(default_factory=list)
    rejected_candidates: List[Dict[str, str]] = Field(default_factory=list)
    graph_version: str = ""
    created_at: Optional[datetime] = None


class VerificationCheck(BaseModel):
    rule: str
    description: str = ""
    verdict: Verdict = Verdict.INCONCLUSIVE
    evidence: Dict[str, Any] = Field(default_factory=dict)


class VerificationReport(BaseModel):
    verdict: Verdict
    checks: List[VerificationCheck] = Field(default_factory=list)
    summary: str = ""
