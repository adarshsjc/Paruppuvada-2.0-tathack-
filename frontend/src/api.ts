import type { Project, MemoryItem, TaskState } from './types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1';

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
