import { useState, useEffect, useCallback } from 'react';
import { createProject, fetchProjects, deleteProject, restoreProject, purgeProject } from '../api';
import type { Project } from '../types';
import { Trash2, RotateCcw, ArchiveRestore, Loader2, ChevronDown } from 'lucide-react';

export default function ProjectSelector({ projects, selectedId, onSelect, onRefresh }: { projects: Project[], selectedId: string, onSelect: (id: string) => void, onRefresh: () => void }) {
  const [newProject, setNewProject] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  // Recycle bin state
  const [deletedProjects, setDeletedProjects] = useState<Project[]>([]);
  const [showBin, setShowBin] = useState(false);
  const [binError, setBinError] = useState('');

  const loadDeleted = useCallback(async () => {
    try {
      setBinError('');
      setDeletedProjects(await fetchProjects(true));
    } catch (e: any) {
      setBinError(e.message);
    }
  }, []);

  useEffect(() => {
    loadDeleted();
  }, [loadDeleted]);

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

  const handleDelete = async (p: Project) => {
    if (!window.confirm(`Move workspace "${p.name}" to the Recycle Bin?\nIts memory will be hidden until you restore it or delete it forever.`)) return;
    setBusyId(p.id);
    setError('');
    try {
      await deleteProject(p.id);
      if (selectedId === p.id) onSelect('');
      onRefresh();
      await loadDeleted();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId('');
    }
  };

  const handleRestore = async (p: Project) => {
    setBusyId(p.id);
    setBinError('');
    try {
      await restoreProject(p.id);
      onRefresh();
      await loadDeleted();
    } catch (e: any) {
      setBinError(e.message);
    } finally {
      setBusyId('');
    }
  };

  const handlePurge = async (p: Project) => {
    if (!window.confirm(`Permanently delete workspace "${p.name}"?\nThis also deletes all of its memory forever. This cannot be undone.`)) return;
    setBusyId(p.id);
    setBinError('');
    try {
      await purgeProject(p.id);
      onRefresh();
      await loadDeleted();
    } catch (e: any) {
      setBinError(e.message);
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="glass-panel" style={{ maxWidth: '600px', margin: '0 auto' }}>
      <h2>Project Workspace</h2>
      <p>Select a project context for tasks to isolate memory and execution. Deleted workspaces go to the Recycle Bin.</p>
      
      <div className="flex-col" style={{ marginTop: '24px' }}>
        <div className={`memory-card ${!selectedId ? 'active' : ''}`} style={{ borderColor: !selectedId ? 'var(--accent)' : '' }} onClick={() => onSelect('')}>
          <div style={{ fontWeight: 600 }}>Global Workspace (No Project)</div>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Tasks run here only have access to global memory.</div>
        </div>

        {projects.map(p => (
           <div key={p.id} className={`memory-card ${selectedId === p.id ? 'active' : ''}`} style={{ borderColor: selectedId === p.id ? 'var(--accent)' : '', cursor: 'pointer' }} onClick={() => onSelect(p.id)}>
             <div className="flex-row" style={{ justifyContent: 'space-between' }}>
               <div style={{ fontWeight: 600 }}>{p.name}</div>
               <button
                 className="icon-btn"
                 title="Move to Recycle Bin"
                 disabled={busyId === p.id}
                 onClick={(e) => { e.stopPropagation(); handleDelete(p); }}
               >
                 {busyId === p.id ? <Loader2 className="spinner" size={16} /> : <Trash2 size={16} />}
               </button>
             </div>
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

      {/* Recycle Bin */}
      <div className="recycle-section">
        <div className="bin-header" onClick={() => setShowBin(v => !v)}>
          <div className="flex-row">
            <ArchiveRestore size={18} color="var(--text-muted)" />
            <h3 style={{ margin: 0 }}>Recycle Bin</h3>
            <span className="badge badge-red">{deletedProjects.length}</span>
          </div>
          <ChevronDown size={18} style={{ transform: showBin ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </div>

        {showBin && (
          <div style={{ marginTop: '16px' }}>
            {binError && <div style={{ color: 'var(--error)', marginBottom: '8px' }}>{binError}</div>}
            {deletedProjects.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: '8px' }}>
                The Recycle Bin is empty.
              </div>
            ) : (
              deletedProjects.map(p => (
                <div key={p.id} className="memory-card bin-item">
                  <div className="flex-row" style={{ justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ID: {p.id}</div>
                    </div>
                    <div className="flex-row">
                      <button className="btn btn-ghost" disabled={busyId === p.id} onClick={() => handleRestore(p)}>
                        {busyId === p.id ? <Loader2 className="spinner" size={16} /> : <RotateCcw size={16} />} Restore
                      </button>
                      <button className="btn btn-danger" disabled={busyId === p.id} onClick={() => handlePurge(p)}>
                        <Trash2 size={16} /> Delete Forever
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
