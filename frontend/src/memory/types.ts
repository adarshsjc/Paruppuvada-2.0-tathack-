/* =========================================================================
   Memory graph types — mirror of backend/app/graph/schema.py and the
   memory API payloads. Keep in sync with backend (see ../API_SPEC.md).
   ========================================================================= */

export type NodeType =
  | 'project' | 'category' | 'skill' | 'tool' | 'workflow' | 'document'
  | 'knowledge' | 'experience' | 'failure' | 'recovery' | 'verification_rule'
  | 'execution_step' | 'memory_summary' | 'source' | 'task';

export type EdgeType =
  | 'CONTAINS' | 'REQUIRES' | 'CALLS' | 'RELATED_TO' | 'BELONGS_TO'
  | 'DERIVED_FROM' | 'USES_SKILL' | 'FAILED_DUE_TO' | 'RECOVERS_WITH'
  | 'VERIFIED_BY' | 'LEARNED_FROM' | 'CONFLICTS_WITH';

export type Provenance = 'EXPLICIT' | 'EXTRACTED' | 'INFERRED' | 'USER_APPROVED';

export type CompressionState =
  | 'EXPANDED' | 'COLLAPSED' | 'SUMMARY_STORED' | 'DETAIL_DEFERRED'
  | 'ARCHIVED' | 'DELETED';

export type EventTypeValue =
  | 'TASK_STARTED' | 'SKILL_RETRIEVED' | 'DEPENDENCY_RESOLVED'
  | 'KNOWLEDGE_RETRIEVED' | 'PLAN_READY' | 'TOOL_STARTED' | 'TOOL_COMPLETED'
  | 'VERIFICATION_PASSED' | 'VERIFICATION_FAILED' | 'RECOVERY_STARTED'
  | 'RETRY_SCHEDULED' | 'TASK_COMPLETED' | 'TASK_FAILED' | 'TASK_BLOCKED';

export interface GraphNode {
  id: string;
  node_type: NodeType;
  label: string;
  description: string;
  project_id?: string | null;
  scope: 'global' | 'project';
  status: string;
  compression_state: CompressionState;
  parent_id?: string | null;
  metadata: Record<string, unknown>;
  importance: number;
  access_count: number;
  child_count: number;
  created_at?: string | null;
  updated_at?: string | null;
  // present only on GET /memory-graph/node/{id}:
  edges?: NodeEdgeView[];
  recent_executions?: { task_id: string; status: string; started_at: string; verdict?: string }[];
  episode?: Record<string, unknown>;
}

export interface NodeEdgeView extends GraphEdge {
  source_label?: string;
  target_label?: string;
}

export interface GraphEdge {
  id: string;
  source_id: string;
  target_id: string;
  edge_type: EdgeType;
  provenance: Provenance;
  weight: number;
  metadata: Record<string, unknown>;
  created_at?: string | null;
}

export interface ExecutionEvent {
  seq?: number;
  event_id: string;
  task_id?: string | null;
  step_id?: string | null;
  node_id?: string | null;
  edge_id?: string | null;
  event_type: EventTypeValue;
  status: string;
  message: string;
  payload: Record<string, unknown>;
  created_at?: string | null;
}

export interface GraphOverview {
  roots: GraphNode[];
  nodes?: GraphNode[];
  edges?: GraphEdge[];
  type_counts: Partial<Record<NodeType, number>>;
  detail_counts: Partial<Record<NodeType, number>>;
  edge_count: number;
  generated_at: string;
}

