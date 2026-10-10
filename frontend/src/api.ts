import type { Project, MemoryItem, TaskState } from './types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1';
const API_ROOT = API_BASE.replace(/\/api\/v1\/?$/, '');

export async function fetchHealth(): Promise<{ status: string; llm_mode: string; agent_count: number }> {
  const res = await fetch(`${API_ROOT}/health`);
  if (!res.ok) throw new Error('Backend health check failed');
  return res.json();
}

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch(`${API_BASE}/projects`);
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

export async function fetchMemory(projectId?: string, query?: string): Promise<MemoryItem[]> {
  let url = `${API_BASE}/memory`;
  const params = new URLSearchParams();
  if (projectId) params.append('project_id', projectId);
  if (query) params.append('q', query);
  const qStr = params.toString();
  if (qStr) url += `?${qStr}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch memory');
  return res.json();
}

export async function addMemory(item: { content: string; type: string; source: string; tags: string[]; project_id?: string }): Promise<MemoryItem> {
  const res = await fetch(`${API_BASE}/memory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item)
  });
  if (!res.ok) throw new Error('Failed to save memory item');
  return res.json();
}

export async function deleteMemory(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/memory/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete memory item');
}

export async function pingBackend(): Promise<{ status: string; latencyMs: number; provider?: string; model?: string }> {
  const rootUrl = API_BASE.replace('/api/v1', '');
  const start = performance.now();
  const res = await fetch(`${rootUrl}/health`);
  const latencyMs = Math.round(performance.now() - start);
  if (!res.ok) throw new Error('Health check failed');
  const data = await res.json();
  return { status: data.status, latencyMs, provider: data.provider, model: data.model };
}

export async function submitTask(
  description: string, 
  projectId?: string, 
  selectedSkills?: string[], 
  mode: 'simple' | 'complex' = 'simple'
): Promise<{status: string, result: string, details: TaskState}> {
  const res = await fetch(`${API_BASE}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      description, 
      project_id: projectId || null, 
      selected_skills: selectedSkills,
      mode 
    })
  });
  if (!res.ok) {
     const error = await res.json().catch(() => ({detail: res.statusText}));
     throw new Error(error.detail || 'Failed to submit task');
  }
  return res.json();
}

