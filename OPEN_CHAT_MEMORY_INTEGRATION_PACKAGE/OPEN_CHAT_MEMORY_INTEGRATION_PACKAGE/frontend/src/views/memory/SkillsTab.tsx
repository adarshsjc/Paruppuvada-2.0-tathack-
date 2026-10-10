/* =========================================================================
   SkillsTab.tsx — browse the skills library, compose a selection, validate
   it against mandatory dependencies (real /skills/validate-selection call),
   and hand the selection to a new chat or locate the skill in the graph.
   ========================================================================= */
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Filter, Locate, MessageSquarePlus, RefreshCw, XCircle } from 'lucide-react';
import * as api from '../../memory/api';
import type { SelectionReport, SkillCategory, SkillInfo } from '../../memory/types';

interface Props {
  onUseInChat: (skillIds: string[]) => void;
  onViewInGraph: (nodeId: string) => void;
}

export default function SkillsTab({ onUseInChat, onViewInGraph }: Props) {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [categories, setCategories] = useState<SkillCategory[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [report, setReport] = useState<SelectionReport | null>(null);
  const [catFilter, setCatFilter] = useState<string>('all');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    api.fetchSkills()
      .then((d) => { setSkills(d.skills); setCategories(d.categories); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  useEffect(() => {
    if (selected.size === 0) { setReport(null); return; }
    api.validateSelection([...selected])
      .then(setReport)
      .catch(() => setReport(null));
  }, [selected]);

  const filtered = useMemo(() => skills.filter((s) =>
    (catFilter === 'all' || s.category_id === catFilter) &&
    (!q || s.name.toLowerCase().includes(q.toLowerCase()) ||
      s.description.toLowerCase().includes(q.toLowerCase()))), [skills, catFilter, q]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? id;

  return (
    <div className="mem-tab">
      <div className="mem-tab-toolbar">
        <input
          className="mem-input"
          placeholder="Search skills…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="mem-input" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
          <option value="all">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="mem-btn" onClick={load}><RefreshCw size={13} /> Refresh</button>
      </div>

      {error && <div className="mem-error-box">{error}</div>}
      {loading && <div className="mem-loading">Loading skills library…</div>}

      <div className="mem-skills-grid">
        {filtered.map((s) => (
          <div key={s.id} className={`mem-skill-card ${selected.has(s.id) ? 'mem-skill-selected' : ''}`}>
            <label className="mem-skill-head">
              <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
              <div>
                <div className="mem-skill-name">{s.name}</div>
                <div className="mem-muted">{catName(s.category_id)} · v{s.version}
                  {s.has_canonical_workflow && <span className="mem-chip mem-chip-ok" style={{ marginLeft: 6 }}>workflow</span>}
                </div>
              </div>
            </label>
            <p className="mem-skill-desc">{s.description}</p>
            <div className="mem-chip-row">
              {s.prerequisites.map((p) => (
                <span key={p} className="mem-chip mem-chip-warn" title="mandatory prerequisite">requires {p.replace('skill:', '')}</span>
              ))}
              {s.allowed_tools.slice(0, 4).map((t) => (
                <span key={t} className="mem-chip">{t}</span>
              ))}
            </div>
            <div className="mem-skill-actions">
              <button className="mem-btn mem-btn-sm" onClick={() => onViewInGraph(s.id)}>
                <Locate size={12} /> In graph
              </button>
            </div>
          </div>
        ))}
        {!loading && filtered.length === 0 && (
          <div className="mem-muted" style={{ padding: 16 }}><Filter size={13} /> No skills match the filter.</div>
        )}
      </div>

      <div className="mem-selection-bar">
        <div>
          <strong>{selected.size}</strong> skill{selected.size === 1 ? '' : 's'} selected
          {report && (
            <span className="mem-chip-row" style={{ marginLeft: 10 }}>
              <span className="mem-chip mem-chip-soft">resolved: {report.resolved.length}</span>
              {report.unknown.length > 0 && (
                <span className="mem-chip mem-chip-bad">unknown: {report.unknown.join(', ')}</span>
              )}
              {report.missing_dependencies.length > 0 && (
                <span className="mem-chip mem-chip-warn">missing deps: {report.missing_dependencies.join(', ')}</span>
              )}
              {report.ok && selected.size > 0 && (
                <span className="mem-chip mem-chip-ok"><CheckCircle2 size={11} /> valid scope</span>
              )}
            </span>
          )}
          {report && report.allowed_tools.length > 0 && (
            <div className="mem-muted" style={{ marginTop: 4 }}>
              tools unlocked: {report.allowed_tools.join(', ')}
            </div>
          )}
        </div>
        <div className="mem-btn-row">
          <button className="mem-btn" disabled={selected.size === 0} onClick={() => setSelected(new Set())}>
            <XCircle size={13} /> Clear
          </button>
          <button
            className="mem-btn mem-btn-primary"
            disabled={selected.size === 0 || !report?.ok}
            onClick={() => onUseInChat([...selected])}
          >
            <MessageSquarePlus size={13} /> Use in new chat
          </button>
        </div>
      </div>
    </div>
  );
}
