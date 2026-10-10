/* =========================================================================
   CurationTab.tsx — memory analysis & review. Runs the deterministic
   curation analyzer, lists its proposals, and lets the user approve or
   reject each one. Suggestions are model/analysis-generated; only approved
   changes are applied by the backend.
   ========================================================================= */
import { useEffect, useState } from 'react';
import { Check, PlayCircle, RefreshCw, ThumbsDown, X } from 'lucide-react';
import * as api from '../../memory/api';
import type { CurationSuggestion } from '../../memory/types';

export default function CurationTab({ onSelectNode }: { onSelectNode: (id: string) => void }) {
  const [suggestions, setSuggestions] = useState<CurationSuggestion[]>([]);
  const [lastAnalysis, setLastAnalysis] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    api.fetchSuggestions('proposed')
      .then((d) => setSuggestions(d.suggestions))
      .catch((e: Error) => setError(e.message));
  };
  useEffect(load, []);

  const analyze = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api.curationAnalyze();
      setLastAnalysis(JSON.stringify(res));
      load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const decide = async (id: string, ok: boolean) => {
    setBusy(true);
    try {
      if (ok) await api.approveSuggestion(id); else await api.rejectSuggestion(id);
      load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="mem-tab">
      <div className="mem-tab-toolbar">
        <button className="mem-btn mem-btn-primary" disabled={busy} onClick={analyze}>
          <PlayCircle size={13} /> Analyze memory
        </button>
        <button className="mem-btn" onClick={load}><RefreshCw size={13} /> Refresh</button>
        {lastAnalysis && <span className="mem-muted">analyzer: {lastAnalysis.slice(0, 140)}…</span>}
      </div>
      {error && <div className="mem-error-box">{error}</div>}

      <div className="mem-panel">
        <div className="mem-panel-title">Proposed changes ({suggestions.length})</div>
        {!suggestions.length && (
          <div className="mem-muted">
            No open proposals. Run "Analyze memory" — the analyzer checks duplicates, orphans,
            conflicts and archive candidates deterministically.
          </div>
        )}
        {suggestions.map((s) => (
          <div key={s.id} className="mem-suggestion">
            <div className="mem-suggestion-head">
              <span className="mem-chip">{s.kind}</span>
              <div className="mem-chip-row">
                {s.node_ids.map((id) => (
                  <button key={id} className="mem-link" onClick={() => onSelectNode(id)}>{id}</button>
                ))}
              </div>
            </div>
            <div className="mem-muted">
              {(s.detail?.reason as string) ?? ''}
              {(s.detail?.similarity as number) !== undefined && ` · similarity ${s.detail?.similarity}`}
            </div>
            {'warning' in (s.detail ?? {}) && (
              <div className="mem-chip-row"><span className="mem-chip mem-chip-warn">{String(s.detail.warning)}</span></div>
            )}
            <div className="mem-btn-row" style={{ marginTop: 8 }}>
              <button className="mem-btn" disabled={busy} onClick={() => decide(s.id, true)}>
                <Check size={13} /> Approve & apply
              </button>
              <button className="mem-btn mem-btn-danger" disabled={busy} onClick={() => decide(s.id, false)}>
                <ThumbsDown size={13} /> Reject
              </button>
            </div>
          </div>
        ))}
        <div className="mem-muted" style={{ marginTop: 10 }}>
          <X size={11} /> Analysis never auto-destroys provenance; merges keep both sources.
        </div>
      </div>
    </div>
  );
}
