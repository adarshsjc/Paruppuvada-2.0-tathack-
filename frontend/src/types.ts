export interface Project {
  id: string;
  name: string;
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
