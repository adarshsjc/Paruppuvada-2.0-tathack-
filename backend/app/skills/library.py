"""Skill library: manifests, dependencies, permissions, canonical workflows.

A skill manifest is the *compact* record the router loads first; detailed
instructions / experiences / RAG passages are fetched on demand by the
execution engine, never all at once.

The sales-report skill carries a canonical workflow template so the 3B model
plans within validated degrees of freedom instead of improvising tool chains.
"""
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set

from app.graph.schema import EdgeType, GraphNode, NodeType, Provenance, CompressionState
from app.graph.store import GraphStore

STOPWORDS = {
    "the", "a", "an", "and", "or", "of", "to", "in", "for", "on", "with", "is",
    "are", "be", "by", "it", "this", "that", "from", "as", "at", "into", "please",
    "read", "produce", "generate", "create", "make", "using", "use", "my", "our",
}


def tokenize(text: str) -> List[str]:
    return [t for t in re.findall(r"[a-z0-9_.]+", text.lower()) if t not in STOPWORDS and len(t) > 1]


@dataclass
class WorkflowTemplateStep:
    step_id: str
    goal: str
    tool: str
    expected_output: str
    depends_on: List[str] = field(default_factory=list)
    retryable: bool = True
    permission: str = "workspace"  # workspace = read/write inside sandbox only


@dataclass
class SkillManifest:
    id: str                    # graph node id, e.g. "skill:csv-validation"
    name: str
    category_id: str
    description: str
    version: str = "1.0.0"
    prerequisites: List[str] = field(default_factory=list)   # skill ids (REQUIRES)
    allowed_tools: List[str] = field(default_factory=list)
    inputs: List[Dict[str, str]] = field(default_factory=list)
    outputs: List[Dict[str, str]] = field(default_factory=list)
    verification_rules: List[str] = field(default_factory=list)  # rule node ids
    keywords: List[str] = field(default_factory=list)
    instructions: str = ""      # loaded into context ONLY when the skill is executed
    canonical_workflow: Optional[List[WorkflowTemplateStep]] = None
    importance: float = 0.5


@dataclass
class Category:
    id: str
    name: str
    description: str


CATEGORIES = [
    Category("cat:data-reporting", "Data & Reporting",
             "CSV validation, aggregation, structured report generation and verification."),
    Category("cat:core-utilities", "Core Utilities",
             "Deterministic calculations and general-purpose helpers."),
    Category("cat:knowledge-memory", "Knowledge & Memory",
             "Persistent note-taking and memory retrieval capabilities."),
    Category("cat:web-research", "Web Research & Intelligence",
             "Live web searches, citation scraping, and multi-source evidence synthesis."),
    Category("cat:code-engineering", "Code & File Engineering",
             "Workspace file inspection, safe code refactoring, and automated test execution."),
    Category("cat:agent-orchestration", "Multi-Agent Ensemble",
             "DAG task decomposition, parallel solver ensemble, judge selection, and failure learning."),
]

