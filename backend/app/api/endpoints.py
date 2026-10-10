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
from app.graph.store import get_graph_store

router = APIRouter()

# In-memory settings state
_settings_state = {
    "graph_access_to_chat": False
}

class GraphAccessRequest(BaseModel):
    enabled: bool

@router.get("/api/v1/settings/graph-access")
def get_graph_access():
    return {"enabled": _settings_state.get("graph_access_to_chat", False)}

@router.post("/api/v1/settings/graph-access")
def set_graph_access(req: GraphAccessRequest):
    _settings_state["graph_access_to_chat"] = bool(req.enabled)
    return {"enabled": _settings_state["graph_access_to_chat"], "status": "updated"}

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
    selected_skills: Optional[List[str]] = None

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
        project = get_memory_provider().create_project(data.name)
        if data.selected_skills:
            import json
            get_memory_provider().add_memory(MemoryItem(
                project_id=project.id,
                type="project_skills",
                content=json.dumps(data.selected_skills),
                source="project_init",
                tags=["skills", "configuration"]
            ))
        return project
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/api/v1/projects/{project_id}/skills")
def get_project_skills(project_id: str):
    items = get_memory_provider().list_memory(project_id, type="project_skills")
    if items:
        import json
        try:
            return {"skills": json.loads(items[-1].content)}
        except Exception:
            pass
    return {"skills": []}

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
            state = run_parallel_workflow(
                request.description, 
                project_id=request.project_id,
                selected_skills=request.selected_skills
            )
            return TaskResponse(status=state.status, result=state.final_result or "", details=state.model_dump())

        # Simple mode: fast terminal-style direct response from local Qwen 2.5:3B
        graph_active = _settings_state.get("graph_access_to_chat", False)
        injected_knowledge = []
        prompt_text = request.description

        if graph_active:
            try:
                store = get_graph_store()
                relevant_nodes = store.search_nodes(request.description, project_id=request.project_id, limit=3)
                if not relevant_nodes:
                    stopwords = {"what", "which", "where", "when", "how", "does", "exist", "with", "from", "that", "this", "have", "please", "tell", "about"}
                    words = [w.strip("?,.!") for w in request.description.lower().split() if len(w) > 3 and w.strip("?,.!") not in stopwords]
                    found = {}
                    for w in words[:4]:
                        for n in store.search_nodes(w, project_id=request.project_id, limit=2):
                            found[n.id] = n
                    relevant_nodes = list(found.values())[:3]

                if relevant_nodes:
                    injected_knowledge = [f"{n.label} ({n.node_type.value}): {n.description[:120]}" for n in relevant_nodes]
                    context_prefix = "Relevant Knowledge Graph Context:\n" + "\n".join(f"- {k}" for k in injected_knowledge) + "\n\nUser Question:\n"
                    prompt_text = f"{context_prefix}{request.description}"
            except Exception:
                pass

        llm = get_llm()
        result_text = llm.generate_text(prompt_text)
        result_text = result_text.strip() if result_text else "No response generated."
        model_name = getattr(llm, "model", settings.ollama_model)

        step_data = {
            "mode": "simple",
            "model": model_name,
            "action": {
                "thought": "Terminal-style direct response." if not graph_active else "Terminal-style response grounded with Knowledge Graph memory context.",
                "tool": "none"
            },
            "tool_result": result_text
        }
        if graph_active and injected_knowledge:
            step_data["graph_access_active"] = True
            step_data["injected_knowledge"] = injected_knowledge
        if request.selected_skills:
            step_data["active_skills"] = request.selected_skills

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
            execution_steps=[step_data]
        )
        return TaskResponse(status="completed", result=result_text, details=state.model_dump())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
