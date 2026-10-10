from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from app.agents.orchestrator import run_workflow
from app.memory.sqlite import get_memory_provider
from app.memory.base import Project, MemoryItem

router = APIRouter()

class TaskRequest(BaseModel):
    description: str
    project_id: Optional[str] = None

class TaskResponse(BaseModel):
    status: str
    result: str
    details: dict = {}

class ProjectCreate(BaseModel):
    name: str

@router.get("/health")
def health_check():
    from app.config import settings
    provider = "mock" if settings.use_mock_llm else settings.llm_provider
    model = "MockLLM"
    if not settings.use_mock_llm:
        if settings.llm_provider == "ollama":
            model = settings.ollama_model
        elif settings.llm_provider == "openrouter":
            model = settings.openrouter_model
        elif settings.llm_provider == "gemini":
            model = settings.gemini_model
    return {"status": "ok", "provider": provider, "model": model}

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
        state = run_workflow(request.description, project_id=request.project_id)
        return TaskResponse(status=state.status, result=state.final_result or "", details=state.model_dump())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
