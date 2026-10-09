import os
import sys
import json
from app.agents.llm import get_llm
from app.models.schemas import Plan
from app.agents.orchestrator import run_workflow
from app.memory.sqlite import get_memory_provider, SQLiteMemoryProvider
from app.memory.base import MemoryItem

def run_tests():
    print("Starting Live API Tests...")
    
    # Check A
    print("\nTest A - Direct model call")
    llm = get_llm()
    try:
        res = llm.generate_text("Respond with the exact phrase: HELLO_API")
        if "HELLO_API" in res:
            print("PASS - Direct call successful")
        else:
            print(f"FAIL - Unexpected response: {res}")
    except Exception as e:
        print(f"FAIL - {e}")

    # Check B
    print("\nTest B - Planner")
    try:
        plan = llm.generate_json("Plan to buy groceries", Plan)
        if len(plan.steps) > 0:
            print("PASS - Structured plan generated successfully")
        else:
            print("FAIL - Empty plan")
    except Exception as e:
        print(f"FAIL - {e}")
        
    # Check C & D
    print("\nTest C & D - Executor, Tools, and Reviewer")
    try:
        state = run_workflow("Calculate 347 * 829 using the calculator tool and provide the final answer.")
        
        tool_called = False
        valid_result = False
        for step in state.execution_steps:
            if step.get("action", {}).get("tool") == "calculator":
                tool_called = True
            if "287663" in str(step.get("tool_result", "")):
                valid_result = True
                
        if tool_called and valid_result and state.review and state.review.approved:
            print("PASS - Agent executed tool successfully and reviewer approved.")
        else:
            print(f"FAIL - State not met. Tool called: {tool_called}, Valid Result: {valid_result}, Review: {state.review.approved if state.review else None}")
            print(f"Trace details: {state.model_dump_json(indent=2)}")
    except Exception as e:
        print(f"FAIL - {e}")
        
    # Check E
    print("\nTest E - Persistent memory")
    try:
        provider = get_memory_provider()
        provider.add_memory(MemoryItem(type="global", content="Live memory test note", source="test"))
        
        # Test retrieval
        results = provider.search_memory("Live memory test note", None)
        if len(results) > 0:
            print("PASS - Memory persisted and retrieved successfully")
        else:
            print("FAIL - Memory not retrieved")
    except Exception as e:
         print(f"FAIL - {e}")

if __name__ == "__main__":
    run_tests()
