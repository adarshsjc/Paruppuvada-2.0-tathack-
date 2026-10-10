/* =========================================================================
   FailuresTab.tsx — the Failure Learning view: episodes with real evidence,
   hypothesis-vs-verified diagnosis status, and validated recovery procedures.
   ========================================================================= */
import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, ShieldCheck, Wrench } from 'lucide-react';
import * as api from '../../memory/api';
import { FailureEpisodeView } from './NodeInspector';
import type { FailureEpisode, RecoveryProcedure } from '../../memory/types';

export default function FailuresTab({ onViewTask }: { onViewTask: (taskId: string) => void }) {
  const [failures, setFailures] = useState<FailureEpisode[]>([]);
  const [recoveries, setRecoveries] = useState<RecoveryProcedure[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([api.fetchFailures(), api.fetchRecoveries()])
      .then(([f, r]) => { setFailures(f.failures); setRecoveries(r.recoveries); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const verified = failures.filter((f) => f.diagnosis_status === 'verified').length;

  return (
    <div className="mem-tab">
      <div className="mem-tab-toolbar">
        <span className="mem-stat-pill"><AlertTriangle size={13} /> {failures.length} episodes</span>
        <span className="mem-stat-pill"><ShieldCheck size={13} /> {verified} verified diagnoses</span>
        <span className="mem-stat-pill"><Wrench size={13} /> {recoveries.length} recovery procedures</span>
        <button className="mem-btn" onClick={load}><RefreshCw size={13} /> Refresh</button>
      </div>
      {error && <div className="mem-error-box">{error}</div>}
      {loading && <div className="mem-loading">Loading failure memory…</div>}

      <div className="mem-columns">
        <div className="mem-panel">
          <div className="mem-panel-title">Failure episodes</div>
          {failures.length === 0 && !loading && (
            <div className="mem-muted">No failures recorded yet. They appear here after real failed runs.</div>
          )}
          {failures.map((f) => (
            <div key={f.id} className="mem-failure-card">
              <button className="mem-failure-head" onClick={() => setOpen(open === f.id ? null : f.id)}>
                <span className={`mem-diag mem-diag-${f.diagnosis_status}`}>{f.diagnosis_status}</span>
                <code className="mem-sig">{f.error_signature}</code>
                <span className="mem-muted">{new Date(f.created_at).toLocaleString()}</span>
              </button>
              {open === f.id && (
                <div className="mem-failure-body">
                  <FailureEpisodeView episode={f as unknown as Record<string, unknown>} />
                  {f.task_id && (
                    <button className="mem-btn mem-btn-sm" onClick={() => onViewTask(f.task_id!)}>
                      Inspect task {f.task_id.slice(0, 8)}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mem-panel">
          <div className="mem-panel-title">Recovery procedures (validated only are promoted)</div>
          {recoveries.length === 0 && !loading && (
            <div className="mem-muted">No recovery procedures learned yet.</div>
          )}
          {recoveries.map((r) => (
            <div key={r.id} className="mem-recovery-card">
              <div className="mem-recovery-head">
                <code className="mem-sig">{r.error_signature}</code>
                <span className={`mem-chip ${r.status === 'validated' ? 'mem-chip-ok' : 'mem-chip-warn'}`}>
                  {r.status}
                </span>
              </div>
              {r.description && <div>{r.description}</div>}
              <div className="mem-muted">
                attempts {r.attempt_count} · successes {r.success_count}
              </div>
              {Array.isArray(r.steps) && r.steps.length > 0 && (
                <ol className="mem-steps">
                  {r.steps.map((s: string, i: number) => <li key={i}>{s}</li>)}
                </ol>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
