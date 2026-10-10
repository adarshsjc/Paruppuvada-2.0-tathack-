import { useState } from 'react';
import { 
  Sparkles, 
  Send, 
  Mic, 
  Clock, 
  Play, 
  Pause, 
  Video, 
  Plus, 
  CheckSquare, 
  ChevronRight,
  Loader2
} from 'lucide-react';

interface TaskItem {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  categoryClass: string;
  due: string;
  dueClass: string;
  completed: boolean;
}

export default function DashboardView({ 
  onTriggerPrompt,
  projectId: _projectId
}: { 
  onTriggerPrompt: (promptText: string) => void;
  projectId?: string;
}) {
  const [promptInput, setPromptInput] = useState('');
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [activeTaskFilter, setActiveTaskFilter] = useState<'all' | 'in_progress' | 'review'>('all');
  
  // Interactive Suggested Tasks state
  const [tasks, setTasks] = useState<TaskItem[]>([
    {
      id: 't-1',
      title: 'Token Transfer Flow Improvements',
      subtitle: 'Design component states and validation logic',
      category: 'UX Design',
      categoryClass: 'pill-purple-cat',
      due: 'Today',
      dueClass: 'due-today',
      completed: false
    },
    {
      id: 't-2',
      title: 'Quarterly Marketing Review and Creative Strategy',
      subtitle: 'Sync with brand guidelines & deliverables',
      category: 'Strategy',
      categoryClass: 'pill-amber-cat',
      due: 'Tomorrow',
      dueClass: 'due-slate',
      completed: false
    },
    {
      id: 't-3',
      title: 'Partnership Strategy Sync: Collaboration Alignment',
      subtitle: 'Review joint press statement and API docs',
      category: 'Partnership',
      categoryClass: 'pill-emerald-cat',
      due: 'Apr 25',
      dueClass: 'due-slate',
      completed: false
    },
    {
      id: 't-4',
      title: 'Weekly Project Oversight and Delivery Coordination',
      subtitle: 'Compile sprint velocity for leadership',
      category: 'Project Mgmt',
      categoryClass: 'pill-sky-cat',
      due: 'Apr 26',
      dueClass: 'due-slate',
      completed: false
    }
  ]);

  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskCategory, setNewTaskCategory] = useState('UX Design');

  const handlePromptSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!promptInput.trim()) return;
    onTriggerPrompt(promptInput.trim());
  };

  const toggleTaskCompletion = (taskId: string) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t));
  };

  const handleAddNewTask = () => {
    if (!newTaskTitle.trim()) return;
    const newTask: TaskItem = {
      id: `t-${Date.now()}`,
      title: newTaskTitle.trim(),
      subtitle: 'Created via Open Chat AI Assistant',
      category: newTaskCategory,
      categoryClass: newTaskCategory === 'UX Design' ? 'pill-purple-cat' : newTaskCategory === 'Strategy' ? 'pill-amber-cat' : 'pill-sky-cat',
      due: 'Soon',
      dueClass: 'due-slate',
      completed: false
    };
    setTasks(prev => [newTask, ...prev]);
    setNewTaskTitle('');
    setShowAddTaskModal(false);
  };

  const filteredTasks = tasks.filter(t => {
    if (activeTaskFilter === 'in_progress') return !t.completed;
    if (activeTaskFilter === 'review') return t.completed;
    return true;
  });

  return (
    <div className="dashboard-content">
      {/* Hero Greeting and Central AI Search */}
      <section className="hero-section">
        <div className="hero-status-pill">
          <Loader2 size={13} className="spinner" />
          <span>Open Chat Intelligence Core Active</span>
        </div>

        <h1 className="hero-heading">
          Welcome, Sam! <span style={{ display: 'inline-block', animation: 'wavePulse 2s infinite' }}>👋</span>
        </h1>
        <p className="hero-subheading">
          How can Open Chat assist your autonomous workflows today?
        </p>

        {/* Central Search & Prompt Input */}
        <div className="hero-prompt-container">
          <form onSubmit={handlePromptSubmit} className="hero-prompt-bar">
            <div className="prompt-icon-sparkle">
              <Sparkles size={20} />
            </div>
            <input 
              type="text" 
              className="hero-prompt-input"
              value={promptInput}
              onChange={e => setPromptInput(e.target.value)}
              placeholder="Ask Open Chat or initiate a multi-agent plan..."
            />
            <div className="hero-prompt-actions">
              <button 
                type="button" 
                className="voice-btn" 
                title="Voice dictation"
                onClick={() => setPromptInput('Calculate 347 * 829 and save the result')}
              >
                <Mic size={17} />
              </button>
              <button 
                type="submit" 
                className="send-action-btn"
                title="Send task to Open Chat"
                disabled={!promptInput.trim()}
              >
                <Send size={16} />
              </button>
            </div>
          </form>

          {/* Quick-Action Preset Chips */}
          <div className="prompt-suggestion-chips">
            <button 
              className="chip-btn"
              onClick={() => onTriggerPrompt('Calculate 347 * 829')}
            >
              ⚡ Calculate 347 * 829
            </button>
            <button 
              className="chip-btn"
              onClick={() => onTriggerPrompt('Save project note: Finalized token architecture with latency < 500ms')}
            >
              📝 Save Project Note
            </button>
            <button 
              className="chip-btn"
              onClick={() => onTriggerPrompt('Search memory for architecture')}
            >
              🔍 Search Architecture Memory
            </button>
            <button 
              className="chip-btn"
              onClick={() => onTriggerPrompt('Analyze project scope and generate next steps')}
            >
              📊 Analyze Sprint Scope
            </button>
          </div>
        </div>
      </section>

      {/* Stratify Bento Grid */}
      <div className="bento-grid">
        {/* LEFT COLUMN (5 cols) */}
        <div className="bento-column">
          {/* Card 1: Previously Viewed Files */}
          <article className="bento-card">
            <div className="card-header-row">
              <div className="card-title-group">
                <div className="card-icon-pill pill-amber-icon">
                  <Clock size={16} />
                </div>
                <h2 className="card-heading">Previously viewed files</h2>
              </div>
              <button className="card-header-action">
                View all
              </button>
            </div>

            <div className="file-list">
              {/* Miro File */}
              <div className="file-item">
                <div className="file-left">
                  <div className="file-badge-letter letter-amber">M</div>
                  <div className="file-info">
                    <p className="file-title">Miro - Product Analytics and Statistics</p>
                    <p className="file-meta">Edited 24m ago • .miro board</p>
                  </div>
                </div>
                <span className="file-tag-badge">Shared</span>
              </div>

              {/* Figma File */}
              <div className="file-item">
                <div className="file-left">
                  <div className="file-badge-letter letter-purple">F</div>
                  <div className="file-info">
                    <p className="file-title">Figma - UX Research & Prototypes</p>
                    <p className="file-meta">Edited 2h ago • .fig master</p>
                  </div>
                </div>
                <span className="file-tag-badge">Phenomenon</span>
              </div>

              {/* PDF File */}
              <div className="file-item">
                <div className="file-left">
                  <div className="file-badge-letter letter-rose">PDF</div>
                  <div className="file-info">
                    <p className="file-title">R2 Strategic Goals & Objectives.pdf</p>
                    <p className="file-meta">Uploaded yesterday • 4.8 MB</p>
                  </div>
                </div>
                <span className="file-tag-badge">Q2 Plan</span>
              </div>
            </div>
          </article>

          {/* Card 2: Connected Integrations & Quick Audio Player */}
          <article className="bento-card">
            <div className="card-header-row">
              <div className="card-title-group">
                <div className="card-icon-pill pill-sky-icon">
                  <Sparkles size={16} />
                </div>
                <h2 className="card-heading">Connected Integrations</h2>
              </div>
              <button className="card-header-action">
                Manage <ChevronRight size={14} />
              </button>
            </div>

            {/* Integration App Icons Row */}
            <div className="integrations-icon-row">
              <button className="integration-btn" title="Notion Connected">N</button>
              <button className="integration-btn" style={{ color: '#d97706' }} title="Slack Connected">#</button>
              <button className="integration-btn" style={{ color: '#059669' }} title="Google Drive">▲</button>
              <button className="integration-btn" style={{ color: '#7c3aed' }} title="Figma">❖</button>
              <button className="integration-btn" style={{ color: '#2563eb' }} title="Zoom">Z</button>
              <button className="integration-btn integration-add-btn" title="Connect New Integration" onClick={() => alert('Integration hub: Notion, Slack, Drive connected.')}>
                <Plus size={16} />
              </button>
            </div>

            {/* Audio Waveform Player Preview */}
            <div className="audio-player-card">
              <button 
                className="audio-play-circle" 
                onClick={() => setIsPlayingAudio(!isPlayingAudio)}
                title={isPlayingAudio ? "Pause recap snippet" : "Play recap snippet"}
              >
                {isPlayingAudio ? <Pause size={16} /> : <Play size={16} style={{ marginLeft: 2 }} />}
              </button>

              <div className="audio-meta-wrap">
                <div className="audio-title-row">
                  <span className="audio-title">Audio Recap: Design Sprint sync</span>
                  <span className="audio-timer">03:42</span>
                </div>
                {/* Waveform bars */}
                <div className="waveform-bars">
                  <span className={`bar ${isPlayingAudio ? 'bar-anim' : ''}`} style={{ height: '8px' }}></span>
                  <span className={`bar ${isPlayingAudio ? 'bar-anim' : ''}`} style={{ height: '16px' }}></span>
                  <span className={`bar ${isPlayingAudio ? 'bar-anim' : ''}`} style={{ height: '20px' }}></span>
                  <span className={`bar ${isPlayingAudio ? 'bar-anim' : ''}`} style={{ height: '12px' }}></span>
                  <span className={`bar ${isPlayingAudio ? 'bar-anim' : ''}`} style={{ height: '7px' }}></span>
                  <span className={`bar ${isPlayingAudio ? 'bar-anim' : ''}`} style={{ height: '18px' }}></span>
                  <span className={`bar ${isPlayingAudio ? 'bar-anim' : ''}`} style={{ height: '22px' }}></span>
                  <span className={`bar ${isPlayingAudio ? 'bar-anim' : ''}`} style={{ height: '14px' }}></span>
                  <span className={`bar ${isPlayingAudio ? 'bar-anim' : ''}`} style={{ height: '6px' }}></span>
                  <span className={`bar ${isPlayingAudio ? 'bar-anim' : ''}`} style={{ height: '16px' }}></span>
                  <span className={`bar ${isPlayingAudio ? 'bar-anim' : ''}`} style={{ height: '20px' }}></span>
                  <span className={`bar ${isPlayingAudio ? 'bar-anim' : ''}`} style={{ height: '10px' }}></span>
                </div>
              </div>
            </div>
          </article>
        </div>

        {/* RIGHT COLUMN (7 cols) */}
        <div className="bento-column">
          {/* Card 3: Upcoming Focus Meeting Card */}
          <article className="bento-card">
            <div className="meeting-top-row">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                  <span className="meeting-countdown-pill">In 15 minutes</span>
                  <span className="meeting-location-tag">Google Meet</span>
                </div>
                <h2 className="meeting-title">UX Strategy Stand up</h2>
                <p className="meeting-desc">Daily synchronization on Token Transfer & Design Library</p>
              </div>
              <div className="meeting-time-box">
                11:00 AM
              </div>
            </div>

            {/* Meeting Attendees & Actions */}
            <div className="meeting-footer-row">
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div className="avatar-stack">
                  <img 
                    src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&auto=format&fit=crop&q=80" 
                    alt="Sam" 
                    className="stack-img" 
                  />
                  <img 
                    src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&auto=format&fit=crop&q=80" 
                    alt="Alex" 
                    className="stack-img" 
                  />
                  <img 
                    src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&auto=format&fit=crop&q=80" 
                    alt="Elena" 
                    className="stack-img" 
                  />
                  <span className="stack-more-badge">+4</span>
                </div>
                <span className="meeting-attendee-count">7 team members attending</span>
              </div>

              <div className="meeting-btn-group">
                <button 
                  className="btn-ghost-outline"
                  onClick={() => onTriggerPrompt('Prepare executive AI brief for UX Strategy Stand up meeting')}
                >
                  View AI Prep
                </button>
                <button 
                  className="btn-join-primary"
                  onClick={() => window.open('https://meet.google.com', '_blank')}
                >
                  <Video size={14} /> Join Now
                </button>
              </div>
            </div>
          </article>

          {/* Card 4: Suggested Tasks Checklist */}
          <article className="bento-card">
            <div className="card-header-row">
              <div className="card-title-group">
                <div className="card-icon-pill pill-indigo-icon">
                  <CheckSquare size={16} />
                </div>
                <h2 className="card-heading">Suggested Tasks</h2>
                <span className="nav-pill-badge pill-slate">
                  {tasks.filter(t => !t.completed).length} pending
                </span>
              </div>

              {/* Tabs */}
              <div className="tasks-filter-tabs">
                <button 
                  className={`filter-tab-btn ${activeTaskFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setActiveTaskFilter('all')}
                >
                  All
                </button>
                <button 
                  className={`filter-tab-btn ${activeTaskFilter === 'in_progress' ? 'active' : ''}`}
                  onClick={() => setActiveTaskFilter('in_progress')}
                >
                  In Progress
                </button>
                <button 
                  className={`filter-tab-btn ${activeTaskFilter === 'review' ? 'active' : ''}`}
                  onClick={() => setActiveTaskFilter('review')}
                >
                  Review
                </button>
              </div>
            </div>

            {/* Task Items Checklist */}
            <div className="task-items-list">
              {filteredTasks.map(task => (
                <div key={task.id} className={`task-item-card ${task.completed ? 'is-completed' : ''}`}>
                  <div className="task-left-wrap">
                    <input 
                      type="checkbox" 
                      className="task-checkbox"
                      checked={task.completed}
                      onChange={() => toggleTaskCompletion(task.id)}
                    />
                    <div className="task-title-group">
                      <p className="task-title">{task.title}</p>
                      <p className="task-subtitle">{task.subtitle}</p>
                    </div>
                  </div>

                  <div className="task-meta-right">
                    <span className={`task-category-pill ${task.categoryClass}`}>
                      {task.category}
                    </span>
                    <span className={`task-due-pill ${task.dueClass}`}>
                      {task.due}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Quick Add Task Bar */}
            <div className="task-quick-add-footer">
              <button 
                className="add-task-trigger-btn"
                onClick={() => setShowAddTaskModal(true)}
              >
                <span className="add-plus-circle">+</span>
                Add Quick Task with AI Autocomplete
              </button>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                Open Chat Active
              </span>
            </div>
          </article>
        </div>
      </div>

      {/* Add Task Modal */}
      {showAddTaskModal && (
        <div className="modal-overlay" onClick={() => setShowAddTaskModal(false)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-title-row">
              <h3 className="modal-title">Create Task with AI</h3>
              <button className="modal-close-btn" onClick={() => setShowAddTaskModal(false)}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  Task Title
                </label>
                <input 
                  type="text" 
                  className="chat-text-input" 
                  style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '10px 14px' }}
                  placeholder="E.g., Review Q3 Agent Benchmarks"
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  autoFocus
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  Category
                </label>
                <select 
                  style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '10px 14px', background: '#fff', fontSize: '13px' }}
                  value={newTaskCategory}
                  onChange={e => setNewTaskCategory(e.target.value)}
                >
                  <option value="UX Design">UX Design</option>
                  <option value="Strategy">Strategy</option>
                  <option value="Partnership">Partnership</option>
                  <option value="Project Mgmt">Project Mgmt</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button className="btn-ghost-outline" onClick={() => setShowAddTaskModal(false)}>
                  Cancel
                </button>
                <button className="btn-join-primary" onClick={handleAddNewTask}>
                  Create Task
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
