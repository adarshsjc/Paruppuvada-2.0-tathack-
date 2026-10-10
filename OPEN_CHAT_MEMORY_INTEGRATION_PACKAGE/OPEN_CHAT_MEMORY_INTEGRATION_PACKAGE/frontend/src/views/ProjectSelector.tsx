import { useState } from 'react';
import { createProject } from '../api';
import type { Project } from '../types';
import { Plus, Check, Globe, Layers, ArrowRight } from 'lucide-react';

export default function ProjectSelector({ 
  projects, 
  selectedId, 
  onSelect, 
  onRefresh 
}: { 
  projects: Project[]; 
  selectedId: string; 
  onSelect: (id: string) => void; 
  onRefresh: () => void;
}) {
  const [newProject, setNewProject] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProject.trim()) return;
    setCreating(true);
    try {
      setError('');
      const created = await createProject(newProject.trim());
      setNewProject('');
      onRefresh();
      onSelect(created.id);
    } catch (e: any) {
      setError(e.message || 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="dashboard-content" style={{ maxWidth: '1080px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 className="hero-heading" style={{ justifyContent: 'flex-start', fontSize: '1.8rem' }}>
          Project Workspaces
        </h1>
        <p className="hero-subheading">
          Select or isolate agent execution memory, tools, and logs per project.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
        {/* Global Workspace Card */}
        <div 
          className="bento-card" 
          style={{ 
            cursor: 'pointer',
            borderColor: !selectedId ? '#2563eb' : 'rgba(226, 232, 240, 0.85)',
            boxShadow: !selectedId ? 'var(--shadow-floating)' : 'var(--shadow-soft)',
            position: 'relative'
          }}
          onClick={() => onSelect('')}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div className="card-icon-pill pill-sky-icon">
              <Globe size={16} />
            </div>
            {!selectedId ? (
              <span className="nav-pill-badge pill-blue" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Check size={12} /> Active
              </span>
            ) : (
              <span className="nav-pill-badge pill-slate">Global</span>
            )}
          </div>

          <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
            Global Workspace
          </h3>
          <p style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>
            Tasks run here operate across universal memory with no project boundaries.
          </p>

          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8' }}>
            <span>Type: Default Root</span>
            <span>All Agents Available</span>
          </div>
        </div>

        {/* Project Cards */}
        {projects.map(p => {
          const isSelected = selectedId === p.id;
          return (
            <div 
              key={p.id} 
              className="bento-card" 
              style={{ 
                cursor: 'pointer',
                borderColor: isSelected ? '#2563eb' : 'rgba(226, 232, 240, 0.85)',
                boxShadow: isSelected ? 'var(--shadow-floating)' : 'var(--shadow-soft)',
                position: 'relative'
              }}
              onClick={() => onSelect(p.id)}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div className="card-icon-pill pill-indigo-icon">
                  <Layers size={16} />
                </div>
                {isSelected ? (
                  <span className="nav-pill-badge pill-blue" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Check size={12} /> Active
                  </span>
                ) : (
                  <span className="nav-pill-badge pill-slate">Isolated</span>
                )}
              </div>

              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
                {p.name}
              </h3>
              <p style={{ fontSize: '12px', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
                UUID: {p.id.slice(0, 18)}...
              </p>

              <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#64748b' }}>
                <span>Memory Scoped</span>
                <span style={{ color: '#2563eb', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                  Switch Context <ArrowRight size={12} />
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create New Project Section */}
      <div className="bento-card" style={{ marginTop: 24, maxWidth: '580px' }}>
        <div className="card-header-row" style={{ marginBottom: 12 }}>
          <div className="card-title-group">
            <div className="card-icon-pill pill-emerald-icon">
              <Plus size={16} />
            </div>
            <h2 className="card-heading">Create New Project</h2>
          </div>
        </div>

        <p style={{ fontSize: '12px', color: '#64748b', marginBottom: 16 }}>
          Define an isolated environment for multi-agent tasks, notes, and calculation history.
        </p>

        <form onSubmit={handleCreate} style={{ display: 'flex', gap: 10 }}>
          <input 
            type="text" 
            className="hero-prompt-input" 
            style={{ 
              border: '1px solid #cbd5e1', 
              borderRadius: '12px', 
              padding: '10px 14px', 
              backgroundColor: '#fff',
              fontSize: '13px'
            }}
            value={newProject} 
            onChange={e => setNewProject(e.target.value)} 
            placeholder="e.g. Phoenix Autonomy, Project Chimera..." 
            disabled={creating}
          />
          <button 
            type="submit" 
            className="btn-join-primary" 
            disabled={creating || !newProject.trim()}
            style={{ whiteSpace: 'nowrap' }}
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </form>

        {error && (
          <div style={{ color: '#dc2626', fontSize: '12px', marginTop: 10 }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
