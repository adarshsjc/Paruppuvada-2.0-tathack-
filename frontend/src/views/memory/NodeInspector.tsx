/* =========================================================================
   NodeInspector.tsx — the details drawer for the selected node.
   All content comes from GET /api/v1/memory-graph/node/{id}; nothing is
   mocked. Skill nodes show prerequisites/tools/executions; failure nodes
   show the stored episode with diagnosis status; every node shows its real
   edges with labels and provenance.
   ========================================================================= */
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Archive, ArchiveRestore, Boxes, ChevronRight, Trash2, X, ZoomIn,
} from 'lucide-react';
import * as api from '../../memory/api';
import {
  NODE_COLORS, NODE_TYPE_LABELS,
} from '../../memory/types';
import type { GraphNode } from '../../memory/types';

interface Props {
  nodeId: string;
  onClose: () => void;
  onFocus: (id: string) => void;
  onExpand: (id: string) => void;
  onCollapse: (id: string) => void;
  onSelectNode: (id: string) => void;
  onHighlightPath: (nodeIds: string[], edgeIds: string[]) => void;
}

export default function NodeInspector({
  nodeId, onClose, onFocus, onExpand, onCollapse, onSelectNode, onHighlightPath,
}: Props) {
  const [node, setNode] = useState<GraphNode | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setNode(null);
    setError('');
    api.fetchNode(nodeId)
      .then((n) => { if (alive) setNode(n); })
      .catch((e: Error) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [nodeId]);

  const act = async (fn: () => Promise<unknown>, then?: () => void) => {
    setBusy(true);
    try {
      await fn();
      const fresh = await api.fetchNode(nodeId);
      setNode(fresh);
      then?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const edges = node?.edges ?? [];
  const incoming = edges.filter((e) => e.target_id === nodeId);
  const outgoing = edges.filter((e) => e.source_id === nodeId);

  const highlightDeps = () => {
    // walk REQUIRES edges transitively from this node
    const nodeIds = new Set<string>([nodeId]);
    const edgeIds: string[] = [];
    const stack = [nodeId];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const e of edges) {
        if (e.source_id === cur && e.edge_type === 'REQUIRES' && !nodeIds.has(e.target_id)) {
          nodeIds.add(e.target_id);
          edgeIds.push(e.id);
          stack.push(e.target_id);
        }
      }
    }
    onHighlightPath([...nodeIds], edgeIds);
  };

  return (
    <div className="mem-inspector">
      <div className="mem-inspector-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
          <span
            className="mem-dot"
            style={{
              background: node ? NODE_COLORS[node.node_type] : '#94a3b8',
              boxShadow: node ? `0 0 10px ${NODE_COLORS[node.node_type]}` : 'none',
              width: 10,
              height: 10,
              borderRadius: '50%',
              flexShrink: 0,
            }}
          />
          <strong className="mem-inspector-title" style={{ fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {node?.label ?? 'Loading…'}
          </strong>
        </div>
        <button className="mem-icon-btn" onClick={onClose} title="Close inspector"><X size={16} /></button>
      </div>

      {error && <div className="mem-error-box">{error}</div>}
      {!node && !error && <div className="mem-loading">Loading node from backend…</div>}

      {node && (
        <div className="mem-inspector-body">
          <div className="mem-chip-row">
            <span className="mem-chip">{NODE_TYPE_LABELS[node.node_type]}</span>
            <span className="mem-chip mem-chip-soft">{node.scope}</span>
            {node.project_id && <span className="mem-chip mem-chip-soft">project: {node.project_id}</span>}
            <span className={`mem-chip mem-state-${node.compression_state.toLowerCase()}`}>
              {node.compression_state.replace('_', ' ')}
            </span>
          </div>

          {/* Importance / Cognitive Weight Meter */}
          <div className="mem-importance-wrap">
            <div className="mem-importance-head">
              <span>Cognitive Importance</span>
              <strong style={{ color: NODE_COLORS[node.node_type] || '#38bdf8' }}>
                {Math.round(node.importance * 100)}%
              </strong>
            </div>
            <div className="mem-importance-track">
              <div
                className="mem-importance-fill"
                style={{
                  width: `${Math.max(8, Math.min(100, Math.round(node.importance * 100)))}%`,
                  background: `linear-gradient(90deg, #38bdf8, ${NODE_COLORS[node.node_type] || '#818cf8'})`,
                }}
              />
            </div>
          </div>

          {node.description && <p className="mem-inspector-desc">{node.description}</p>}

          <div className="mem-btn-row">
            <button className="mem-btn" onClick={() => onFocus(node.id)}><ZoomIn size={13} /> Focus</button>
            {node.child_count > 0 && (
              <button className="mem-btn" onClick={() => onExpand(node.id)}><Boxes size={13} /> Expand group</button>
            )}
            {node.compression_state === 'EXPANDED' && (
              <button className="mem-btn" onClick={() => onCollapse(node.id)}><Boxes size={13} /> Collapse</button>
            )}
            {node.compression_state !== 'ARCHIVED' ? (
              <button className="mem-btn" disabled={busy} onClick={() => act(() => api.archiveNode(node.id))}>
                <Archive size={13} /> Archive
              </button>
            ) : (
              <button className="mem-btn" disabled={busy} onClick={() => act(() => api.restoreNode(node.id))}>
                <ArchiveRestore size={13} /> Restore
              </button>
            )}
            <button
              className="mem-btn mem-btn-danger"
              disabled={busy}
              onClick={() => {
                if (window.confirm('Soft-delete this node? The provenance row is retained in the backend.'))
                  act(() => api.deleteNode(node.id), onClose);
              }}
            >
              <Trash2 size={13} /> Delete
            </button>
          </div>

          {/* skill-specific detail */}
          {node.node_type === 'skill' && (
            <SkillDetails node={node} onHighlightDeps={highlightDeps} />
          )}

          {/* failure-specific detail */}
          {node.node_type === 'failure' && node.episode && (
            <Section title="Failure episode">
              <FailureEpisodeView episode={node.episode as Record<string, unknown>} />
            </Section>
          )}

          {node.node_type === 'skill' && !!node.recent_executions?.length && (
            <Section title="Previous executions">
              <ul className="mem-mini-list">
                {node.recent_executions.map((r) => (
                  <li key={r.task_id}>
                    <button className="mem-link" onClick={() => onSelectNode(`task:${r.task_id}`)}>
                      task {r.task_id.slice(0, 8)}
                    </button>
                    <span className={`mem-verdict mem-verdict-${(r.verdict || r.status).toLowerCase()}`}>
                      {r.verdict || r.status}
                    </span>
                    <span className="mem-muted">{new Date(r.started_at).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title={`Relationships (${edges.length})`}>
            {incoming.length > 0 && (
              <div className="mem-rel-block">
                <div className="mem-rel-label">Incoming</div>
                {incoming.map((e) => (
                  <button key={e.id} className="mem-rel" onClick={() => onSelectNode(e.source_id)}>
                    <ChevronRight size={12} className="mem-rel-arrow" />
                    <span className="mem-rel-type">{e.edge_type}</span>
                    <span className="mem-rel-target">{e.source_label ?? e.source_id}</span>
                    <span className={`mem-prov mem-prov-${e.provenance.toLowerCase()}`}>{e.provenance.toLowerCase()}</span>
                  </button>
                ))}
              </div>
            )}
            {outgoing.length > 0 && (
              <div className="mem-rel-block">
                <div className="mem-rel-label">Outgoing</div>
                {outgoing.map((e) => (
                  <button key={e.id} className="mem-rel" onClick={() => onSelectNode(e.target_id)}>
                    <ChevronRight size={12} className="mem-rel-arrow" />
                    <span className="mem-rel-type">{e.edge_type}</span>
                    <span className="mem-rel-target">{e.target_label ?? e.target_id}</span>
                    <span className={`mem-prov mem-prov-${e.provenance.toLowerCase()}`}>{e.provenance.toLowerCase()}</span>
                  </button>
                ))}
              </div>
            )}
            {edges.length === 0 && <div className="mem-muted">No explicit relationships stored.</div>}
          </Section>

          <Section title="Provenance & meta">
            <div className="mem-kv"><span>importance</span><span>{node.importance.toFixed(2)}</span></div>
            <div className="mem-kv"><span>access_count</span><span>{node.access_count}</span></div>
            <div className="mem-kv"><span>created_at</span><span>{node.created_at ? new Date(node.created_at).toLocaleString() : '—'}</span></div>
            {Object.keys(node.metadata).length > 0 && (
              <pre className="mem-json">{JSON.stringify(node.metadata, null, 2)}</pre>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mem-section">
      <div className="mem-section-title">{title}</div>
      {children}
    </div>
  );
}

function SkillDetails({ node, onHighlightDeps }: { node: GraphNode; onHighlightDeps: () => void }) {
  const meta = node.metadata as {
    prerequisites?: string[]; allowed_tools?: string[]; version?: string;
    keywords?: string[]; verification_rules?: string[];
  };
  return (
    <>
      {!!meta.prerequisites?.length && (
        <Section title="Prerequisites (mandatory)">
          <div className="mem-chip-row">
            {meta.prerequisites.map((p) => <span key={p} className="mem-chip mem-chip-warn">{p}</span>)}
          </div>
          <button className="mem-btn mem-btn-sm" style={{ marginTop: 6 }} onClick={onHighlightDeps}>
            Highlight dependency path
          </button>
        </Section>
      )}
      {!!meta.allowed_tools?.length && (
        <Section title="Allowed tools (backend-enforced)">
          <div className="mem-chip-row">
            {meta.allowed_tools.map((t) => <span key={t} className="mem-chip">{t}</span>)}
          </div>
        </Section>
      )}
      {!!meta.verification_rules?.length && (
        <Section title="Verification requirements">
          <div className="mem-chip-row">
            {meta.verification_rules.map((r) => <span key={r} className="mem-chip mem-chip-ok">{r}</span>)}
          </div>
        </Section>
      )}
      {!!meta.keywords?.length && (
        <Section title="Keywords">
          <div className="mem-chip-row">
            {meta.keywords.map((k) => <span key={k} className="mem-chip mem-chip-soft">{k}</span>)}
          </div>
        </Section>
      )}
    </>
  );
}

export function FailureEpisodeView({ episode }: { episode: Record<string, unknown> }) {
  return (
    <div className="mem-failure">
      <div className="mem-kv"><span>diagnosis</span>
        <span className={`mem-diag mem-diag-${String(episode.diagnosis_status)}`}>
          {String(episode.diagnosis_status)}
        </span>
      </div>
      {episode.tool ? <div className="mem-kv"><span>tool</span><span>{String(episode.tool)}</span></div> : null}
      {episode.skill_id ? <div className="mem-kv"><span>skill</span><span>{String(episode.skill_id)}</span></div> : null}
      {episode.error_signature ? (
        <div className="mem-kv"><span>signature</span><code>{String(episode.error_signature)}</code></div>
      ) : null}
      {episode.error_text ? <pre className="mem-json">{String(episode.error_text)}</pre> : null}
      {episode.verification ? (
        <div className="mem-kv"><span>verification</span><span>{String(episode.verification)}</span></div>
      ) : null}
    </div>
  );
}
