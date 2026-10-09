import { useState, useEffect } from 'react';
import { fetchMemory } from '../api';
import type { MemoryItem } from '../types';
import { Database, Search, Loader2 } from 'lucide-react';

export default function MemoryExplorer({ projectId }: { projectId: string }) {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    loadMemory();
  }, [projectId]);

  const loadMemory = async () => {
    setLoading(true);
    try {
      const data = await fetchMemory(projectId);
      setMemories(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const filtered = memories.filter(m => m.content.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="glass-panel">
      <div className="flex-row" style={{ justifyContent: 'space-between' }}>
        <h2>Memory Explorer</h2>
        <div className="flex-row">
          <input className="input" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter memories..." style={{ width: '250px', padding: '8px 12px' }} />
          <button className="btn btn-secondary" onClick={loadMemory} disabled={loading}>{loading ? <Loader2 className="spinner" size={16} /> : <Search size={16} />}</button>
        </div>
      </div>
      
      <div style={{ marginTop: '24px' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
             <Database size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
             <p>No memories found in this context.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
            {filtered.map(m => (
              <div key={m.id} className="memory-card">
                 <div className="flex-row" style={{ marginBottom: '12px', justifyContent: 'space-between' }}>
                   <span className={`badge ${m.type === 'global' ? 'badge-blue' : m.type === 'session' ? 'badge-orange' : 'badge-green'}`}>{m.type}</span>
                   <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{new Date(m.timestamp || '').toLocaleString()}</span>
                 </div>
                 <div style={{ fontSize: '0.95rem', marginBottom: '12px', whiteSpace: 'pre-wrap' }}>{m.content}</div>
                 <div className="flex-row" style={{ flexWrap: 'wrap' }}>
                    {m.tags.map(t => <span key={t} style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px' }}>#{t}</span>)}
                 </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
