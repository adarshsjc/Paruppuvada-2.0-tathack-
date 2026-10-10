import { useState, useEffect } from 'react';
import { fetchMemory, addMemory, deleteMemory } from '../api';
import type { MemoryItem } from '../types';
import { Database, Search, Loader2, Plus, Trash2, Tag } from 'lucide-react';

export default function MemoryExplorer({ 
  projectId, 
  onOpenGraph 
}: { 
  projectId: string; 
  onOpenGraph?: () => void; 
}) {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string>('all');
  
  // Add Knowledge Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newType, setNewType] = useState('project');
  const [newTags, setNewTags] = useState('notes, architecture');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadMemory();
  }, [projectId]);

  const loadMemory = async () => {
    setLoading(true);
    try {
      const data = await fetchMemory(projectId, filter);
      setMemories(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;
    setSaving(true);
    setError('');
    try {
      const tagsArray = newTags.split(',').map(t => t.trim()).filter(Boolean);
      await addMemory({
        content: newContent.trim(),
        type: newType,
        source: 'user_vault',
        tags: tagsArray,
        project_id: newType === 'project' ? (projectId || undefined) : undefined
      });
      setNewContent('');
      setShowAddModal(false);
      loadMemory();
    } catch (e: any) {
      setError(e.message || 'Failed to save knowledge note');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMemory = async (id?: string) => {
    if (!id) return;
    try {
      await deleteMemory(id);
      setMemories(prev => prev.filter(m => m.id !== id));
    } catch (e) {
      console.error('Failed to delete memory', e);
    }
  };

  // Collect all unique tags for tag cloud
  const allTags = Array.from(new Set(memories.flatMap(m => m.tags || [])));

  const filteredMemories = memories.filter(m => {
    const matchesFilter = m.content.toLowerCase().includes(filter.toLowerCase()) ||
                          m.tags?.some(t => t.toLowerCase().includes(filter.toLowerCase()));
    const matchesTag = !selectedTag || m.tags?.includes(selectedTag);
    const matchesType = selectedType === 'all' || m.type === selectedType;
    return matchesFilter && matchesTag && matchesType;
  });

  return (
    <div className="dashboard-content">
      {/* Header & Controls */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 className="hero-heading" style={{ justifyContent: 'flex-start', fontSize: '1.8rem' }}>
            Memory Vault & Knowledge Graph
          </h1>
          <p className="hero-subheading">
            Persistent long-term memories and contextual embeddings indexed across agents.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {onOpenGraph && (
            <button 
              className="btn-join-primary"
              style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }}
              onClick={onOpenGraph}
              title="Open 3D Skill Graph and Memory Workspace"
            >
              <Database size={16} /> Open 3D Skill Graph
            </button>
          )}
          <button 
            className="btn-join-primary"
            onClick={() => setShowAddModal(true)}
          >
            <Plus size={16} /> Add Knowledge Note
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bento-card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          {/* Search box */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 260 }}>
            <Search size={16} color="#64748b" />
            <input 
              type="text"
              className="hero-prompt-input"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Search memories by content or tag..."
              style={{ fontSize: '13px' }}
            />
            {loading && <Loader2 size={16} className="spinner" color="#2563eb" />}
          </div>

          {/* Type Tabs */}
          <div className="tasks-filter-tabs">
            {['all', 'project', 'global', 'session'].map(t => (
              <button 
                key={t}
                className={`filter-tab-btn ${selectedType === t ? 'active' : ''}`}
                onClick={() => setSelectedType(t)}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Tag Cloud */}
        {allTags.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Tag size={12} /> Tags:
            </span>
            <button 
              className={`chip-btn ${selectedTag === null ? 'chip-active' : ''}`}
              style={{ padding: '3px 8px', fontSize: '11px' }}
              onClick={() => setSelectedTag(null)}
            >
              All
            </button>
            {allTags.map(tag => (
              <button 
                key={tag}
                className={`chip-btn ${selectedTag === tag ? 'chip-active' : ''}`}
                style={{ 
                  padding: '3px 8px', 
                  fontSize: '11px',
                  backgroundColor: selectedTag === tag ? '#eff6ff' : '#ffffff',
                  color: selectedTag === tag ? '#2563eb' : '#475569',
                  borderColor: selectedTag === tag ? '#93c5fd' : '#e2e8f0'
                }}
                onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Memories Grid */}
      {filteredMemories.length === 0 ? (
        <div className="bento-card" style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
          <Database size={44} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#64748b' }}>No memories found</h3>
          <p style={{ fontSize: '12px', marginTop: 4 }}>
            Memories saved during agent task runs or added manually will appear here.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
          {filteredMemories.map(m => (
            <div key={m.id} className="bento-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span className={`nav-pill-badge ${m.type === 'global' ? 'pill-blue' : m.type === 'session' ? 'pill-amber' : 'pill-slate'}`}>
                    {m.type?.toUpperCase()}
                  </span>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                      {m.timestamp ? new Date(m.timestamp).toLocaleDateString() : 'Active'}
                    </span>
                    <button 
                      className="bubble-copy-btn" 
                      title="Delete memory"
                      onClick={() => handleDeleteMemory(m.id)}
                    >
                      <Trash2 size={13} color="#94a3b8" />
                    </button>
                  </div>
                </div>

                <p style={{ fontSize: '13px', color: '#1e293b', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 14 }}>
                  {m.content}
                </p>
              </div>

              <div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                  {m.tags && m.tags.map(t => (
                    <span key={t} className="task-category-pill pill-sky-cat" style={{ fontSize: '10px' }}>
                      #{t}
                    </span>
                  ))}
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>
                  Source: {m.source || 'orchestrator'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Knowledge Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-title-row">
              <h3 className="modal-title">Add Knowledge Note</h3>
              <button className="modal-close-btn" onClick={() => setShowAddModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSaveMemory} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>
                  Content / Knowledge Text
                </label>
                <textarea 
                  rows={4}
                  className="chat-text-input"
                  style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '10px 14px', resize: 'vertical' }}
                  placeholder="E.g., Architecture note: Multi-agent loop uses SQLite for persistent reflection and OpenRouter for LLM inference."
                  value={newContent}
                  onChange={e => setNewContent(e.target.value)}
                  autoFocus
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>
                    Scope / Type
                  </label>
                  <select 
                    style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '10px 14px', background: '#fff', fontSize: '13px' }}
                    value={newType}
                    onChange={e => setNewType(e.target.value)}
                  >
                    <option value="project">Project Context</option>
                    <option value="global">Global (Universal)</option>
                    <option value="session">Session Scoped</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>
                    Tags (comma separated)
                  </label>
                  <input 
                    type="text"
                    className="chat-text-input"
                    style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '10px 14px' }}
                    value={newTags}
                    onChange={e => setNewTags(e.target.value)}
                    placeholder="architecture, math, review"
                  />
                </div>
              </div>

              {error && <div style={{ color: '#dc2626', fontSize: '12px' }}>{error}</div>}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                <button type="button" className="btn-ghost-outline" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-join-primary" disabled={saving || !newContent.trim()}>
                  {saving ? 'Saving...' : 'Save Knowledge'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
