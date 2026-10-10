import { useState, useEffect, useMemo } from 'react';
import { createProject, fetchProjectSkills } from '../api';
import * as memoryApi from '../memory/api';
import type { SkillInfo, SkillCategory } from '../memory/types';
import type { Project } from '../types';
import { 
  Plus, 
  Check, 
  Globe, 
  Layers, 
  ArrowRight, 
  BrainCircuit, 
  Search, 
  MessageSquare
} from 'lucide-react';

export default function ProjectSelector({ 
  projects, 
  selectedId, 
  onSelect, 
  onRefresh,
  onOpenChatWithProject
}: { 
  projects: Project[]; 
  selectedId: string; 
  onSelect: (id: string) => void; 
  onRefresh: () => void;
  onOpenChatWithProject?: (projectId: string, selectedSkills?: string[]) => void;
}) {
  const [newProject, setNewProject] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  // Skill selection state for new project
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [categories, setCategories] = useState<SkillCategory[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set([
    'skill:web-search',
    'skill:calculation',
    'skill:memory-search'
  ]));
  const [skillSearch, setSkillSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [loadingSkills, setLoadingSkills] = useState(true);

  // Load available skills & categories
  useEffect(() => {
    let mounted = true;
    memoryApi.fetchSkills()
      .then(data => {
        if (!mounted) return;
        setSkills(data.skills);
        setCategories(data.categories);
      })
      .catch(err => {
        console.error('Failed to load skills library:', err);
      })
      .finally(() => {
        if (mounted) setLoadingSkills(false);
      });
    return () => { mounted = false; };
  }, []);

  const toggleSkill = (id: string) => {
    setSelectedSkills(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredSkills = useMemo(() => {
    return skills.filter(s => {
      const matchesCat = categoryFilter === 'all' || s.category_id === categoryFilter;
      const q = skillSearch.toLowerCase().trim();
      const matchesSearch = !q || 
        s.name.toLowerCase().includes(q) || 
        s.description.toLowerCase().includes(q) ||
        s.allowed_tools.some(t => t.toLowerCase().includes(q));
      return matchesCat && matchesSearch;
    });
  }, [skills, categoryFilter, skillSearch]);

  const catName = (catId: string) => {
    return categories.find(c => c.id === catId)?.name || catId.replace('cat:', '');
  };

  const handleCreate = async (e?: React.FormEvent, openChat: boolean = false) => {
    if (e) e.preventDefault();
    if (!newProject.trim() || creating) return;
    setCreating(true);
    try {
      setError('');
      const skillsArray = [...selectedSkills];
      const created = await createProject(newProject.trim(), skillsArray.length > 0 ? skillsArray : undefined);
      setNewProject('');
      onRefresh();
      onSelect(created.id);
      
      if (openChat && onOpenChatWithProject) {
        onOpenChatWithProject(created.id, skillsArray);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  const handleOpenExistingProjectInChat = async (projectId: string) => {
    onSelect(projectId);
    if (onOpenChatWithProject) {
      const skills = await fetchProjectSkills(projectId);
      onOpenChatWithProject(projectId, skills.length > 0 ? skills : undefined);
    }
  };

  return (
    <div className="dashboard-content" style={{ maxWidth: '1180px' }}>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 className="hero-heading" style={{ justifyContent: 'flex-start', fontSize: '1.8rem', gap: 10 }}>
            <Layers size={26} color="#2563eb" /> Project Workspaces
          </h1>
          <p className="hero-subheading">
            Create scoped project environments with specialized agent skills, persistent memory, and dedicated chat interfaces.
          </p>
        </div>
      </div>

      {/* Existing Workspaces Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20, marginBottom: 36 }}>
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
            Tasks run here operate across universal memory with all capabilities available without project isolation.
          </p>

          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#94a3b8' }}>
            <span>Type: Default Root</span>
            {onOpenChatWithProject && (
              <button 
                type="button" 
                className="btn-ghost-outline"
                style={{ padding: '3px 8px', fontSize: '11px', color: '#2563eb' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenChatWithProject('');
                }}
              >
                Open Chat <ArrowRight size={11} />
              </button>
            )}
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
                <button 
                  type="button" 
                  className="btn-ghost-outline"
                  style={{ padding: '3px 8px', fontSize: '11px', color: '#2563eb', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenExistingProjectInChat(p.id);
                  }}
                  title="Open dedicated chat interface for this project"
                >
                  Open Chat <ArrowRight size={11} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create New Project with Skill Selection Section */}
      <div className="bento-card" style={{ padding: '24px 28px', backgroundColor: '#ffffff', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
        <div className="card-header-row" style={{ marginBottom: 16 }}>
          <div className="card-title-group">
            <div className="card-icon-pill pill-emerald-icon" style={{ width: 34, height: 34 }}>
              <Plus size={18} />
            </div>
            <div>
              <h2 className="card-heading" style={{ fontSize: '18px' }}>Create New Project Workspace</h2>
              <p style={{ fontSize: '12px', color: '#64748b', marginTop: 2 }}>
                Configure project name, select specialized skills, and launch straight into the new chat workspace.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={e => handleCreate(e, false)}>
          {/* Project Name Input */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#1e293b', marginBottom: 6 }}>
              Project Name <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input 
              type="text" 
              className="hero-prompt-input" 
              style={{ 
                border: '1px solid #cbd5e1', 
                borderRadius: '10px', 
                padding: '10px 14px', 
                backgroundColor: '#fff',
                fontSize: '14px',
                width: '100%',
                boxSizing: 'border-box'
              }}
              value={newProject} 
              onChange={e => setNewProject(e.target.value)} 
              placeholder="e.g. Phoenix Autonomy, E-Commerce Analytics, Code Refactoring Engine..." 
              disabled={creating}
            />
          </div>

          {/* Skill Selector Section */}
          <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <BrainCircuit size={18} color="#2563eb" />
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                  Select Agent Skills for this Project
                </span>
                <span className="nav-pill-badge pill-emerald-cat" style={{ fontSize: '11px', padding: '2px 8px' }}>
                  {selectedSkills.size} Selected
                </span>
              </div>

              {/* Quick Actions */}
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="chip-btn"
                  style={{ fontSize: '11px', padding: '3px 8px' }}
                  onClick={() => {
                    const allIds = new Set(skills.map(s => s.id));
                    setSelectedSkills(allIds);
                  }}
                >
                  Select All ({skills.length})
                </button>
                <button
                  type="button"
                  className="chip-btn"
                  style={{ fontSize: '11px', padding: '3px 8px' }}
                  onClick={() => setSelectedSkills(new Set(['skill:web-search', 'skill:calculation', 'skill:memory-search']))}
                >
                  Recommended
                </button>
                <button
                  type="button"
                  className="chip-btn"
                  style={{ fontSize: '11px', padding: '3px 8px' }}
                  onClick={() => setSelectedSkills(new Set())}
                >
                  Clear
                </button>
              </div>
            </div>

            <p style={{ fontSize: '12px', color: '#64748b', marginBottom: 12 }}>
              When chat runs in <strong>Complex Mode</strong>, the agent ensemble actively coordinates with these skills, tools, and execution rules.
            </p>

            {/* Filter and Search Bar */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: '1 1 240px' }}>
                <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: 10, top: 10 }} />
                <input
                  type="text"
                  placeholder="Search skills, tools, keywords..."
                  value={skillSearch}
                  onChange={e => setSkillSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '7px 10px 7px 32px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: '12px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Category Pills */}
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', flex: '2 1 360px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setCategoryFilter('all')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontSize: '11px',
                    fontWeight: categoryFilter === 'all' ? 700 : 500,
                    border: categoryFilter === 'all' ? '1px solid #2563eb' : '1px solid #e2e8f0',
                    background: categoryFilter === 'all' ? '#eff6ff' : '#ffffff',
                    color: categoryFilter === 'all' ? '#1d4ed8' : '#64748b',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  All Categories ({skills.length})
                </button>
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryFilter(cat.id)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      fontSize: '11px',
                      fontWeight: categoryFilter === cat.id ? 700 : 500,
                      border: categoryFilter === cat.id ? '1px solid #2563eb' : '1px solid #e2e8f0',
                      background: categoryFilter === cat.id ? '#eff6ff' : '#ffffff',
                      color: categoryFilter === cat.id ? '#1d4ed8' : '#64748b',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Skills Grid */}
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', 
              gap: 10,
              maxHeight: '320px',
              overflowY: 'auto',
              padding: '6px',
              backgroundColor: '#f8fafc',
              borderRadius: 12,
              border: '1px solid #e2e8f0'
            }}>
              {loadingSkills && (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '24px', color: '#64748b', fontSize: '13px' }}>
                  Loading skills library...
                </div>
              )}

              {!loadingSkills && filteredSkills.map(skill => {
                const isSelected = selectedSkills.has(skill.id);
                return (
                  <div
                    key={skill.id}
                    onClick={() => toggleSkill(skill.id)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: isSelected ? '1.5px solid #10b981' : '1px solid #e2e8f0',
                      backgroundColor: isSelected ? '#ffffff' : '#ffffff',
                      boxShadow: isSelected ? '0 2px 8px rgba(16, 185, 129, 0.12)' : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, marginBottom: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input 
                            type="checkbox" 
                            checked={isSelected} 
                            onChange={() => {}} // handled by parent onClick
                            style={{ cursor: 'pointer', accentColor: '#10b981' }}
                          />
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>
                            {skill.name}
                          </span>
                        </div>
                        <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: 4, background: '#f1f5f9', color: '#64748b', whiteSpace: 'nowrap' }}>
                          {catName(skill.category_id)}
                        </span>
                      </div>

                      <p style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.4, margin: '4px 0 8px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {skill.description}
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                      {skill.allowed_tools.slice(0, 3).map(tool => (
                        <span 
                          key={tool} 
                          style={{ 
                            fontSize: '9px', 
                            padding: '1px 5px', 
                            borderRadius: 4, 
                            background: isSelected ? '#ecfdf5' : '#f8fafc', 
                            color: isSelected ? '#047857' : '#64748b',
                            border: `1px solid ${isSelected ? '#a7f3d0' : '#e2e8f0'}`
                          }}
                        >
                          {tool}
                        </span>
                      ))}
                      {skill.prerequisites.length > 0 && (
                        <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: 4, background: '#fffbeb', color: '#b45309', border: '1px solid #fef3c7' }}>
                          req: {skill.prerequisites[0].replace('skill:', '')}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {!loadingSkills && filteredSkills.length === 0 && (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: '12px' }}>
                  No skills found matching "{skillSearch}".
                </div>
              )}
            </div>
          </div>

          {error && (
            <div style={{ color: '#dc2626', backgroundColor: '#fef2f2', border: '1px solid #fecaca', padding: '8px 12px', borderRadius: 8, fontSize: '12px', marginTop: 14 }}>
              {error}
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 22, paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
            <button 
              type="submit" 
              className="btn-ghost-outline" 
              disabled={creating || !newProject.trim()}
              style={{ padding: '9px 16px', fontSize: '13px' }}
            >
              Create Project Only
            </button>
            <button 
              type="button" 
              className="btn-join-primary" 
              disabled={creating || !newProject.trim()}
              onClick={() => handleCreate(undefined, true)}
              style={{ 
                padding: '9px 20px', 
                fontSize: '13px', 
                display: 'flex', 
                alignItems: 'center', 
                gap: 8,
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                boxShadow: '0 2px 10px rgba(37, 99, 235, 0.25)'
              }}
              title="Create project, attach chosen skills, and immediately open the chat workspace"
            >
              <MessageSquare size={15} />
              {creating ? 'Creating & Launching...' : 'Create & Launch Chat Workspace ➔'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