SKILLS: List[SkillManifest] = [
    SkillManifest(
        id="skill:csv-validation", name="CSV Validation", category_id="cat:data-reporting",
        description="Reads a CSV file and validates schema: required columns, malformed rows, "
                    "type issues. Produces a structured validation report.",
        prerequisites=[], allowed_tools=["read_csv", "validate_csv"],
        inputs=[{"name": "path", "type": "string", "desc": "workspace-relative CSV path"}],
        outputs=[{"name": "validation_report", "type": "object"}],
        verification_rules=["rule:report_consistent"],
        keywords=["csv", "validate", "validation", "columns", "rows", "malformed", "schema", "sales"],
        instructions="Use read_csv to inspect the file, then validate_csv with the required "
                     "columns. Report missing columns and malformed rows precisely.",
        importance=0.8,
    ),
    SkillManifest(
        id="skill:revenue-aggregation", name="Revenue Aggregation", category_id="cat:data-reporting",
        description="Aggregates numeric CSV columns per group (e.g. revenue totals by product) "
                    "using deterministic Python, not LLM arithmetic.",
        prerequisites=["skill:csv-validation"],
        allowed_tools=["aggregate_csv", "read_csv"],
        inputs=[{"name": "path", "type": "string"}, {"name": "group_by", "type": "string"},
                {"name": "sum_columns", "type": "list[string]"}],
        outputs=[{"name": "totals", "type": "object"}],
        verification_rules=["rule:values_match_recompute"],
        keywords=["aggregate", "aggregation", "revenue", "totals", "sum", "by product", "group"],
        instructions="Only aggregate after validation passed. group_by/sum_columns must be "
                     "actual column names from the validation report.",
        importance=0.8,
    ),
    SkillManifest(
        id="skill:report-writing", name="Report Generation", category_id="cat:data-reporting",
        description="Writes structured JSON and Markdown reports from computed data inside the "
                    "workspace sandbox.",
        prerequisites=["skill:revenue-aggregation"],
        allowed_tools=["write_json", "write_markdown"],
        inputs=[{"name": "data", "type": "object"}, {"name": "paths", "type": "object"}],
        outputs=[{"name": "report.json", "type": "file"}, {"name": "report.md", "type": "file"}],
        verification_rules=["rule:file_exists", "rule:json_parses"],
        keywords=["report", "json", "markdown", "write", "generate", "produce"],
        instructions="JSON report must contain the totals object verbatim. Markdown must have "
                     "a heading per group and the numeric totals.",
        importance=0.75,
    ),
    SkillManifest(
        id="skill:report-verification", name="Report Verification", category_id="cat:data-reporting",
        description="Independently verifies generated artifacts: existence, JSON validity, and "
                    "that reported values match a recomputation from the source CSV.",
        prerequisites=["skill:report-writing"],
        allowed_tools=["verify_file_exists", "read_json"],
        inputs=[{"name": "paths", "type": "object"}, {"name": "source_csv", "type": "string"}],
        outputs=[{"name": "verdict", "type": "PASS|FAIL|INCONCLUSIVE"}],
        verification_rules=[],
        keywords=["verify", "verification", "check", "validate outputs", "confirm"],
        instructions="Recompute expected values from the CSV; never trust the report's own "
                     "numbers for verification.",
        importance=0.85,
    ),
    SkillManifest(
        id="skill:calculation", name="Calculation", category_id="cat:core-utilities",
        description="Evaluates arithmetic expressions with the sandboxed calculator tool.",
        prerequisites=[], allowed_tools=["calculator"],
        inputs=[{"name": "expression", "type": "string"}],
        outputs=[{"name": "result", "type": "number"}],
        verification_rules=[],
        keywords=["calculate", "calculation", "math", "multiply", "sum", "product", "*"],
        instructions="Pass a pure arithmetic expression; no variables.",
        importance=0.6,
    ),
    SkillManifest(
        id="skill:note-taking", name="Persistent Notes", category_id="cat:knowledge-memory",
        description="Saves durable notes to project or global memory with tags.",
        prerequisites=[], allowed_tools=["save_memory"],
        inputs=[{"name": "content", "type": "string"}, {"name": "is_global", "type": "bool"}],
        outputs=[{"name": "confirmation", "type": "string"}],
        verification_rules=[],
        keywords=["save", "note", "remember", "store", "memory"],
        instructions="Save concise factual notes with tags.",
        importance=0.5,
    ),
    SkillManifest(
        id="skill:memory-search", name="Memory Search", category_id="cat:knowledge-memory",
        description="Retrieves relevant memories (notes, experiences, failures) for a query.",
        prerequisites=[], allowed_tools=["search_memory"],
        inputs=[{"name": "query", "type": "string"}],
        outputs=[{"name": "matches", "type": "list"}],
        verification_rules=[],
        keywords=["search", "find", "recall", "lookup", "memory"],
        instructions="Search memory before answering knowledge questions.",
        importance=0.5,
    ),
    # --- Web Research Skills ---
    SkillManifest(
        id="skill:web-search", name="Web Search", category_id="cat:web-research",
        description="Executes live web search queries across search engines to retrieve authoritative documentation and facts.",
        prerequisites=[], allowed_tools=["web_search"],
        inputs=[{"name": "query", "type": "string"}],
        outputs=[{"name": "results", "type": "list[dict]"}],
        verification_rules=["rule:sources_cited"],
        keywords=["search", "web", "internet", "google", "bing", "lookup", "documentation", "latest"],
        instructions="Query specific factual search phrases and evaluate domain credibility.",
        importance=0.8,
    ),
    SkillManifest(
        id="skill:content-extraction", name="Content Extraction", category_id="cat:web-research",
        description="Extracts and cleans HTML web articles, documentation pages, and raw text feeds into readable markdown.",
        prerequisites=["skill:web-search"], allowed_tools=["scrape_web_page"],
        inputs=[{"name": "url", "type": "string"}],
        outputs=[{"name": "content", "type": "string"}],
        verification_rules=[],
        keywords=["scrape", "extract", "url", "article", "page", "content", "html"],
        instructions="Strip extraneous script tags and ads, returning structured content sections.",
        importance=0.7,
    ),
    SkillManifest(
        id="skill:research-synthesis", name="Research Synthesis", category_id="cat:web-research",
        description="Synthesizes findings across multiple web sources, compares competing perspectives, and compiles cited summaries.",
        prerequisites=["skill:content-extraction"], allowed_tools=["write_markdown"],
        inputs=[{"name": "sources", "type": "list"}, {"name": "topic", "type": "string"}],
        outputs=[{"name": "synthesis_report.md", "type": "file"}],
        verification_rules=["rule:sources_cited", "rule:file_exists"],
        keywords=["synthesize", "synthesis", "research", "compare", "summary", "citations"],
        instructions="Cite every claim with its source URL and highlight any conflicting information.",
        importance=0.85,
    ),
    # --- Code & File Engineering Skills ---
    SkillManifest(
        id="skill:file-inspection", name="File Inspection", category_id="cat:code-engineering",
        description="Inspects project files, directories, dependencies, and code structure inside the workspace.",
        prerequisites=[], allowed_tools=["read_file", "list_directory"],
        inputs=[{"name": "path", "type": "string"}],
        outputs=[{"name": "file_data", "type": "string"}],
        verification_rules=[],
        keywords=["file", "read", "inspect", "directory", "folder", "list", "code", "tree"],
        instructions="Check file presence and read key configuration and code segments.",
        importance=0.75,
    ),
    SkillManifest(
        id="skill:code-refactoring", name="Code Refactoring", category_id="cat:code-engineering",
        description="Applies precise, targeted code modifications and refactoring with integrity protection.",
        prerequisites=["skill:file-inspection"], allowed_tools=["write_file", "read_file"],
        inputs=[{"name": "path", "type": "string"}, {"name": "edits", "type": "string"}],
        outputs=[{"name": "diff_summary", "type": "string"}],
        verification_rules=["rule:syntax_valid", "rule:file_exists"],
        keywords=["edit", "modify", "code", "refactor", "patch", "write", "fix"],
        instructions="Ensure backward compatibility, preserve comments, and avoid introducing syntax errors.",
        importance=0.85,
    ),
    SkillManifest(
        id="skill:automated-testing", name="Automated Testing", category_id="cat:code-engineering",
        description="Runs automated test suites to verify that bug fixes and features pass all assertions.",
        prerequisites=["skill:code-refactoring"], allowed_tools=["run_tests"],
        inputs=[{"name": "test_path", "type": "string"}],
        outputs=[{"name": "test_results", "type": "object"}],
        verification_rules=["rule:tests_pass"],
        keywords=["test", "pytest", "tests", "unit test", "verify", "assertions", "pass"],
        instructions="Execute pytest or npm test and parse failing assertion tracebacks.",
        importance=0.9,
    ),
    # --- Agent Orchestration & Self-Reflection Skills ---
    SkillManifest(
        id="skill:task-decomposition", name="Task Decomposition", category_id="cat:agent-orchestration",
        description="Breaks ambiguous, multi-step requests into an optimal DAG plan with clear inputs and outputs.",
        prerequisites=[], allowed_tools=["decompose_task"],
        inputs=[{"name": "goal", "type": "string"}],
        outputs=[{"name": "plan_dag", "type": "object"}],
        verification_rules=[],
        keywords=["decompose", "plan", "dag", "steps", "tasks", "subtasks", "breakdown"],
        instructions="Order tasks topologically with strict dependency links and verifiable acceptance criteria.",
        importance=0.8,
    ),
    SkillManifest(
        id="skill:parallel-ensemble", name="Parallel Ensemble", category_id="cat:agent-orchestration",
        description="Coordinates multiple specialized solution agents (Direct Solver, Critical Thinker, Synthesizer) concurrently.",
        prerequisites=["skill:task-decomposition"], allowed_tools=["ensemble_solve"],
        inputs=[{"name": "prompt", "type": "string"}, {"name": "roles", "type": "list[string]"}],
        outputs=[{"name": "candidates", "type": "list[dict]"}],
        verification_rules=[],
        keywords=["parallel", "ensemble", "agents", "candidates", "multi-agent", "concurrent"],
        instructions="Run diverse agent personas to explore different angles and catch edge cases.",
        importance=0.85,
    ),
    SkillManifest(
        id="skill:judge-evaluation", name="Judge Evaluation", category_id="cat:agent-orchestration",
        description="Critically grades candidate agent outputs against acceptance criteria and selects the best answer.",
        prerequisites=["skill:parallel-ensemble"], allowed_tools=["judge_selection"],
        inputs=[{"name": "candidates", "type": "list"}],
        outputs=[{"name": "selected_solution", "type": "string"}],
        verification_rules=["rule:judge_consensus"],
        keywords=["judge", "evaluate", "select", "grade", "score", "rubric", "verdict"],
        instructions="Score completeness, soundness, and factual accuracy. Provide transparent rationale.",
        importance=0.9,
    ),
    SkillManifest(
        id="skill:failure-reflection", name="Failure Reflection", category_id="cat:agent-orchestration",
        description="Diagnoses execution tool errors, identifies root cause signatures, and stores validated recovery paths.",
        prerequisites=["skill:judge-evaluation"], allowed_tools=["record_failure"],
        inputs=[{"name": "error_log", "type": "string"}],
        outputs=[{"name": "recovery_id", "type": "string"}],
        verification_rules=[],
        keywords=["failure", "error", "reflect", "recover", "diagnosis", "learn", "fix"],
        instructions="Extract minimal error signatures and map them to actionable retry strategies.",
        importance=0.85,
    ),
]