export interface ExpandResult {
  center: GraphNode | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphStats {
  nodes: number;
  edges: number;
  events?: number;
  tasks?: number;
  failures?: number;
  [k: string]: unknown;
}

export interface SkillInfo {
  id: string;
  name: string;
  category_id: string;
  description: string;
  version: string;
  prerequisites: string[];
  allowed_tools: string[];
  keywords: string[];
  has_canonical_workflow: boolean;
  child_count: number;
  importance: number;
}

export interface SkillCategory { id: string; name: string; description: string; }

export interface SelectionReport {
  selected: string[];
  resolved: string[];
  unknown: string[];
  missing_dependencies: string[];
  allowed_tools: string[];
  ok: boolean;
}

export interface RagDocument {
  id: string;
  project_id?: string | null;
  name: string;
  path?: string | null;
  mime: string;
  ingested_at: string;
  metadata: Record<string, unknown>;
  chunk_count: number;
}

export interface RagItem {
  channel: 'knowledge' | 'skill' | 'experience' | 'state';
  score: number;
  reason: string;
  preview: string;
  node_id?: string | null;
  document_id?: string | null;
  chunk_id?: string | null;
  task_id?: string | null;
  content: string;
  metadata: Record<string, unknown>;
}

export interface RagResult {
  query: string;
  mode: 'keyword' | 'embedding';
  channels: string[];
  budget_chars: number;
  used_chars: number;
  truncated: number;
  items: RagItem[];
}

export interface TaskRun {
  task_id: string;
  request: string;
  project_id?: string | null;
  status: 'running' | 'completed' | 'failed' | 'blocked' | string;
  skill_selection: { mode?: 'auto' | 'selected'; skill_ids?: string[]; [k: string]: unknown };
  plan: {
    steps?: PlanStep[];
    params?: Record<string, unknown>;
    fallback_reason?: string | null;
    outputs?: Record<string, unknown>;
    skills_used?: string[];
    [k: string]: unknown;
  };
  result: {
    final_result?: string;
    verification?: VerificationReport;
    selection_report?: SelectionReport;
    [k: string]: unknown;
  };
  model_id: string;
  started_at: string;
  finished_at?: string | null;
  events?: ExecutionEvent[];
}

export interface PlanStep {
  step_id: string;
  goal: string;
  tool: string;
  expected_output: string;
  depends_on: string[];
  state?: string;
  error?: string | null;
  node_id?: string | null;
  attempts?: number;
  skill_id?: string | null;
}

export interface VerificationCheck {
  rule: string;
  description: string;
  verdict: 'PASS' | 'FAIL' | 'INCONCLUSIVE' | string;
  evidence: Record<string, unknown>;
}

export interface VerificationReport {
  verdict: 'PASS' | 'FAIL' | 'INCONCLUSIVE' | string;
  checks: VerificationCheck[];
  summary?: string;
}

export interface FailureEpisode {
  id: string;
  task_id?: string | null;
  step_id?: string | null;
  skill_id?: string | null;
  tool?: string | null;
  error_signature: string;
  error_text: string;
  evidence: Record<string, unknown>;
  diagnosis_status: 'hypothesized' | 'verified' | string;
  recovery_procedure_id?: string | null;
  verification: string;
  created_at: string;
}

export interface RecoveryProcedure {
  id: string;
  error_signature: string;
  description: string;
  steps: string[];
  attempt_count: number;
  success_count: number;
  status: 'candidate' | 'validated' | string;
  created_at?: string;
}

export interface CurationSuggestion {
  id: string;
  kind: string;
  node_ids: string[];
  detail: Record<string, unknown>;
  status: string;
  created_at?: string;
}

export interface CurationAnalysis {
  suggestions?: CurationSuggestion[];
  [k: string]: unknown;
}

export const EVENT_COLORS: Record<EventTypeValue, string> = {
  TASK_STARTED: '#2563eb',
  SKILL_RETRIEVED: '#7c3aed',
  DEPENDENCY_RESOLVED: '#0ea5e9',
  KNOWLEDGE_RETRIEVED: '#0d9488',
  PLAN_READY: '#4f46e5',
  TOOL_STARTED: '#d97706',
  TOOL_COMPLETED: '#10b981',
  VERIFICATION_PASSED: '#10b981',
  VERIFICATION_FAILED: '#ef4444',
  RECOVERY_STARTED: '#f59e0b',
  RETRY_SCHEDULED: '#f59e0b',
  TASK_COMPLETED: '#059669',
  TASK_FAILED: '#dc2626',
  TASK_BLOCKED: '#d97706',
};

export const NODE_COLORS: Record<NodeType, string> = {
  project: '#2563eb',
  category: '#6366f1',
  skill: '#7c3aed',
  tool: '#0891b2',
  workflow: '#4f46e5',
  document: '#0d9488',
  knowledge: '#0ea5e9',
  experience: '#10b981',
  failure: '#ef4444',
  recovery: '#f59e0b',
  verification_rule: '#059669',
  execution_step: '#64748b',
  memory_summary: '#8b5cf6',
  source: '#64748b',
  task: '#db2777',
};

export const NODE_TYPE_LABELS: Record<NodeType, string> = {
  project: 'Project', category: 'Category', skill: 'Skill', tool: 'Tool',
  workflow: 'Workflow', document: 'Document', knowledge: 'Knowledge',
  experience: 'Experience', failure: 'Failure', recovery: 'Recovery',
  verification_rule: 'Verification rule', execution_step: 'Execution step',
  memory_summary: 'Memory summary', source: 'Source', task: 'Task',
};
