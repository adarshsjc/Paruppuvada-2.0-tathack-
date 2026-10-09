import uuid
from app.models.schemas import TaskState, Plan, ExecutorAction, ReviewResult
from app.agents.llm import get_llm
from app.tools.registry import execute_tool, TOOLS
from app.memory.sqlite import get_memory_provider
from app.memory.base import MemoryItem

MAX_ITERATIONS = 5

def run_workflow(request: str, project_id: str = None) -> TaskState:
    llm = get_llm()
    provider = get_memory_provider()
    state = TaskState(task_id=str(uuid.uuid4()), request=request)
    
    # Retrieve contextual memory
    context_memories = provider.search_memory(request, project_id=project_id)
    context_str = "\n".join([f"[{m.type}] {m.content}" for m in context_memories]) if context_memories else "No past context."

    state.status = "planned"
    try:
        plan_prompt = f"Create a step-by-step plan for the following request: '{request}'. Context:\n{context_str}"
        state.plan = llm.generate_json(plan_prompt, Plan)
    except Exception as e:
        state.status = "failed"
        state.final_result = f"Planning failed: {e}"
        return state

    for _ in range(MAX_ITERATIONS):
        state.iterations += 1
        
        exec_context = (
            f"Request: {request}\n"
            f"Plan: {state.plan.model_dump_json() if state.plan else ''}\n"
            f"Past Execution Steps: {state.execution_steps}\n"
            f"Available Tools: {list(TOOLS.keys())}\n"
            "If finished, set tool='none' and provide final_answer."
        )
        
        try:
            action = llm.generate_json(exec_context, ExecutorAction)
            step_record = {"action": action.model_dump()}
            
            if action.tool == "none":
                state.final_result = action.final_answer or "No answer provided."
                
                review_context = (
                    f"Original request: {request}\n"
                    f"Final result: {state.final_result}\n"
                    "Does this result fully satisfy the request? If not, reject with feedback."
                )
                review = llm.generate_json(review_context, ReviewResult)
                state.review = review
                step_record["review"] = review.model_dump()
                state.execution_steps.append(step_record)
                
                if review.approved:
                    state.status = "completed"
                    
                    # Auto write-back summary, filtering secrets
                    summary_prompt = f"Summarize the final result of this task for future reference. Do NOT include any API keys or secrets: {state.final_result}"
                    summary = llm.generate_text(summary_prompt)
                    if "[MOCK]" in summary or "secret" not in summary.lower():
                        provider.add_memory(MemoryItem(
                            project_id=project_id, type="session", content=summary, source="task_writeback", tags=["auto_summary"]
                        ))
                    return state
                else:
                    state.execution_steps.append({"feedback": review.feedback})
                    continue
            
            tool_result = execute_tool(action.tool, action.tool_input, project_id=project_id)
            step_record["tool_result"] = tool_result
            state.execution_steps.append(step_record)
            
        except Exception as e:
            state.execution_steps.append({"error": str(e)})
             
    state.status = "failed"
    state.final_result = "Max iterations reached without a successful review."
    return state
