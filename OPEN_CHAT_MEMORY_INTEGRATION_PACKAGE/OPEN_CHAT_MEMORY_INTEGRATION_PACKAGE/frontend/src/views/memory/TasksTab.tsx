/* =========================================================================
   TasksTab.tsx — execution history + replay. Selecting a task loads its
   persisted run and event log from the backend; "Replay in graph" feeds
   the stored events to the graph one by one (play/pause/scrub) so past
   workflows can be reconstructed exactly as they happened.
   ========================================================================= */
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Clock, Play, Pause, RotateCcw, ShieldCheck, XCircle } from 'lucide-react';
import * as api from '../../memory/api';
import type { ExecutionEvent, TaskRun, VerificationReport } from '../../memory/types';
import { EVENT_COLORS } from '../../memory/types';

interface Props {
  onReplayInGraph: (taskId: string, events: ExecutionEvent[]) => void;
  refreshKey?: number;
  focusTaskId?: string | null;
}

export default function TasksTab({ onReplayInGraph, refreshKey, focusTaskId }: Props) {
  const [tasks, setTasks] = useState<TaskRun[]>([]);
  const [selected, setSelected] = useState<TaskRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(false);
  const [cursor, setCursor] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = () => {
    setLoading(true);
    api.fetchTasks(50)
      .then((d) => { setTasks(d.tasks); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, [refreshKey]);

  // focus a task coming from another tab (e.g. failure episode → inspect task)
  useEffect(() => {
    if (!focusTaskId) return;
    api.fetchTask(focusTaskId).then((t) => { setSelected(t); setCursor(0); setPlaying(false); })
      .catch(() => {});
  }, [focusTaskId]);

  const select = (t: TaskRun) => {
    setSelected(t);
    setPlaying(false);
    setCursor(0);
    api.fetchTask(t.task_id)
      .then((full) => setSelected(full))
      .catch(() => { /* list row already has summary data */ });
  };

  const events = selected?.events ?? [];

  const stopTimer = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
  useEffect(() => () => stopTimer(), []);

  const togglePlay = () => {
    if (!selected) return;
    if (playing) { setPlaying(false); stopTimer(); return; }
    if (cursor >= events.length) setCursor(0);
    setPlaying(true);
    stopTimer();
    timer.current = setInterval(() => {
      setCursor((c) => {
        if (c >= events.length) { stopTimer(); setPlaying(false); return c; }
        return c + 1;
      });
    }, 650);
  };
  // feed events up to cursor into the graph replay
  useEffect(() => {
    if (!selected) return;
    onReplayInGraph(selected.task_id, events.slice(0, cursor));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, selected?.task_id]);

  const verdict: VerificationReport | undefined = selected?.result?.verification;

  return (
    <div className="mem-tab">
      <div className="mem-columns">
        <div className="mem-panel">
          <div className="mem-panel-title">Task runs</div>
          {error && <div className="mem-error-box">{error}</div>}
          {loading && <div className="mem-loading">Loading task runs…</div>}
          {!loading && tasks.length === 0 && (
            <div className="mem-muted">No tasks recorded yet. Submit one from Open Chat.</div>
          )}
          <ul className="mem-task-list">
            {tasks.map((t) => (
              <li key={t.task_id}>
                <button
                  className={`mem-task-row ${selected?.task_id === t.task_id ? 'mem-task-active' : ''}`}
                  onClick={() => select(t)}
                >
                  <StatusIcon status={t.status} verdict={t.result?.verification?.verdict} />
                  <span className="mem-task-req">{t.request.slice(0, 70)}</span>
                  <span className="mem-muted">
                    <Clock size={11} /> {new Date(t.started_at).toLocaleString()}
                  </span>
                  <span className={`mem-chip ${t.skill_selection?.mode === 'selected' ? 'mem-chip-ok' : 'mem-chip-soft'}`}>
                    {t.skill_selection?.mode ?? 'auto'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="mem-panel">
          {!selected && <div className="mem-muted">Select a task to inspect its execution.</div>}
          {selected && (
            <>
              <div className="mem-panel-title">
                Task {selected.task_id.slice(0, 8)} · {selected.status}
                <span className="mem-chip mem-chip-soft">{selected.model_id}</span>
              </div>
              <p className="mem-task-request">{selected.request}</p>

              {verdict && (
                <div className={`mem-verify mem-verify-${verdict.verdict.toLowerCase()}`}>
                  <ShieldCheck size={15} />
                  <strong>Independent verification: {verdict.verdict}</strong>
                  <ul>
                    {verdict.checks.map((c, i) => (
                      <li key={i}>
                        <CheckCircle2 size={11} style={{ display: c.verdict === 'PASS' ? 'inline' : 'none' }} />
                        <XCircle size={11} style={{ display: c.verdict !== 'PASS' ? 'inline' : 'none' }} />
                        <span>{c.description}</span>
                        <span className={`mem-verdict mem-verdict-${c.verdict.toLowerCase()}`}>{c.verdict}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!!selected.plan?.steps?.length && (
                <div className="mem-section">
                  <div className="mem-section-title">Plan ({selected.plan.steps.length} steps)</div>
                  <ol className="mem-steps">
                    {selected.plan.steps.map((s) => (
                      <li key={s.step_id}>
                        <strong>{s.tool}</strong> — {s.goal}
                        {s.depends_on.length > 0 && (
                          <span className="mem-muted"> after {s.depends_on.join(', ')}</span>
                        )}
                        <span className={`mem-chip mem-state-${(s.state ?? 'pending').toLowerCase()}`}>
                          {s.state ?? 'pending'}
                        </span>
                        {s.error && <div className="mem-error-inline">{s.error}</div>}
                      </li>
                    ))}
                  </ol>
                  {selected.plan.fallback_reason && (
                    <div className="mem-muted">planning fallback: {selected.plan.fallback_reason}</div>
                  )}
                </div>
              )}

              {selected.result?.final_result && (
                <div className="mem-section">
                  <div className="mem-section-title">Final result</div>
                  <pre className="mem-json">{selected.result.final_result}</pre>
                </div>
              )}

              <div className="mem-section">
                <div className="mem-section-title">
                  Persisted events ({events.length}) — replay drives the graph
                </div>
                <div className="mem-btn-row" style={{ marginBottom: 8 }}>
                  <button className="mem-btn" onClick={togglePlay}>
                    {playing ? <Pause size={13} /> : <Play size={13} />}
                    {playing ? 'Pause' : 'Replay in graph'}
                  </button>
                  <button className="mem-btn" onClick={() => { setPlaying(false); stopTimer(); setCursor(0); }}>
                    <RotateCcw size={13} /> Reset
                  </button>
                  <span className="mem-muted">{Math.min(cursor, events.length)} / {events.length}</span>
                </div>
                <ul className="mem-event-list">
                  {events.slice(0, cursor).map((e, i) => (
                    <li key={e.event_id} className="mem-event-row">
                      <span className="mem-event-dot" style={{ background: EVENT_COLORS[e.event_type] }} />
                      <span className="mem-event-type">{e.event_type}</span>
                      <span className="mem-event-msg">{e.message}</span>
                      <span className="mem-muted">#{e.seq ?? i}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusIcon({ status, verdict }: { status: string; verdict?: string }) {
  const ok = verdict === 'PASS' || status === 'completed';
  if (status === 'running') return <span className="mem-dot mem-dot-run" />;
  return ok
    ? <CheckCircle2 size={15} color="#10b981" />
    : <XCircle size={15} color="#ef4444" />;
}
