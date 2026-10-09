import json
import queue
import threading
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.agents.ensemble import AGENT_COUNT, run_parallel_workflow
from app.config import settings
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
    if settings.use_mock_llm:
        mode = "mock"
        model = "mock"
    elif settings.llm_provider.lower() == "ollama":
        mode = "ollama"
        model = settings.ollama_model
    elif settings.openrouter_api_key and settings.openrouter_api_key != "PASTE_YOUR_API_KEY_HERE":
        mode = "openrouter"
        model = settings.openrouter_model
    else:
        mode = "unconfigured"
        model = ""
    return {"status": "ok", "llm_mode": mode, "llm_model": model, "agent_count": settings.agent_count}

@router.post("/api/v1/projects", response_model=Project)
def create_project(data: ProjectCreate):
    try:
        return get_memory_provider().create_project(data.name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/api/v1/projects", response_model=List[Project])
def list_projects(include_deleted: bool = Query(False)):
    """List projects; include_deleted=true also returns workspaces in the recycle bin."""
    return get_memory_provider().list_projects(include_deleted=include_deleted)

@router.delete("/api/v1/projects/{project_id}")
def delete_project(project_id: str):
    """Move a project (workspace) into the recycle bin (soft delete)."""
    if not get_memory_provider().delete_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    return {"status": "deleted", "project_id": project_id}

@router.post("/api/v1/projects/{project_id}/restore")
def restore_project(project_id: str):
    """Restore a project from the recycle bin back to the active workspace list."""
    if not get_memory_provider().restore_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    return {"status": "restored", "project_id": project_id}

@router.delete("/api/v1/projects/{project_id}/permanent")
def purge_project(project_id: str):
    """Permanently delete a project and all of its memories (irreversible)."""
    if not get_memory_provider().purge_project(project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    return {"status": "purged", "project_id": project_id}

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
        state = run_parallel_workflow(request.description, project_id=request.project_id)
        return TaskResponse(status=state.status, result=state.final_result or "", details=state.model_dump())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def _task_event_stream(request: TaskRequest):
    """Run the workflow in a worker thread, forwarding progress as SSE frames."""
    events: "queue.Queue[dict]" = queue.Queue()

    def on_event(payload: dict) -> None:
        events.put(payload)

    def run() -> None:
        try:
            run_parallel_workflow(request.description, project_id=request.project_id, on_event=on_event)
        except Exception as exc:  # pragma: no cover - defensive
            events.put({"event": "error", "message": f"Workflow failed: {exc}"})
        events.put({"event": "__end__"})

    threading.Thread(target=run, daemon=True).start()

    while True:
        payload = events.get()
        if payload.get("event") == "__end__":
            break
        yield f"data: {json.dumps(payload, ensure_ascii=False, default=str)}\n\n"

@router.post("/api/v1/tasks/stream")
def create_task_stream(request: TaskRequest):
    """Same as /api/v1/tasks but streams live progress as Server-Sent Events."""
    if not request.description.strip():
        raise HTTPException(status_code=400, detail="Task description cannot be empty.")
    return StreamingResponse(
        _task_event_stream(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
