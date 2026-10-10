import { useState, useEffect, useCallback } from 'react';
import { 
  FolderKanban, 
  Database, 
  Settings as SettingsIcon, 
  History, 
  LayoutDashboard, 
  MessageSquare, 
  Search, 
  Bell, 
  Sparkles, 
  Zap, 
  ChevronRight,
  Compass
} from 'lucide-react';
import './App.css';
import type { Project } from './types';
import { fetchHealth, fetchProjects, pingBackend } from './api';

import DashboardView from './views/DashboardView';
import ChatWorkspace from './views/ChatWorkspace';
import ProjectSelector from './views/ProjectSelector';
import MemoryExplorer from './views/MemoryExplorer';
import Settings from './views/Settings';
import ExecutionHistory from './views/ExecutionHistory';
import MemoryWorkspace from './views/memory/MemoryWorkspace';

function App() {
  const [activeView, setActiveView] = useState<'dashboard' | 'open_chat' | 'projects' | 'memory' | 'history' | 'settings' | 'memory_mgmt'>('dashboard');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [pendingPrompt, setPendingPrompt] = useState<string>('');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [backendInfo, setBackendInfo] = useState<{ provider?: string; model?: string }>({});
  const [apiHealth, setApiHealth] = useState<{ llm_mode: string; agent_count: number } | null>(null);
  const [selectedSkills, setSelectedSkills] = useState<string[] | undefined>(undefined);

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
    pingBackend().then(info => {
      if (mounted) setBackendInfo({ provider: info.provider, model: info.model });
    }).catch(() => {});
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

  // Trigger prompt from Dashboard into Open Chat
  const handleTriggerPrompt = (promptText: string) => {
    setPendingPrompt(promptText);
    setActiveView('open_chat');
  };

  const renderView = () => {
    switch (activeView) {
      case 'dashboard':
        return (
          <DashboardView 
            onTriggerPrompt={handleTriggerPrompt} 
            projectId={selectedProjectId} 
          />
        );
      case 'open_chat':
        return (
          <ChatWorkspace 
            projectId={selectedProjectId} 
            initialPrompt={pendingPrompt}
            selectedSkills={selectedSkills}
            onClearInitialPrompt={() => setPendingPrompt('')}
          />
        );
      case 'projects':
        return (
          <ProjectSelector 
            projects={projects} 
            selectedId={selectedProjectId} 
            onSelect={setSelectedProjectId} 
            onRefresh={loadProjects} 
            onOpenChatWithProject={(projectId: string, skills?: string[]) => {
              setSelectedProjectId(projectId);
              if (skills) setSelectedSkills(skills);
              setActiveView('open_chat');
            }}
          />
        );
      case 'memory':
        return (
          <MemoryExplorer 
            projectId={selectedProjectId} 
            onOpenGraph={() => setActiveView('memory_mgmt')} 
          />
        );
      case 'history':
        return (
          <ExecutionHistory 
            onSelectTask={handleTriggerPrompt} 
          />
        );
      case 'memory_mgmt':
        return (
          <MemoryWorkspace 
            projectId={selectedProjectId}
            onUseSkillsInChat={(skillIds) => {
               setSelectedSkills(skillIds);
               setActiveView('open_chat');
            }}
          />
        );
      case 'settings':
        return <Settings />;
      default:
        return (
          <DashboardView 
            onTriggerPrompt={handleTriggerPrompt} 
            projectId={selectedProjectId} 
          />
        );
    }
  };

  return (
    <div className="app-shell">
      {/* Left Sidebar */}
      {!isSidebarCollapsed && (
        <aside className="sidebar">
          <div className="sidebar-top">
            {/* Logo and App Identifier - Renamed to Open Chat */}
            <div className="sidebar-brand">
              <div className="brand-badge-wrap">
                <div className="brand-icon-box">
                  <Zap size={18} />
                </div>
                <div className="brand-text-wrap">
                  <span className="brand-name">Open Chat</span>
                  <span className="brand-pill">AI</span>
                </div>
              </div>
              <button 
                className="sidebar-collapse-btn" 
                onClick={() => setIsSidebarCollapsed(true)} 
                title="Collapse sidebar"
              >
                ◀
              </button>
            </div>

            {/* Profile / Workspace Switcher Pill */}
            <div className="profile-pill-wrap">
              <div 
                className="profile-card"
                onClick={() => setActiveView('projects')}
                title="Switch Workspace Project"
              >
                <div className="profile-main-row">
                  <div className="profile-avatar-wrap">
                    <img 
                      src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80" 
                      alt="Sam Smith" 
                      className="profile-avatar" 
                    />
                    <span className="avatar-online-dot"></span>
                  </div>

                  <div className="profile-meta">
                    <div className="profile-name-row">
                      <span className="profile-user-name">Sam Smith</span>
                      <ChevronRight size={13} color="#94a3b8" />
                    </div>
                    <span className="profile-user-role">UX Lead & Orchestration</span>
                  </div>
                </div>

                <div className="profile-sub-badge">
                  <span className="studio-indicator">
                    <span className="studio-dot"></span>
                    {selectedProjectName}
                  </span>
                  <span style={{ fontSize: '10px', color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
                    Active
                  </span>
                </div>
              </div>
            </div>

            {/* Navigation Menu */}
            <nav className="sidebar-nav">
              {/* Dashboard */}
              <button 
                className={`nav-link ${activeView === 'dashboard' ? 'active' : ''}`}
                onClick={() => setActiveView('dashboard')}
              >
                <div className="nav-link-left">
                  <LayoutDashboard className="nav-link-icon" />
                  <span>Dashboard</span>
                </div>
                {activeView === 'dashboard' && <span className="nav-active-dot"></span>}
              </button>

              {/* Open Chat (AI Assistant Renamed) */}
              <button 
                className={`nav-link ${activeView === 'open_chat' ? 'active' : ''}`}
                onClick={() => setActiveView('open_chat')}
              >
                <div className="nav-link-left">
                  <MessageSquare className="nav-link-icon" />
                  <span>Open Chat</span>
                </div>
                <span className="nav-pill-badge pill-amber">AI Active</span>
              </button>

              {/* Projects */}
              <button 
                className={`nav-link ${activeView === 'projects' ? 'active' : ''}`}
                onClick={() => setActiveView('projects')}
              >
                <div className="nav-link-left">
                  <FolderKanban className="nav-link-icon" />
                  <span>Projects</span>
                </div>
                <span className="nav-pill-badge pill-slate">{projects.length}</span>
              </button>

              {/* Memory Vault */}
              <button 
                className={`nav-link ${activeView === 'memory' ? 'active' : ''}`}
                onClick={() => setActiveView('memory')}
              >
                <div className="nav-link-left">
                  <Database className="nav-link-icon" />
                  <span>Memory Vault</span>
                </div>
              </button>

              {/* History */}
              <button 
                className={`nav-link ${activeView === 'history' ? 'active' : ''}`}
                onClick={() => setActiveView('history')}
              >
                <div className="nav-link-left">
                  <History className="nav-link-icon" />
                  <span>Execution Audit</span>
                </div>
              </button>

              {/* 3D Skill Graph & Memory */}
              <button 
                className={`nav-link ${activeView === 'memory_mgmt' ? 'active' : ''}`}
                onClick={() => setActiveView('memory_mgmt')}
              >
                <div className="nav-link-left">
                  <Compass className="nav-link-icon" />
                  <span>3D Skill Graph</span>
                </div>
                <span className="nav-pill-badge pill-amber">LIVE 3D</span>
              </button>
            </nav>
          </div>
          {/* Sidebar Bottom Section */}
          <div className="sidebar-bottom">
            {/* API Health Badge */}
            <div style={{ marginBottom: 10 }}>
              <div className={`service-badge ${apiHealth ? 'service-online' : 'service-offline'}`}>
                {apiHealth
                  ? `API Online · ${apiHealth.llm_mode} · ${apiHealth.agent_count} agents`
                  : 'API Offline · start backend'}
              </div>
            </div>

            {/* Assistant Status Widget */}
            <div className="sidebar-assistant-card">
              <div className="assistant-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="assistant-icon-badge">
                    <Sparkles size={14} />
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#1e293b' }}>
                    Open Chat Core
                  </span>
                </div>

                <div className="ping-indicator">
                  <span className="ping-dot-pulse"></span>
                  <span className="ping-dot-solid"></span>
                </div>
              </div>

              <p className="assistant-card-body">
                Autonomous agent loop active with <strong>SQLite memory</strong> & reflection.
              </p>

              <div className="assistant-progress-bar-wrap">
                <div className="progress-label-row">
                  <span>Engine Synchronization</span>
                  <span style={{ color: '#2563eb', fontWeight: 700 }}>100%</span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: '100%' }}></div>
                </div>
              </div>
            </div>

            {/* Settings Link */}
            <button 
              className={`nav-link ${activeView === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveView('settings')}
            >
              <div className="nav-link-left">
                <SettingsIcon className="nav-link-icon" />
                <span>Workspace Settings</span>
              </div>
            </button>
          </div>
        </aside>
      )}

      {/* Main Content Area */}
      <main className="main-wrapper">
        {/* Top Navigation & Status Bar */}
        <header className="top-nav-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {isSidebarCollapsed && (
              <button 
                className="icon-action-btn" 
                onClick={() => setIsSidebarCollapsed(false)}
                title="Expand sidebar"
                style={{ border: '1px solid #cbd5e1' }}
              >
                ▶
              </button>
            )}

            {/* Mode Breadcrumb Pills */}
            <div className="breadcrumbs-pill-box">
              <button 
                className={`mode-chip ${activeView === 'dashboard' ? 'active-chip' : ''}`}
                onClick={() => setActiveView('dashboard')}
              >
                DESK APP
              </button>
              <button 
                className={`mode-chip ${activeView === 'open_chat' ? 'active-chip' : ''}`}
                onClick={() => setActiveView('open_chat')}
              >
                OPEN CHAT
              </button>
              <span className="mode-chip-ai" style={{ padding: '4px 10px', fontSize: '11px' }}>
                <span className="pulse-emerald-dot"></span>
                AUTONOMOUS
              </span>
            </div>

            {/* Current Project Pill */}
            <div 
              className="smart-prioritization-pill" 
              style={{ cursor: 'pointer' }}
              onClick={() => setActiveView('projects')}
              title="Click to change project"
            >
              <span style={{ color: '#94a3b8', fontWeight: 600 }}>PROJECT:</span>
              <span style={{ fontWeight: 700, color: '#0f172a' }}>{selectedProjectName}</span>
            </div>
          </div>

          {/* Right Status Controls */}
          <div className="top-nav-right">
            {/* Provider Indicator */}
            <div className="smart-prioritization-pill">
              <span style={{ color: '#94a3b8', fontWeight: 500 }}>PROVIDER:</span>
              <span style={{ color: '#334155', fontWeight: 700 }}>
                {backendInfo.provider === 'ollama' ? 'OLLAMA LOCAL' : 
                 backendInfo.provider === 'openrouter' ? 'OPENROUTER' :
                 backendInfo.provider === 'mock' ? 'MOCK MODE' :
                 backendInfo.provider?.toUpperCase() || 'CONNECTING...'}
              </span>
              <span style={{ width: 1, height: 12, backgroundColor: '#cbd5e1', margin: '0 2px' }}></span>
              <span className="pill-tag-blue">
                {backendInfo.model || 'N/A'}
              </span>
            </div>

            {/* Quick Action Buttons */}
            <div className="quick-actions-pill-box">
              <button 
                className="icon-action-btn" 
                title="Global Search"
                onClick={() => setActiveView('memory')}
              >
                <Search size={16} />
              </button>
              <button 
                className="icon-action-btn" 
                title="Notifications"
                onClick={() => alert('All multi-agent workflows operating with normal latency.')}
              >
                <Bell size={16} />
                <span className="notif-badge-dot"></span>
              </button>
            </div>

            {/* API Status Badge */}
            <div className="api-status-badge">
              <span className="pulse-emerald-dot"></span>
              {backendInfo.provider === 'ollama' ? 'Ollama Local' : 
               backendInfo.provider === 'mock' ? 'Mock Mode' :
               backendInfo.provider ? `${backendInfo.provider} API` : 'API Online'}
            </div>
          </div>
        </header>

        {/* View Container */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {renderView()}
        </div>
      </main>
    </div>
  );
}

export default App;