WORKFLOWS = [
    {
        "id": "workflow:sales-report",
        "name": "Sales Report Workflow",
        "category_id": "cat:data-reporting",
        "description": "Validate a sales CSV, compute revenue totals by product, write "
                       "report.json + report.md, and verify both artifacts independently.",
        "skill_ids": ["skill:csv-validation", "skill:revenue-aggregation",
                      "skill:report-writing", "skill:report-verification"],
        "importance": 0.9,
    },
    {
        "id": "workflow:web-research",
        "name": "Autonomous Web Research",
        "category_id": "cat:web-research",
        "description": "Execute live search, extract article content, synthesize evidence, and verify source citations.",
        "skill_ids": ["skill:web-search", "skill:content-extraction", "skill:research-synthesis"],
        "importance": 0.88,
    },
    {
        "id": "workflow:code-evolution",
        "name": "Code Evolution & Test Loop",
        "category_id": "cat:code-engineering",
        "description": "Inspect project workspace, refactor implementation, and execute automated tests to verify passes.",
        "skill_ids": ["skill:file-inspection", "skill:code-refactoring", "skill:automated-testing"],
        "importance": 0.92,
    },
    {
        "id": "workflow:multi-agent-solve",
        "name": "Ensemble Problem Solving",
        "category_id": "cat:agent-orchestration",
        "description": "Decompose high-level goal, solve concurrently via parallel agents, judge best candidate, and learn from mistakes.",
        "skill_ids": ["skill:task-decomposition", "skill:parallel-ensemble", "skill:judge-evaluation", "skill:failure-reflection"],
        "importance": 0.95,
    },
]

