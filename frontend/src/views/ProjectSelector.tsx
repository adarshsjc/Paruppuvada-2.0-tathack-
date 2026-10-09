import { useState } from 'react';
import { createProject } from '../api';
import type { Project } from '../types';

export default function ProjectSelector({ projects, selectedId, onSelect, onRefresh }: { projects: Project[], selectedId: string, onSelect: (id: string) => void, onRefresh: () => void }) {
  const [newProject, setNewProject] = useState('');
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!newProject.trim()) return;
    try {
      setError('');
      await createProject(newProject.trim());
      setNewProject('');
      onRefresh();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="glass-panel" style={{ maxWidth: '600px', margin: '0 auto' }}>
      <h2>Project Workspace</h2>
      <p>Select a project context for tasks to isolate memory and execution.</p>
      
      <div className="flex-col" style={{ marginTop: '24px' }}>
        <div className={`memory-card ${!selectedId ? 'active' : ''}`} style={{ borderColor: !selectedId ? 'var(--accent)' : '' }} onClick={() => onSelect('')}>
          <div style={{ fontWeight: 600 }}>Global Workspace (No Project)</div>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Tasks run here only have access to global memory.</div>
        </div>

        {projects.map(p => (
           <div key={p.id} className={`memory-card ${selectedId === p.id ? 'active' : ''}`} style={{ borderColor: selectedId === p.id ? 'var(--accent)' : '', cursor: 'pointer' }} onClick={() => onSelect(p.id)}>
             <div style={{ fontWeight: 600 }}>{p.name}</div>
             <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>ID: {p.id}</div>
           </div>
        ))}
      </div>

      <h3 style={{ marginTop: '32px' }}>Create New Project</h3>
      <div className="flex-row">
        <input className="input" value={newProject} onChange={e => setNewProject(e.target.value)} placeholder="Project Name" />
        <button className="btn btn-primary" onClick={handleCreate}>Create</button>
      </div>
      {error && <div style={{ color: 'var(--error)', marginTop: '8px' }}>{error}</div>}
    </div>
  );
}
