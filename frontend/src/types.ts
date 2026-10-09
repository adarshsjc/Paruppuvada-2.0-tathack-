export interface Project {
  id: string;
  name: string;
  deleted?: boolean;
}

export interface MemoryItem {
  id?: string;
  project_id?: string;
  type: string;
  content: string;
  source: string;
  tags: string[];
  timestamp?: string;
}

export interface TaskState {
  task_id: string;
  request: string;
  plan?: { steps: { id: number; goal: string; expected_output: string }[] };
  execution_steps: any[];
  final_result?: string;
  review?: { approved: boolean; feedback: string };
  status: string;
  iterations: number;
}

export interface StreamEvent {
  event: string;
  message?: string;
  agent?: number;
  role?: string;
  model?: string;
  solution?: string;
  error?: string;
  state?: TaskState;
}
