import { useState } from 'react';
import { Send, Loader2, AlertCircle, CheckCircle2, Search, Cpu, Trash2 } from 'lucide-react';
import { streamTask } from '../api';
import type { StreamEvent, TaskState } from '../types';

interface LiveEvent {
  message: string;
  kind: string;
}

interface ChatMessage {
  role: 'user' | 'agent';
  content: string;
  state?: TaskState;
}

const STORAGE_PREFIX = 'antigravity_chat_';

function storageKey(projectId: string): string {
  return `${STORAGE_PREFIX}${projectId || 'global'}`;
}

function loadChat(projectId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as ChatMessage[];
    }
  } catch {
    // Ignore corrupt or unavailable storage.
  }
  return [];
}

function saveChat(projectId: string, messages: ChatMessage[]): void {
  localStorage.setItem(storageKey(projectId), JSON.stringify(messages));
}

export default function ChatWorkspace({ projectId }: { projectId: string }) {
  return <ProjectChatWorkspace key={projectId} projectId={projectId} />;
}

function ProjectChatWorkspace({ projectId }: { projectId: string }) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [chat, setChat] = useState(() => ({
    projectId,
    items: loadChat(projectId),
  }));
  const [storageError, setStorageError] = useState('');
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [liveState, setLiveState] = useState<TaskState | null>(null);

  const persistChat = (nextChat: { projectId: string; items: ChatMessage[] }) => {
    setChat(nextChat);
    try {
      saveChat(nextChat.projectId, nextChat.items);
      setStorageError('');
    } catch (cause) {
      console.error('Failed to persist chat history.', cause);
      setStorageError('Chat history could not be saved in this browser. Free storage space and try again.');
    }
  };

  const clearChat = () => {
    if (!chat.items.length || loading) return;
    if (!window.confirm('Clear this conversation? This cannot be undone.')) return;
    try {
      localStorage.removeItem(storageKey(chat.projectId));
      setChat({ projectId: chat.projectId, items: [] });
      setStorageError('');
    } catch (cause) {
      console.error('Failed to clear chat history.', cause);
      setStorageError('Chat history could not be cleared from this browser.');
      return;
    }
    setLiveEvents([]);
    setLiveState(null);
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    const task = input.trim();
    setInput('');
    setError('');
    const previousItems = chat.projectId === projectId ? chat.items : loadChat(projectId);
    const taskChat = {
      projectId,
      items: [...previousItems, { role: 'user' as const, content: task }],
    };
    persistChat(taskChat);
    setLoading(true);
    setLiveEvents([]);
    setLiveState(null);
    
    try {
      const res = await streamTask(task, projectId, (evt: StreamEvent) => {
        setLiveEvents(prev => [...prev, { message: evt.message || '', kind: evt.event }]);
        if (evt.state) setLiveState(evt.state);
      });
      persistChat({
        ...taskChat,
        items: [...taskChat.items, {
          role: 'agent',
          content: res.result || 'Task completed without final answer text.',
          state: res.details,
        }],
      });
    } catch (err: any) {
      setError(err.message || 'Unknown error occurred');
    } finally {
      setLoading(false);
      setLiveEvents([]);
      setLiveState(null);
    }
  };

  const latestState = chat.items.filter(message => message.state).pop()?.state;
  const shownState = liveState ?? latestState;
  const agentCandidates = shownState?.execution_steps.flatMap(step =>
    Array.isArray(step.parallel_agents) ? step.parallel_agents : []
  ) ?? [];
  const webResults = shownState?.execution_steps.flatMap(step =>
    Array.isArray(step.web_research) ? step.web_research : []
  ) ?? [];
  const webSearchErrors = shownState?.execution_steps
    .map(step => step.web_search_error)
    .filter((message): message is string => typeof message === 'string') ?? [];
  const actionSteps = shownState?.execution_steps.filter(step =>
    step.action || step.tool_result || step.review || step.error
  ) ?? [];

  const liveIcon = (kind: string) => {
    switch (kind) {
      case 'agent_solution':
      case 'selected':
        return <CheckCircle2 size={14} color="var(--success)" />;
      case 'agent_start':
        return <Loader2 className="spinner" size={14} />;
      case 'agent_error':
        return <AlertCircle size={14} color="var(--error)" />;
      case 'web_search':
        return <Search size={14} color="var(--accent)" />;
      default:
        return <Cpu size={14} color="var(--accent)" />;
    }
  };

  return (
    <div className="workspace-grid">
      <div className="glass-panel chat-panel">
        <div className="flex-row" style={{ justifyContent: 'space-between' }}>
          <h2>Agent Chat</h2>
          <button
            className="btn btn-secondary"
            onClick={clearChat}
            disabled={!chat.items.length || loading}
            title="Clear chat history"
          >
            <Trash2 size={16} /> Clear history
          </button>
        </div>
        <div className="chat-history">
          {chat.items.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '40px' }}>
              No messages yet. Send a task to begin!
            </div>
          )}
          {chat.items.map((msg, i) => (
            <div key={i} className={`chat-msg ${msg.role === 'user' ? 'msg-user' : 'msg-agent'}`}>
              <div style={{ fontWeight: 600, marginBottom: '8px', color: msg.role === 'user' ? 'var(--text-muted)' : 'var(--accent)' }}>
                {msg.role === 'user' ? 'You' : 'Agent'}
              </div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
            </div>
          ))}
          {loading && (
            <div className="chat-msg msg-agent flex-row">
               <Loader2 className="spinner" size={18} /> Agents are working on your task...
            </div>
          )}
          {error && (
            <div className="chat-msg msg-agent" style={{ border: '1px solid var(--error)', background: 'rgba(239, 68, 68, 0.1)'}}>
               <div className="flex-row" style={{ color: 'var(--error)' }}><AlertCircle size={18} /> Error</div>
               <div style={{ marginTop: '8px' }}>{error}</div>
            </div>
          )}
          {storageError && (
            <div className="chat-msg msg-agent" style={{ border: '1px solid var(--error)', background: 'rgba(239, 68, 68, 0.1)' }}>
               <div className="flex-row" style={{ color: 'var(--error)' }}><AlertCircle size={18} /> History storage error</div>
               <div style={{ marginTop: '8px' }}>{storageError}</div>
            </div>
          )}
        </div>
        <div className="chat-input-area">
          <input 
            className="input" 
            value={input} 
            onChange={e => setInput(e.target.value)} 
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="E.g., Research best practices and save a note..." 
            disabled={loading}
          />
          <button className="btn btn-primary" onClick={handleSend} disabled={loading || !input.trim()}>
            <Send size={18} />
          </button>
        </div>
      </div>
      
      <div className="glass-panel" style={{ overflowY: 'auto' }}>
        <h2>Execution Trace</h2>
        {!shownState && liveEvents.length === 0 ? (
          <p>No active execution trace.</p>
        ) : (
          <div className="flex-col">
            <div className="flex-row">
              <span className={`badge ${shownState ? (shownState.status === 'completed' ? 'badge-green' : shownState.status === 'failed' ? 'badge-red' : 'badge-orange') : 'badge-orange'}`}>
                {shownState?.status ?? 'running'}
              </span>
              {shownState && (
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>ID: {shownState.task_id}</span>
              )}
            </div>

            {liveEvents.length > 0 && (
              <div style={{ marginTop: '12px' }}>
                <h3>Live Progress</h3>
                {liveEvents.map((event, idx) => (
                  <div key={idx} className="task-step flex-row" style={{ alignItems: 'center', gap: '8px', borderLeft: '3px solid var(--accent)' }}>
                    {liveIcon(event.kind)}
                    <div style={{ fontSize: '0.9rem', color: event.kind === 'agent_error' ? 'var(--error)' : 'inherit' }}>{event.message}</div>
                  </div>
                ))}
              </div>
            )}
            
            {shownState?.plan && (
              <div>
                <h3>Plan</h3>
                {shownState.plan.steps.map(s => (
                  <div key={s.id} className="task-step">
                    <strong>{s.id}. {s.goal}</strong>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '4px' }}>Expect: {s.expected_output}</div>
                  </div>
                ))}
              </div>
            )}
            
            {agentCandidates.length > 0 && (
              <div>
                <h3>Parallel Agent Solutions</h3>
                {agentCandidates.map((candidate, idx) => (
                  <div key={idx} className="task-step" style={{ borderLeft: `3px solid ${candidate.selected ? 'var(--success)' : 'var(--accent)'}` }}>
                    <div className="flex-row" style={{ justifyContent: 'space-between' }}>
                      <strong>
                        Agent {candidate.agent} · {candidate.role || 'Solution Agent'} · {candidate.model}
                      </strong>
                      {candidate.selected && <span className="badge badge-green">Selected</span>}
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap', marginTop: '8px' }}>
                      {candidate.solution || `Agent failed: ${candidate.error}`}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {webResults.length > 0 && (
              <div>
                <h3>Web Research Sources</h3>
                {webResults.map((result, idx) => (
                  <div key={idx} className="task-step">
                    <a href={result.url} target="_blank" rel="noopener noreferrer">
                      {result.title}
                    </a>
                    {result.snippet && (
                      <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        {result.snippet}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {webSearchErrors.map((message, idx) => (
              <div key={idx} className="task-step" style={{ color: 'var(--warning)' }}>
                {message}
              </div>
            ))}

            {actionSteps.length > 0 && (
              <div>
                <h3>Execution Steps</h3>
                {actionSteps.map((step, idx) => (
                  <div key={idx} className="task-step" style={{ borderLeft: '3px solid var(--accent)' }}>
                    {step.action && (
                      <>
                        <div style={{ fontWeight: 600 }}>Thought: {step.action.thought}</div>
                        {step.action.tool !== 'none' && (
                           <div style={{ fontSize: '0.9rem', marginTop: '8px', background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '4px' }}>
                             <span style={{ color: 'var(--warning)' }}>Tool: {step.action.tool}</span>
                             <div>Input: {JSON.stringify(step.action.tool_input)}</div>
                           </div>
                        )}
                      </>
                    )}
                    {step.tool_result && (
                       <div style={{ fontSize: '0.9rem', marginTop: '8px', color: '#cbd5e1' }}>Result: {step.tool_result}</div>
                    )}
                    {step.review && (
                       <div style={{ marginTop: '12px', padding: '8px', background: step.review.approved ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', borderRadius: '4px' }}>
                         <strong>Reviewer:</strong> {step.review.feedback}
                       </div>
                    )}
                    {step.error && (
                       <div style={{ marginTop: '8px', color: 'var(--error)' }}>Error: {step.error}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
