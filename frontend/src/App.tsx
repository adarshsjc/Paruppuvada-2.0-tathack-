import { useState, useEffect, useCallback } from 'react';
import { Bot, FolderKanban, Database, Settings as SettingsIcon, History } from 'lucide-react';
import './App.css';
import type { Project } from './types';
import { fetchHealth, fetchProjects } from './api';

import ChatWorkspace from './views/ChatWorkspace';
import ProjectSelector from './views/ProjectSelector';
import MemoryExplorer from './views/MemoryExplorer';
import Settings from './views/Settings';
import ExecutionHistory from './views/ExecutionHistory';

function App() {
  const [activeView, setActiveView] = useState('workspace');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [apiHealth, setApiHealth] = useState<{ llm_mode: string; llm_model: string; agent_count: number } | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      const projs = await fetchProjects();
      setProjects(projs);
      setSelectedProjectId(current => projs.length > 0 && !current ? projs[0].id : current);
    } catch (e) {
      console.error('Failed to load projects', e);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    fetchProjects().then(projs => {
      if (!mounted) return;
      setProjects(projs);
      setSelectedProjectId(current => projs.length > 0 && !current ? projs[0].id : current);
    }).catch(e => {
      console.error('Failed to load projects', e);
    });
    const checkHealth = async () => {
      try {
        const health = await fetchHealth();
        if (mounted) setApiHealth(health);
      } catch {
        if (mounted) setApiHealth(null);
      }
    };
    checkHealth();
    const interval = window.setInterval(checkHealth, 10000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [loadProjects]);

  const selectedProjectName = projects.find(p => p.id === selectedProjectId)?.name || 'Global Mode';

  const renderView = () => {
    switch (activeView) {
      case 'workspace':
        return <ChatWorkspace projectId={selectedProjectId} />;
      case 'projects':
        return <ProjectSelector projects={projects} selectedId={selectedProjectId} onSelect={setSelectedProjectId} onRefresh={loadProjects} />;
      case 'memory':
        return <MemoryExplorer projectId={selectedProjectId} />;
      case 'history':
        return <ExecutionHistory />;
      case 'settings':
        return <Settings />;
      default:
        return <ChatWorkspace projectId={selectedProjectId} />;
    }
  };

  return (
    <div className="app-container">
      <div className="sidebar">
        <div className="sidebar-header">
          <Bot size={28} color="var(--accent)" />
          <span>Antigravity Platform</span>
        </div>
        <div className="nav-menu">
          <button className={`nav-item ${activeView === 'workspace' ? 'active' : ''}`} onClick={() => setActiveView('workspace')}>
            <Bot size={20} /> Workspace
          </button>
          <button className={`nav-item ${activeView === 'projects' ? 'active' : ''}`} onClick={() => setActiveView('projects')}>
            <FolderKanban size={20} /> Projects
          </button>
          <button className={`nav-item ${activeView === 'memory' ? 'active' : ''}`} onClick={() => setActiveView('memory')}>
            <Database size={20} /> Memory Explorer
          </button>
          <button className={`nav-item ${activeView === 'history' ? 'active' : ''}`} onClick={() => setActiveView('history')}>
            <History size={20} /> History (Mock)
          </button>
          <div style={{ flex: 1 }} />
          <button className={`nav-item ${activeView === 'settings' ? 'active' : ''}`} onClick={() => setActiveView('settings')}>
            <SettingsIcon size={20} /> Settings
          </button>
        </div>
      </div>
      
      <div className="main-content">
        <div className="top-bar">
          <div className="flex-row">
            <span style={{ color: 'var(--text-muted)' }}>Current Project:</span>
            <span className="badge badge-blue">{selectedProjectName}</span>
          </div>
          <div className="flex-row">
             <div className={`service-badge ${apiHealth ? 'service-online' : 'service-offline'}`}>
               {apiHealth
                 ? `API Online · ${apiHealth.llm_mode}${apiHealth.llm_model ? ` · ${apiHealth.llm_model}` : ''} · ${apiHealth.agent_count} agents`
                 : 'API Offline · start the backend'}
             </div>
          </div>
        </div>
        <div className="view-container">
           {renderView()}
        </div>
      </div>
    </div>
  );
}

export default App;
