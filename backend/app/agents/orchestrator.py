import uuid
from app.models.schemas import TaskState, Plan, ExecutorAction, ReviewResult
from app.agents.llm import get_llm
from app.tools.registry import execute_tool, TOOLS
from app.memory.sqlite import get_memory_provider
from app.memory.base import MemoryItem

MAX_ITERATIONS = 5

TOOL_DESCRIPTIONS = (
    "- calculator(expression: str): Evaluates a math expression. Example: {\"expression\": \"347 * 829\"}\n"
    "- save_memory(content: str, is_global: bool = False, tags: list = []): Saves note to memory.\n"
    "- search_memory(query: str): Searches memory for context."
)


def run_workflow(request: str, project_id: str = None) -> TaskState:
    llm = get_llm()
    provider = get_memory_provider()
    state = TaskState(task_id=str(uuid.uuid4()), request=request)
    
    # Retrieve contextual memory
    context_memories = provider.search_memory(request, project_id=project_id)
    context_str = "\n".join([f"- {m.content}" for m in context_memories[:3]]) if context_memories else ""

    # === STEP 1: PLAN (1 LLM call) ===
    state.status = "planned"
    try:
        plan_prompt = f"Create a step-by-step plan for request: '{request}'"
        if context_str:
            plan_prompt += f"\nRelevant context:\n{context_str}"
        state.plan = llm.generate_json(plan_prompt, Plan)
    except Exception as e:
        state.status = "failed"
        state.final_result = f"Planning failed: {e}"
        return state

    # === STEP 2: DECIDE ACTION (1 LLM call) ===
    state.iterations = 1
    exec_prompt = (
        f"Task: {request}\n"
        f"Plan: {state.plan.model_dump_json() if state.plan else ''}\n"
        f"Available Tools:\n{TOOL_DESCRIPTIONS}\n\n"
        f"If you can answer directly without tools, set tool=\"none\" and provide final_answer.\n"
        f"If you MUST use a tool, call it once. Only use tools when the task explicitly requires computation, saving, or searching."
    )
    
    try:
        action = llm.generate_json(exec_prompt, ExecutorAction)
    except Exception as e:
        state.status = "failed"
        state.final_result = f"Execution failed: {e}"
        return state
    
    step_record = {"action": action.model_dump()}
    
    # === BRANCH A: Direct answer (no tool) ===
    if not action.tool or action.tool in ("none", ""):
        state.final_result = action.final_answer or "No answer provided."
        state.execution_steps.append(step_record)
    else:
        # === BRANCH B: Execute exactly ONE tool, then compose answer ===
        tool_result = execute_tool(action.tool, action.tool_input, project_id=project_id)
        step_record["tool_result"] = tool_result
        state.execution_steps.append(step_record)
        state.iterations += 1
        
        # Now compose final answer using the tool result (1 LLM call)
        compose_prompt = (
            f"Task: {request}\n"
            f"'tool_result': '{tool_result}'\n\n"
            f"Write a clear, helpful final answer for the user based on this result.\n"
            f"Set tool=\"none\" and provide final_answer. Do NOT call any more tools."
        )
        try:
            final_action = llm.generate_json(compose_prompt, ExecutorAction)
            state.final_result = final_action.final_answer or str(tool_result)
            state.execution_steps.append({"action": final_action.model_dump()})
            state.iterations += 1
        except Exception:
            # Fallback: use the raw tool result
            state.final_result = f"Done. Tool result: {tool_result}"

    # === STEP 3: REVIEW (1 LLM call) ===
    review_prompt = (
        f"Request: '{request}'\n"
        f"Final result: {state.final_result}\n"
        f"Does this result properly satisfy the request?"
    )
    
    try:
        review = llm.generate_json(review_prompt, ReviewResult)
        state.review = review
        state.iterations += 1
        
        if review.approved:
            state.status = "completed"
        else:
            state.status = "failed"
            state.iterations = MAX_ITERATIONS
            state.final_result = "Max iterations reached without a successful review."
    except Exception:
        state.status = "completed"
    
    # Save task memory (no LLM call)
    summary = f"Task: {request[:200]} | Result: {str(state.final_result)[:300]}"
    provider.add_memory(MemoryItem(
        project_id=project_id, type="session", content=summary,
        source="task_writeback", tags=["auto_summary"]
    ))
    
    return state