# Canonical workflow template for the sales-report capability. The engine
# enforces order/permissions; Qwen fills the free parameters (paths, keys).
SALES_REPORT_TEMPLATE: List[WorkflowTemplateStep] = [
    WorkflowTemplateStep(
        step_id="validate_csv", goal="Validate the input CSV schema and rows",
        tool="validate_csv", expected_output="validation report with valid flag and issues",
        depends_on=[], retryable=True,
    ),
    WorkflowTemplateStep(
        step_id="aggregate_revenue", goal="Compute revenue totals per product",
        tool="aggregate_csv", expected_output="totals mapping product -> revenue",
        depends_on=["validate_csv"], retryable=True,
    ),
    WorkflowTemplateStep(
        step_id="write_report_json", goal="Write report.json with the computed totals",
        tool="write_json", expected_output="report.json file in workspace",
        depends_on=["aggregate_revenue"], retryable=True,
    ),
    WorkflowTemplateStep(
        step_id="write_report_md", goal="Write report.md summarizing the totals",
        tool="write_markdown", expected_output="report.md file in workspace",
        depends_on=["aggregate_revenue"], retryable=True,
    ),
    WorkflowTemplateStep(
        step_id="verify_outputs", goal="Independently verify both reports against the CSV",
        tool="__verify__", expected_output="verdict PASS/FAIL/INCONCLUSIVE with evidence",
        depends_on=["write_report_json", "write_report_md"], retryable=False,
    ),
]

