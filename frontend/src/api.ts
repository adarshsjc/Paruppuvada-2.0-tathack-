import type { Project, MemoryItem, TaskState, StreamEvent } from './types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1';
const API_ROOT = API_BASE.replace(/\/api\/v1\/?$/, '');

export async function fetchHealth(): Promise<{ status: string; llm_mode: string; llm_model: string; agent_count: number }> {
  const res = await fetch(`${API_ROOT}/health`);
  if (!res.ok) throw new Error('Backend health check failed');
  return res.json();
}

export async function fetchProjects(includeDeleted = false): Promise<Project[]> {
  const url = includeDeleted ? `${API_BASE}/projects?include_deleted=true` : `${API_BASE}/projects`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch projects');
  return res.json();
}

export async function createProject(name: string): Promise<Project> {
  const res = await fetch(`${API_BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  if (!res.ok) throw new Error('Failed to create project');
  return res.json();
}

export async function deleteProject(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || 'Failed to move workspace to recycle bin');
  }
}

export async function restoreProject(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(id)}/restore`, { method: 'POST' });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || 'Failed to restore workspace');
  }
}

export async function purgeProject(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/projects/${encodeURIComponent(id)}/permanent`, { method: 'DELETE' });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || 'Failed to permanently delete workspace');
  }
}

export async function fetchMemory(projectId?: string): Promise<MemoryItem[]> {
  const url = projectId ? `${API_BASE}/memory?project_id=${projectId}` : `${API_BASE}/memory`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch memory');
  return res.json();
}

export async function submitTask(description: string, projectId?: string): Promise<{status: string, result: string, details: TaskState}> {
  const res = await fetch(`${API_BASE}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description, project_id: projectId || null })
  });
  if (!res.ok) {
     const error = await res.json().catch(() => ({detail: res.statusText}));
     throw new Error(error.detail || 'Failed to submit task');
  }
  return res.json();
}

export interface StreamTaskResult {
  status: string;
  result: string;
  details: TaskState;
}

/**
 * Submit a task to the SSE streaming endpoint. `onEvent` is invoked for every
 * progress event (agent thinking / finished, web search, judge, selection...).
 * Resolves once the stream completes with the final outcome.
 */
export async function streamTask(
  description: string,
  projectId?: string,
  onEvent?: (evt: StreamEvent) => void
): Promise<StreamTaskResult> {
  const res = await fetch(`${API_BASE}/tasks/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description, project_id: projectId || null })
  });
  if (!res.ok && res.status >= 400) {
    const error = await res.json().catch(() => ({detail: res.statusText}));
    throw new Error(error.detail || 'Failed to submit task');
  }
  if (!res.body) throw new Error('Streaming not supported by this browser');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let final: StreamTaskResult = { status: 'pending', result: '', details: { task_id: '', request: description, execution_steps: [], status: 'pending', iterations: 0 } };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      const line = frame.split('\n').find(l => l.startsWith('data: '));
      if (!line) continue;
      let evt: StreamEvent;
      try {
        evt = JSON.parse(line.slice(6));
      } catch {
        continue;
      }
      if (evt.event !== '__end__') {
        if (evt.state) {
          final = {
            status: evt.state.status || final.status,
            result: evt.state.final_result ?? final.result,
            details: evt.state,
          };
        }
        if (evt.event === 'error') {
          final = { ...final, status: 'failed', result: evt.error || evt.message || 'Task failed' };
        }
        onEvent?.(evt);
      }
    }
  }
  return final;
}
