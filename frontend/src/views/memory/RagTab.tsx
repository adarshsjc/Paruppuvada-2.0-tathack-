/* =========================================================================
   RagTab.tsx — knowledge management: ingest documents into the RAG store
   and query the four retrieval channels (knowledge / skill / experience /
   state). The retrieval mode label is the backend's honest self-report
   ("keyword" unless embeddings are configured).
   ========================================================================= */
import { useEffect, useState } from 'react';
import { FileText, RefreshCw, Search, Upload } from 'lucide-react';
import * as api from '../../memory/api';
import type { RagDocument, RagResult } from '../../memory/types';

interface Props { projectId?: string | null; }

const CHANNELS = ['knowledge', 'skill', 'experience', 'state'] as const;

export default function RagTab({ projectId }: Props) {
  const [docs, setDocs] = useState<RagDocument[]>([]);
  const [mode, setMode] = useState('keyword');
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<RagResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    api.fetchRagDocuments(projectId)
      .then((d) => { setDocs(d.documents); setMode(d.retrieval_mode); })
      .catch((e: Error) => setError(e.message));
  };
  useEffect(load, [projectId]);

  const ingest = async () => {
    if (!name.trim() || !content.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api.ragIngest(name.trim(), content, projectId || null);
      setName(''); setContent('');
      load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  // Memory management is driven by the project's CSV files: re-scan the
  // backend workspace (backend/workspace/*.csv) and mirror them into memory.
  const syncWorkspaceCsvs = async () => {
    setBusy(true);
    setError('');
    try {
      await api.ingestWorkspaceCsvs();
      load(); // refreshed document list below shows the mirrored CSV docs
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const runQuery = async () => {
    if (!query.trim()) return;
    setBusy(true);
    setError('');
    try { setResult(await api.ragQuery(query.trim(), projectId || null)); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="mem-tab">
      <div className="mem-columns">
        <div className="mem-panel">
          <div className="mem-panel-title">
            <Upload size={14} /> Ingest document
            <span className={`mem-chip ${mode === 'embedding' ? 'mem-chip-ok' : 'mem-chip-soft'}`}
              title="honest backend label — 'keyword' until embeddings are configured">
              {mode} retrieval
            </span>
          </div>
          <input className="mem-input" placeholder="Document name"
            value={name} onChange={(e) => setName(e.target.value)} />
          <textarea
            className="mem-input mem-textarea"
            placeholder="Paste TXT/Markdown/CSV/JSON content… (file upload goes through the backend ingest script)"
            value={content} onChange={(e) => setContent(e.target.value)} rows={6}
          />
          <button className="mem-btn mem-btn-primary" disabled={busy} onClick={ingest}>
            Ingest into memory
          </button>
          <div className="mem-tab-toolbar" style={{ marginTop: 8 }}>
            <button className="mem-btn" disabled={busy} onClick={syncWorkspaceCsvs}>
              <RefreshCw size={12} /> Sync project CSV files
            </button>
            <span className="mem-muted" style={{ fontSize: '11px' }}>
              Mirrors backend/workspace/*.csv into memory (idempotent)
            </span>
          </div>
          <div className="mem-section" style={{ marginTop: 14 }}>
            <div className="mem-section-title">Stored documents ({docs.length})</div>
            <ul className="mem-mini-list">
              {docs.map((d) => (
                <li key={d.id}>
                  <FileText size={12} /> <strong>{d.name}</strong>
                  <span className="mem-muted"> · {d.chunk_count} chunks · {d.project_id ?? 'global'}</span>
                </li>
              ))}
              {docs.length === 0 && <li className="mem-muted">No documents ingested yet.</li>}
            </ul>
          </div>
        </div>

        <div className="mem-panel">
          <div className="mem-panel-title"><Search size={14} /> Query the four channels</div>
          <div className="mem-tab-toolbar">
            <input
              className="mem-input"
              placeholder="e.g. revenue totals by product"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runQuery()}
            />
            <button className="mem-btn mem-btn-primary" disabled={busy} onClick={runQuery}>Retrieve</button>
          </div>
          {error && <div className="mem-error-box">{error}</div>}
          {result && (
            <>
              <div className="mem-muted" style={{ margin: '8px 0' }}>
                mode: {result.mode} · budget {result.used_chars}/{result.budget_chars} chars
                {result.truncated > 0 && <> · {result.truncated} result(s) over budget truncated</>}
              </div>
              {CHANNELS.map((ch) => {
                const items = result.items.filter((i) => i.channel === ch);
                if (items.length === 0) return null;
                return (
                  <div key={ch} className="mem-section">
                    <div className="mem-section-title">{ch} ({items.length})</div>
                    {items.map((it, i) => (
                      <div key={`${it.node_id ?? it.chunk_id ?? i}-${i}`} className="mem-rag-item">
                        <div className="mem-rag-meta">
                          score {it.score.toFixed(2)} · {it.reason}
                        </div>
                        <div className="mem-rag-preview">{it.preview || it.content}</div>
                      </div>
                    ))}
                  </div>
                );
              })}
              {result.items.length === 0 && <div className="mem-muted">No evidence retrieved for this query.</div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
