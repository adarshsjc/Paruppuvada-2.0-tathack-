/* =========================================================================
   Memory Management API client — every call maps 1:1 to a documented
   backend endpoint (see API_SPEC.md). SSE subscription falls back to
   polling the persisted event log so the UI never fakes live state.
   ========================================================================= */
import type {
  CurationAnalysis, CurationSuggestion, ExecutionEvent,
  ExpandResult, FailureEpisode, GraphNode, GraphOverview, GraphStats,
  RagDocument, RagResult, RecoveryProcedure, SelectionReport, SkillCategory,
  SkillInfo, TaskRun,
} from './types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1';

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error((detail as { detail?: string }).detail || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const get = <T,>(url: string): Promise<T> => fetch(url).then((r) => j<T>(r));
const post = <T,>(url: string, body?: unknown): Promise<T> =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then((r) => j<T>(r));
const del = <T,>(url: string): Promise<T> => fetch(url, { method: 'DELETE' }).then((r) => j<T>(r));

// ---------------------------------------------------------------- graph
export const fetchOverview = (projectId?: string | null): Promise<GraphOverview> =>
  get<GraphOverview>(`${API_BASE}/memory-graph/overview${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ''}`);

export const fetchNode = (nodeId: string): Promise<GraphNode> =>
  get<GraphNode>(`${API_BASE}/memory-graph/node/${encodeURIComponent(nodeId)}`);

export const fetchExpand = (nodeId: string, depth = 2, limit = 120): Promise<ExpandResult> =>
  get<ExpandResult>(`${API_BASE}/memory-graph/node/${encodeURIComponent(nodeId)}/expand?depth=${depth}&limit=${limit}`);

export const collapseNode = (nodeId: string): Promise<{ status: string; note: string }> =>
  post(`${API_BASE}/memory-graph/node/${encodeURIComponent(nodeId)}/collapse`);

export const archiveNode = (nodeId: string): Promise<{ status: string; note: string }> =>
  post(`${API_BASE}/memory-graph/node/${encodeURIComponent(nodeId)}/archive`);

export const restoreNode = (nodeId: string): Promise<{ status: string }> =>
  post(`${API_BASE}/memory-graph/node/${encodeURIComponent(nodeId)}/restore`);

export const deleteNode = (nodeId: string): Promise<{ status: string; note: string }> =>
  del(`${API_BASE}/memory-graph/node/${encodeURIComponent(nodeId)}`);

export const searchGraph = (
  q: string, types?: string[], projectId?: string | null, limit = 30,
): Promise<{ query: string; results: GraphNode[] }> => {
  const p = new URLSearchParams({ q, limit: String(limit) });
  if (types?.length) p.set('types', types.join(','));
  if (projectId) p.set('project_id', projectId);
  return get(`${API_BASE}/memory-graph/search?${p.toString()}`);
};

export const fetchGraphStats = (): Promise<GraphStats> =>
  get<GraphStats>(`${API_BASE}/memory-graph/stats`);

// ---------------------------------------------------------------- skills
export const fetchSkills = (projectId?: string | null): Promise<{ skills: SkillInfo[]; categories: SkillCategory[] }> =>
  get(`${API_BASE}/skills${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ''}`);

export const validateSelection = (skill_ids: string[], include_dependencies = true): Promise<SelectionReport> =>
  post(`${API_BASE}/skills/validate-selection`, { skill_ids, include_dependencies });

// ---------------------------------------------------------------- RAG
export const fetchRagDocuments = (projectId?: string | null): Promise<{ documents: RagDocument[]; retrieval_mode: string }> =>
  get(`${API_BASE}/rag/documents${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ''}`);

export const ragIngest = (name: string, content: string, projectId?: string | null): Promise<RagDocument> =>
  post(`${API_BASE}/rag/ingest`, { name, content, project_id: projectId || null });

export const ragQuery = (
  query: string, projectId?: string | null, channels?: string[], task_id?: string | null,
): Promise<RagResult> =>
  post(`${API_BASE}/rag/query`, {
    query, project_id: projectId || null, channels: channels ?? null,
    task_id: task_id ?? null, per_channel_limit: 5,
  });

// ---------------------------------------------------------------- tasks & events
export interface MemoryTaskSubmission {
  status: 'submitted';
  task_id: string;
  note: string;
}

export const submitMemoryTask = (
  description: string, projectId?: string | null,
  selection: { mode: 'auto' | 'selected'; skill_ids?: string[]; include_dependencies?: boolean } = { mode: 'auto' },
): Promise<MemoryTaskSubmission> =>
  post(`${API_BASE}/tasks/memory`, { description, project_id: projectId || null, selection });

export const fetchTasks = (limit = 50, projectId?: string | null): Promise<{ tasks: TaskRun[] }> =>
  get(`${API_BASE}/tasks?limit=${limit}${projectId ? `&project_id=${encodeURIComponent(projectId)}` : ''}`);

export const fetchTask = (taskId: string): Promise<TaskRun> =>
  get<TaskRun>(`${API_BASE}/tasks/${encodeURIComponent(taskId)}`);

export const fetchEvents = (since: number, taskId?: string | null, limit = 500): Promise<{ events: ExecutionEvent[]; latest_seq: number }> => {
  const p = new URLSearchParams({ since: String(since), limit: String(limit) });
  if (taskId) p.set('task_id', taskId);
  return get(`${API_BASE}/events?${p.toString()}`);
};

// ---------------------------------------------------------------- failures
export const fetchFailures = (limit = 100): Promise<{ failures: FailureEpisode[] }> =>
  get(`${API_BASE}/failures?limit=${limit}`);

export const fetchRecoveries = (limit = 100): Promise<{ recoveries: RecoveryProcedure[] }> =>
  get(`${API_BASE}/recoveries?limit=${limit}`);

// ---------------------------------------------------------------- curation
export const curationAnalyze = (): Promise<CurationAnalysis> =>
  post(`${API_BASE}/curation/analyze`);

export const fetchSuggestions = (status = 'proposed'): Promise<{ suggestions: CurationSuggestion[] }> =>
  get(`${API_BASE}/curation/suggestions?status=${status}`);

export const approveSuggestion = (id: string): Promise<{ status: string; applied: unknown }> =>
  post(`${API_BASE}/curation/suggestions/${encodeURIComponent(id)}/approve`);

export const rejectSuggestion = (id: string): Promise<{ status: string }> =>
  post(`${API_BASE}/curation/suggestions/${encodeURIComponent(id)}/reject`);

// ---------------------------------------------------------------- live events
export type LiveMode = 'sse' | 'polling';

export interface LiveSubscription {
  close(): void;
  mode(): LiveMode;
}

/**
 * Subscribe to execution events. Tries Server-Sent Events first and falls
 * back to polling the persisted event log. Only real persisted events are
 * ever delivered — the UI never animates from timers.
 */
export function subscribeLiveEvents(
  onEvent: (e: ExecutionEvent) => void,
  onMode: (mode: LiveMode) => void,
  taskId?: string | null,
): LiveSubscription {
  let closed = false;
  let mode: LiveMode = 'sse';
  let lastSeq = 0;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let es: EventSource | null = null;

  const startPolling = () => {
    if (closed || mode === 'polling') return;
    mode = 'polling';
    onMode(mode);
    pollTimer = setInterval(async () => {
      if (closed) return;
      try {
        const data = await fetchEvents(lastSeq, taskId);
        for (const e of data.events) {
          if ((e.seq ?? 0) > lastSeq) lastSeq = e.seq ?? 0;
          onEvent(e);
        }
      } catch {
        /* keep polling; transient backend hiccups must not fake state */
      }
    }, 1500);
  };

  const url = `${API_BASE}/events/stream${taskId ? `?task_id=${encodeURIComponent(taskId)}` : ''}`;
  try {
    es = new EventSource(url);
    es.onopen = () => { if (!closed) onMode('sse'); };
    es.onmessage = (msg) => {
      if (closed) return;
      try {
        const e = JSON.parse(msg.data) as ExecutionEvent;
        if ((e.seq ?? 0) > lastSeq) lastSeq = e.seq ?? 0;
        onEvent(e);
      } catch { /* ignore malformed frame */ }
    };
    es.onerror = () => {
      // EventSource retries on its own for transient errors; if it stays
      // broken (CLOSED), fall back to polling so the user still sees truth.
      if (es && es.readyState === 2 /* CLOSED */) startPolling();
    };
    // Give SSE a grace period; if nothing connects, poll instead.
    setTimeout(() => { if (!closed && es && es.readyState === 0) startPolling(); }, 4000);
  } catch {
    startPolling();
  }

  return {
    close() {
      closed = true;
      if (pollTimer) clearInterval(pollTimer);
      if (es) es.close();
    },
    mode: () => mode,
  };
}

/** Replay a historical task by feeding its persisted events to the same handler. */
export async function replayTaskEvents(
  taskId: string, onEvent: (e: ExecutionEvent) => void,
): Promise<ExecutionEvent[]> {
  const run = await fetchTask(taskId);
  const events = run.events ?? [];
  for (const e of events) onEvent(e);
  return events;
}