VERIFICATION_RULES = [
    {"id": "rule:file_exists", "name": "Artifact exists",
     "description": "The declared output file exists on disk."},
    {"id": "rule:json_parses", "name": "JSON parses",
     "description": "The JSON artifact parses without error."},
    {"id": "rule:values_match_recompute", "name": "Values match recomputation",
     "description": "Reported aggregates equal a fresh recomputation from the source data."},
    {"id": "rule:report_consistent", "name": "Report internally consistent",
     "description": "Validation report flags match the actual file contents."},
    {"id": "rule:sources_cited", "name": "Sources cited",
     "description": "Every factual statement references an accessible source link."},
    {"id": "rule:syntax_valid", "name": "Syntax valid",
     "description": "Generated code compiles and has valid syntax."},
    {"id": "rule:tests_pass", "name": "Tests pass",
     "description": "All automated unit tests execute with zero failures."},
    {"id": "rule:judge_consensus", "name": "Judge consensus",
     "description": "Winning candidate is verified by multi-criteria rubric scoring."},
]

_TOOL_DESCRIPTIONS = {
    "calculator": "Sandboxed arithmetic evaluator",
    "save_memory": "Persist a note to project/global memory",
    "search_memory": "Keyword search over stored memories",
    "read_csv": "Read a CSV inside the workspace sandbox",
    "validate_csv": "Validate CSV schema and rows",
    "aggregate_csv": "Deterministic group-by aggregation over CSV columns",
    "write_json": "Write a JSON file inside the workspace sandbox",
    "write_markdown": "Write a Markdown file inside the workspace sandbox",
    "verify_file_exists": "Check a file exists in the workspace",
    "read_json": "Parse a JSON file from the workspace",
    "web_search": "Query live search sources for relevant documentation and facts",
    "scrape_web_page": "Extract clean text content and remove markup from a target URL",
    "read_file": "Read source code or text files within the workspace sandbox",
    "write_file": "Write source code or text files within the workspace sandbox",
    "list_directory": "List contents and hierarchy of the workspace sandbox directory",
    "run_tests": "Run automated unit test checks inside the sandboxed environment",
    "decompose_task": "Deconstruct high-level user requests into DAG execution steps",
    "ensemble_solve": "Execute parallel candidate solvers across independent agent perspectives",
    "judge_selection": "Critically evaluate candidate solutions and pick the optimal output",
    "record_failure": "Document execution failure modes and index recovery paths",
}

