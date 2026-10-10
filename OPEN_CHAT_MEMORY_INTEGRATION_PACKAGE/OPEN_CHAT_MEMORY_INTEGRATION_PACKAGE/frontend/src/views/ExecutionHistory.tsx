import { useState } from 'react';
import { CheckCircle2, ArrowRight, Clock, Cpu } from 'lucide-react';

interface HistoryItem {
  id: string;
  request: string;
  status: 'completed' | 'failed' | 'in_progress';
  date: string;
  iterations: number;
  toolsUsed: string[];
  reviewerVerdict: string;
}

export default function ExecutionHistory({
  onSelectTask
}: {
  onSelectTask?: (taskPrompt: string) => void;
}) {
  const [historyItems] = useState<HistoryItem[]>([
    {
      id: 'task-7102',
      request: 'Calculate 347 * 829',
      status: 'completed',
      date: 'Today, 18:42',
      iterations: 1,
      toolsUsed: ['calculator'],
      reviewerVerdict: 'Math computation approved with 100% precision.'
    },
    {
      id: 'task-6981',
      request: 'Save project note: Verified multi-agent DAG pipeline with review scoring',
      status: 'completed',
      date: 'Today, 17:15',
      iterations: 1,
      toolsUsed: ['save_memory'],
      reviewerVerdict: 'Memory saved successfully into project scope.'
    },
    {
      id: 'task-6540',
      request: 'Search architecture memory and summarize agent loop limits',
      status: 'completed',
      date: 'Yesterday, 14:20',
      iterations: 2,
      toolsUsed: ['search_memory'],
      reviewerVerdict: 'Retrieved 3 architecture notes; verified summaries.'
    },
    {
      id: 'task-5812',
      request: 'Execute automated regression test on calculator tool with division by zero',
      status: 'completed',
      date: 'Apr 24, 11:05',
      iterations: 2,
      toolsUsed: ['calculator'],
      reviewerVerdict: 'Gracefully handled zero division exception.'
    }
  ]);

  return (
    <div className="dashboard-content" style={{ maxWidth: '1100px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 className="hero-heading" style={{ justifyContent: 'flex-start', fontSize: '1.8rem' }}>
          Execution History & Audit Trail
        </h1>
        <p className="hero-subheading">
          Chronological record of multi-agent plans, tool executions, and reviewer scorecard audits.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {historyItems.map(item => (
          <div key={item.id} className="bento-card" style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="nav-pill-badge pill-emerald-cat" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <CheckCircle2 size={12} /> {item.status.toUpperCase()}
                </span>
                <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: '#64748b' }}>
                  {item.id}
                </span>
              </div>

              <span style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={12} /> {item.date}
              </span>
            </div>

            <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
              {item.request}
            </h3>

            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 12, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px', color: '#475569' }}>
                <Cpu size={14} color="#2563eb" />
                <span>Iterations: <strong>{item.iterations}</strong></span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px', color: '#475569' }}>
                <span>Tools:</span>
                {item.toolsUsed.map(t => (
                  <span key={t} className="task-category-pill pill-sky-cat" style={{ fontSize: '10px' }}>
                    {t}
                  </span>
                ))}
              </div>

              <div style={{ flex: 1, minWidth: 200, fontSize: '12px', color: '#059669', fontStyle: 'italic' }}>
                Reviewer: "{item.reviewerVerdict}"
              </div>

              {onSelectTask && (
                <button 
                  className="card-header-action" 
                  onClick={() => onSelectTask(item.request)}
                >
                  Rerun in Open Chat <ArrowRight size={13} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
