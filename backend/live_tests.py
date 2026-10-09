import os
import sys
import json

# Ensure UTF-8 output encoding on Windows consoles
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from app.agents.llm import get_llm
from app.models.schemas import Plan
from app.agents.orchestrator import run_workflow
from app.memory.sqlite import SQLiteMemoryProvider
from app.memory.base import MemoryItem

def run_tests():
    print("=" * 60)
    print("RUNNING LIVE OPENROUTER AGENT TESTS")
    print("=" * 60)
    
    # Test A: Real model connection
    print("\n[Test A] Real model connection")
    llm = get_llm()
    try:
        res = llm.generate_text("Respond with the exact phrase: HELLO_OPENROUTER")
        actual_model = getattr(llm, 'last_model_used', 'unknown')
        print(f"  Model selected by OpenRouter: {actual_model}")
        print(f"  Response: {res.strip()}")
        if "HELLO_OPENROUTER" in res or len(res.strip()) > 0:
            print("  Result: PASS - Real model connection established")
        else:
            print(f"  Result: FAIL - Unexpected response: {res}")
    except Exception as e:
        print(f"  Result: FAIL - Connection error: {e}")

    # Test B: Planner structured output
    print("\n[Test B] Planner (Structured JSON Output)")
    try:
        plan = llm.generate_json("Create a 3-step plan to organize a hackathon team workspace.", Plan)
        actual_model = getattr(llm, 'last_model_used', 'unknown')
        print(f"  Model selected: {actual_model}")
        print(f"  Generated {len(plan.steps)} steps:")
        for step in plan.steps:
            print(f"    - Step {step.id}: {step.goal} (Expected: {step.expected_output})")
        if len(plan.steps) > 0:
            print("  Result: PASS - Valid structured Plan schema generated")
        else:
            print("  Result: FAIL - Empty steps in plan")
    except Exception as e:
        print(f"  Result: FAIL - Plan generation failed: {e}")
        
    # Test C & D: Executor, Calculator Tool, and Reviewer
    print("\n[Test C & D] Executor, Calculator Tool, and Reviewer")
    print("  Task Prompt: 'Calculate 347 * 829 using the calculator tool and explain the result.'")
    try:
        state = run_workflow("Calculate 347 * 829 using the calculator tool and explain the result.")
        
        tool_called = False
        tool_result_verified = False
        calc_result_value = None
        
        for step in state.execution_steps:
            action = step.get("action", {})
            if action.get("tool") == "calculator":
                tool_called = True
            tool_res = str(step.get("tool_result", ""))
            if "287663" in tool_res:
                tool_result_verified = True
                calc_result_value = tool_res

        print(f"  Final State Status: {state.status}")
        print(f"  Tool 'calculator' invoked: {tool_called}")
        print(f"  Actual Tool Result captured: {calc_result_value}")
        print(f"  Final Result: {state.final_result}")
        if state.review:
            print(f"  Reviewer Status: Approved={state.review.approved}, Feedback: {state.review.feedback}")
        else:
            print("  Reviewer Status: Not reached or None")
            
        if tool_called and tool_result_verified:
            print("  [Test C] Result: PASS - Calculator tool executed and returned 287663")
        else:
            print(f"  [Test C] Result: FAIL - Tool execution evidence missing. (Called={tool_called}, Verified={tool_result_verified})")
            
        if state.review and state.review.approved:
            print("  [Test D] Result: PASS - Reviewer approved final result")
        else:
            print("  [Test D] Result: FAIL - Reviewer did not approve")
            
    except Exception as e:
        print(f"  Result: FAIL - Workflow failed: {e}")
        
    # Test E: Persistent Memory
    print("\n[Test E] Persistent SQLite Memory (Save, Re-open fresh instance, Retrieve)")
    test_db_path = "live_test_memory.db"
    try:
        if os.path.exists(test_db_path):
            os.remove(test_db_path)
            
        # Instance 1: write memory
        provider1 = SQLiteMemoryProvider(db_path=test_db_path)
        provider1.add_memory(MemoryItem(
            project_id="proj_alpha",
            type="project",
            content="Project Alpha key note: OpenRouter integration complete",
            source="manual_test",
            tags=["note", "openrouter"]
        ))
        
        # Instance 2: re-open fresh provider instance on the same db file (simulating backend restart)
        provider2 = SQLiteMemoryProvider(db_path=test_db_path)
        results = provider2.search_memory("OpenRouter integration", project_id="proj_alpha")
        
        if len(results) > 0 and "OpenRouter integration complete" in results[0].content:
            print(f"  Retrieved note: '{results[0].content}'")
            print("  Result: PASS - Memory persisted across backend restart")
        else:
            print(f"  Result: FAIL - Note not found in database: {results}")
    except Exception as e:
        print(f"  Result: FAIL - Memory test error: {e}")
    finally:
        if os.path.exists(test_db_path):
            try:
                os.remove(test_db_path)
            except Exception:
                pass

    print("\n" + "=" * 60)
    print("LIVE TESTS COMPLETED")
    print("=" * 60)

if __name__ == "__main__":
    run_tests()