SKILL_BY_ID: Dict[str, SkillManifest] = {s.id: s for s in SKILLS}


def sales_report_skill() -> SkillManifest:
    """The composed sales-report capability: a virtual skill whose manifest is
    the union of the four data-reporting skills and whose workflow is canonical."""
    base = SKILL_BY_ID["skill:report-verification"]
    return SkillManifest(
        id="skill:sales-report", name="Sales Report", category_id="cat:data-reporting",
        description="End-to-end: validate sales CSV → compute revenue totals by product → "
                    "write report.json + report.md → verify both artifacts.",
        version="1.0.0",
        prerequisites=[],
        allowed_tools=sorted({t for s in SKILLS if s.id in WORKFLOWS[0]["skill_ids"]
                              for t in s.allowed_tools} | {"__verify__"}),
        inputs=[{"name": "csv_path", "type": "string"}],
        outputs=[{"name": "report.json", "type": "file"}, {"name": "report.md", "type": "file"}],
        verification_rules=["rule:file_exists", "rule:json_parses", "rule:values_match_recompute"],
        keywords=["sales", "csv", "revenue", "totals", "product", "report", "report.json",
                  "report.md", "verify"],
        instructions="Follow the canonical workflow exactly; do not skip verification.",
        canonical_workflow=SALES_REPORT_TEMPLATE,
        importance=0.95,
    )


def all_capabilities() -> List[SkillManifest]:
    return SKILLS + [sales_report_skill()]


def capability_by_id(cap_id: str) -> Optional[SkillManifest]:
    if cap_id == "skill:sales-report":
        return sales_report_skill()
    return SKILL_BY_ID.get(cap_id)


def requires_closure(skill_ids: List[str]) -> Set[str]:
    """Mandatory dependencies via REQUIRES, transitively."""
    result: Set[str] = set()
    stack = list(skill_ids)
    while stack:
        sid = stack.pop()
        if sid in result:
            continue
        result.add(sid)
        skill = SKILL_BY_ID.get(sid)
        if skill:
            stack.extend(skill.prerequisites)
    return result


def validate_selection(skill_ids: List[str], include_dependencies: bool = True) -> Dict[str, Any]:
    """Validate a selected-skills scope. Reports missing mandatory prerequisites
    instead of silently widening or breaking the scope."""
    known = set(SKILL_BY_ID) | {"skill:sales-report"}
    unknown = [s for s in skill_ids if s not in known]
    resolved = set(skill_ids) & known
    missing: Set[str] = set()
    if include_dependencies:
        resolved = requires_closure(sorted(resolved))
    else:
        for sid in resolved:
            missing |= set(SKILL_BY_ID[sid].prerequisites) - resolved if sid in SKILL_BY_ID else set()
    return {
        "selected": sorted(set(skill_ids)),
        "resolved": sorted(resolved),
        "unknown": unknown,
        "missing_dependencies": sorted(missing),
        "allowed_tools": sorted({t for sid in resolved
                                 for t in (capability_by_id(sid).allowed_tools
                                           if capability_by_id(sid) else [])}),
        "ok": not unknown and not missing,
    }


