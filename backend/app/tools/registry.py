from app.memory.sqlite import get_memory_provider
from app.memory.base import MemoryItem

class ToolException(Exception): pass

def calculator(expression: str) -> str:
    allowed_chars = set("0123456789+-*/(). ")
    if not set(expression).issubset(allowed_chars):
        raise ToolException("Invalid characters in expression")
    try:
        return str(eval(expression, {"__builtins__": None}, {}))
    except Exception as e:
        raise ToolException(f"Calculation error: {e}")

def save_memory(content: str, is_global: bool = False, tags: list = [], project_id: str = None) -> str:
    provider = get_memory_provider()
    m_type = "global" if is_global else "project"
    p_id = None if is_global else project_id
    provider.add_memory(MemoryItem(project_id=p_id, type=m_type, content=content, source="agent_tool", tags=tags))
    return f"Memory saved as {m_type}."

def search_memory(query: str, project_id: str = None) -> str:
    provider = get_memory_provider()
    items = provider.search_memory(query, project_id)
    if not items:
        return "No results."
    return "\n".join([f"[{i.type}] {i.content}" for i in items])

TOOLS = {
    "calculator": calculator,
    "save_memory": save_memory,
    "search_memory": search_memory
}

def execute_tool(name: str, args: dict, project_id: str = None) -> str:
    if name not in TOOLS: return f"Error: Tool '{name}' not found."
    try:
        if name in ["save_memory", "search_memory"]:
            args['project_id'] = project_id
        return TOOLS[name](**args)
    except Exception as e:
        return f"Error executing {name}: {e}"
