/* =========================================================================
   SkillSelectorModal.tsx — pick the skills for a new chat (PART 8).
   Shows the real skills library, validates the selection against mandatory
   dependencies via /skills/validate-selection, and never silently widens
   the chosen scope: missing prerequisites are reported, not auto-added.
   ========================================================================= */
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ShieldAlert, X } from 'lucide-react';
import * as api from '../memory/api';
import type { SelectionReport, SkillCategory, SkillInfo } from '../memory/types';

interface Props {
  open: boolean;
  initialSelected?: string[];
  onClose: () => void;
  onConfirm: (skillIds: string[]) => void;
}

export default function SkillSelectorModal({ open, initialSelected, onClose, onConfirm }: Props) {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [categories, setCategories] = useState<SkillCategory[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected ?? []));
  const [report, setReport] = useState<SelectionReport | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    api.fetchSkills()
      .then((d) => { setSkills(d.skills); setCategories(d.categories); })
      .catch((e: Error) => setError(e.message));
  }, [open]);

  useEffect(() => {
    if (selected.size === 0) { setReport(null); return; }
    api.validateSelection([...selected]).then(setReport).catch(() => setReport(null));
  }, [selected]);

  const filtered = useMemo(() => skills.filter((s) =>
    !q || s.name.toLowerCase().includes(q.toLowerCase()) ||
    s.description.toLowerCase().includes(q.toLowerCase())), [skills, q]);

  if (!open) return null;

  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? id;
  const missingDeps = report?.missing_dependencies ?? [];

  return (
    <div className="mem-modal-backdrop" onClick={onClose}>
      <div className="mem-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mem-modal-head">
          <strong>Select skills for this chat</strong>
          <button className="mem-icon-btn" onClick={onClose}><X size={15} /></button>
        </div>
        <div className="mem-modal-note">
          Selected-skills mode uses <em>only</em> the chosen skills and their mandatory
          dependencies. Unselected <code>RELATED_TO</code> skills are never pulled in.
        </div>
        <input
          className="mem-input" placeholder="Search skills…"
          value={q} onChange={(e) => setQ(e.target.value)} autoFocus
        />
        <div className="mem-modal-list">
          {filtered.map((s) => (
            <label key={s.id} className={`mem-pick-row ${selected.has(s.id) ? 'mem-pick-on' : ''}`}>
              <input
                type="checkbox"
                checked={selected.has(s.id)}
                onChange={() => setSelected((prev) => {
                  const next = new Set(prev);
                  if (next.has(s.id)) next.delete(s.id); else next.add(s.id);
                  return next;
                })}
              />
              <span className="mem-pick-name">{s.name}</span>
              <span className="mem-muted">{catName(s.category_id)}</span>
              {s.prerequisites.length > 0 && (
                <span className="mem-chip mem-chip-warn">
                  requires {s.prerequisites.map((p) => p.replace('skill:', '')).join(', ')}
                </span>
              )}
            </label>
          ))}
          {!filtered.length && <div className="mem-muted" style={{ padding: 12 }}>No skills match.</div>}
        </div>

        <div className="mem-modal-foot">
          <div className="mem-modal-validate">
            {report && !report.ok && (
              <span className="mem-chip mem-chip-bad"><ShieldAlert size={11} /> invalid selection</span>
            )}
            {report && report.ok && (
              <span className="mem-chip mem-chip-ok"><CheckCircle2 size={11} /> valid scope ({report.resolved.length} incl. deps)</span>
            )}
            {missingDeps.length > 0 && (
              <span className="mem-muted">will be added as mandatory dependencies: {missingDeps.join(', ')}</span>
            )}
            {!report && <span className="mem-muted">Nothing selected — the agent will pick skills automatically.</span>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="mem-btn" onClick={() => setSelected(new Set())}>Clear</button>
            <button className="mem-btn" onClick={onClose}>Cancel</button>
            <button
              className="mem-btn mem-btn-primary"
              disabled={!!report && !report.ok}
              onClick={() => onConfirm([...selected])}
            >
              Start chat with {selected.size || 'auto'} skills
            </button>
          </div>
        </div>
        {error && <div className="mem-error-box">{error}</div>}
      </div>
    </div>
  );
}
