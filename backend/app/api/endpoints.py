import uuid
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from app.agents.ensemble import AGENT_COUNT, run_parallel_workflow
from app.agents.llm import get_llm
from app.config import settings
from app.memory.sqlite import get_memory_provider
from app.memory.base import Project, MemoryItem
from app.models.schemas import TaskState, Plan, Step, ReviewResult

router = APIRouter()

class TaskRequest(BaseModel):
    description: str
    project_id: Optional[str] = None
    mode: Optional[str] = "simple"
    selected_skills: Optional[List[str]] = None

class TaskResponse(BaseModel):
    status: str
    result: str
    details: dict = {}

class ProjectCreate(BaseModel):
    name: str

@router.get("/health")
def health_check():
    provider = "mock" if settings.use_mock_llm else settings.llm_provider
    model = "MockLLM"
    if not settings.use_mock_llm:
        if settings.llm_provider == "ollama":
            model = settings.ollama_model
        elif settings.llm_provider == "openrouter":
            model = settings.openrouter_model
        elif settings.llm_provider == "gemini":
            model = settings.gemini_model

    if settings.use_mock_llm:
        mode = "mock"
    elif settings.llm_provider == "ollama":
        mode = f"ollama ({settings.ollama_model})"
    elif settings.llm_provider == "openrouter":
        mode = f"openrouter ({settings.openrouter_model})"
    elif settings.llm_provider == "gemini":
        mode = f"gemini ({settings.gemini_model})"
    else:
        mode = provider

    return {
        "status": "ok",
        "provider": provider,
        "model": model,
        "llm_mode": mode,
        "agent_count": AGENT_COUNT
    }

@router.post("/api/v1/projects", response_model=Project)
def create_project(data: ProjectCreate):
    try:
        return get_memory_provider().create_project(data.name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/api/v1/projects", response_model=List[Project])
def list_projects():
    return get_memory_provider().list_projects()

@router.post("/api/v1/memory", response_model=MemoryItem)
def add_memory(item: MemoryItem):
    return get_memory_provider().add_memory(item)

@router.get("/api/v1/memory", response_model=List[MemoryItem])
def search_memory(q: str = "", project_id: Optional[str] = None):
    if q:
        return get_memory_provider().search_memory(q, project_id)
    return get_memory_provider().list_memory(project_id)

@router.delete("/api/v1/memory/{memory_id}")
def delete_memory(memory_id: str):
    success = get_memory_provider().delete_memory(memory_id)
    if not success:
         raise HTTPException(status_code=404, detail="Memory not found")
    return {"status": "deleted"}

@router.post("/api/v1/tasks", response_model=TaskResponse)
def create_task(request: TaskRequest):
    if not request.description.strip():
        raise HTTPException(status_code=400, detail="Task description cannot be empty.")
    try:
        # Complex mode: full multi-agent ensemble with memory retrieval, DAG execution, and review
        if request.mode and request.mode.strip().lower() == "complex":
            state = run_parallel_workflow(request.description, project_id=request.project_id)
            return TaskResponse(status=state.status, result=state.final_result or "", details=state.model_dump())

        # Simple mode: fast terminal-style direct response from local Qwen 2.5:3B without agent/memory delay
        llm = get_llm()
        result_text = llm.generate_text(request.description)
        result_text = result_text.strip() if result_text else "No response generated."
        model_name = getattr(llm, "model", settings.ollama_model)

        state = TaskState(
            task_id=str(uuid.uuid4()),
            request=request.description,
            status="completed",
            plan=Plan(steps=[
                Step(id=1, goal="Direct Terminal Query", expected_output=f"Direct output from {model_name}")
            ]),
            final_result=result_text,
            iterations=1,
            review=ReviewResult(
                approved=True,
                feedback=f"Direct response from {model_name} in Simple Mode (fast terminal mode, no multi-agent delay)."
            ),
            execution_steps=[{
                "mode": "simple",
                "model": model_name,
                "action": {
                    "thought": "Terminal-style direct response without multi-agent ensemble or memory overhead.",
                    "tool": "none"
                },
                "tool_result": result_text
            }]
        )
        return TaskResponse(status="completed", result=result_text, details=state.model_dump())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