def rank_skills(query: str, top_k: int = 5) -> List[Dict[str, Any]]:
    """Deterministic keyword ranking of capabilities for auto mode."""
    q_tokens = set(tokenize(query))
    scored = []
    for cap in all_capabilities():
        text = " ".join([cap.name, cap.description, " ".join(cap.keywords)])
        s_tokens = set(tokenize(text)) | set(cap.keywords)
        overlap = q_tokens & s_tokens
        score = len(overlap) / (len(q_tokens) + 1) + cap.importance * 0.1
        if overlap:
            scored.append({"skill_id": cap.id, "name": cap.name, "score": round(score, 4),
                           "matched": sorted(overlap)})
    scored.sort(key=lambda x: (-x["score"], x["name"]))
    return scored[:top_k]


def seed_graph(store: GraphStore) -> Dict[str, int]:
    """Idempotently install categories, tools, skills, workflows, verification
    rules and their explicit edges into the graph store."""
    created_nodes = 0
    created_edges = 0

    def upsert(node: GraphNode):
        nonlocal created_nodes
        store.upsert_node(node)
        created_nodes += 1

    for cat in CATEGORIES:
        upsert(GraphNode(
            id=cat.id, node_type=NodeType.CATEGORY, label=cat.name, description=cat.description,
            compression_state=CompressionState.SUMMARY_STORED, importance=0.7,
        ))

    for tool, desc in _TOOL_DESCRIPTIONS.items():
        upsert(GraphNode(
            id=f"tool:{tool}", node_type=NodeType.TOOL, label=tool, description=desc,
            compression_state=CompressionState.DETAIL_DEFERRED, importance=0.6,
        ))

    for rule in VERIFICATION_RULES:
        upsert(GraphNode(
            id=rule["id"], node_type=NodeType.VERIFICATION_RULE, label=rule["name"],
            description=rule["description"], importance=0.6,
        ))

    for skill in all_capabilities():
        upsert(GraphNode(
            id=skill.id, node_type=NodeType.SKILL, label=skill.name,
            description=skill.description, parent_id=skill.category_id,
            compression_state=CompressionState.COLLAPSED,
            importance=skill.importance,
            metadata={
                "version": skill.version,
                "allowed_tools": skill.allowed_tools,
                "inputs": skill.inputs, "outputs": skill.outputs,
                "verification_rules": skill.verification_rules,
                "keywords": skill.keywords,
                "has_canonical_workflow": skill.canonical_workflow is not None,
                "source": "seed:v1",
            },
        ))
        store.upsert_edge(skill.category_id, skill.id, EdgeType.CONTAINS, Provenance.EXPLICIT)
        for tool in skill.allowed_tools:
            if tool != "__verify__":
                store.upsert_edge(skill.id, f"tool:{tool}", EdgeType.CALLS, Provenance.EXPLICIT)
                created_edges += 1
        for rule_id in skill.verification_rules:
            store.upsert_edge(skill.id, rule_id, EdgeType.VERIFIED_BY, Provenance.EXPLICIT)
            created_edges += 1
        for pre in skill.prerequisites:
            store.upsert_edge(skill.id, pre, EdgeType.REQUIRES, Provenance.EXPLICIT)
            created_edges += 1

    for wf in WORKFLOWS:
        cat_id = wf.get("category_id", "cat:data-reporting")
        upsert(GraphNode(
            id=wf["id"], node_type=NodeType.WORKFLOW, label=wf["name"],
            description=wf["description"], parent_id=cat_id,
            compression_state=CompressionState.SUMMARY_STORED, importance=wf["importance"],
            metadata={"skills": wf["skill_ids"]},
        ))
        store.upsert_edge(cat_id, wf["id"], EdgeType.CONTAINS, Provenance.EXPLICIT)
        for sid in wf["skill_ids"]:
            store.upsert_edge(wf["id"], sid, EdgeType.CONTAINS, Provenance.EXPLICIT)
            created_edges += 1

    return {"nodes_touched": created_nodes, "edges_touched": created_edges}
