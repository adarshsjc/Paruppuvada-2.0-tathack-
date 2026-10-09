import { useState } from 'react';
import { Send, Loader2, AlertCircle } from 'lucide-react';
import { submitTask } from '../api';
import type { TaskState } from '../types';

export default function ChatWorkspace({ projectId }: { projectId: string }) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState<{role: string, content: string, state?: TaskState}[]>([]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const task = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: task }]);
    setLoading(true);
    setError('');
    
    try {
      const res = await submitTask(task, projectId);
      setMessages(prev => [...prev, { 
        role: 'agent', 
        content: res.result || 'Task completed without final answer text.',
        state: res.details
      }]);
    } catch (err: any) {
      setError(err.message || 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const latestState = messages.filter(m => m.state).pop()?.state;

  return (
    <div className="workspace-grid">
      <div className="glass-panel chat-panel">
        <h2>Agent Chat</h2>
        <div className="chat-history">
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '40px' }}>
              No messages yet. Send a task to begin!
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`chat-msg ${msg.role === 'user' ? 'msg-user' : 'msg-agent'}`}>
              <div style={{ fontWeight: 600, marginBottom: '8px', color: msg.role === 'user' ? 'var(--text-muted)' : 'var(--accent)' }}>
                {msg.role === 'user' ? 'You' : 'Agent'}
              </div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
            </div>
          ))}
          {loading && (
            <div className="chat-msg msg-agent flex-row">
               <Loader2 className="spinner" size={18} /> Processing task...
            </div>
          )}
          {error && (
            <div className="chat-msg msg-agent" style={{ border: '1px solid var(--error)', background: 'rgba(239, 68, 68, 0.1)'}}>
               <div className="flex-row" style={{ color: 'var(--error)' }}><AlertCircle size={18} /> Error</div>
               <div style={{ marginTop: '8px' }}>{error}</div>
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
        {!latestState ? (
          <p>No active execution trace.</p>
        ) : (
          <div className="flex-col">
            <div className="flex-row">
              <span className={`badge ${latestState.status === 'completed' ? 'badge-green' : latestState.status === 'failed' ? 'badge-red' : 'badge-orange'}`}>
                {latestState.status}
              </span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>ID: {latestState.task_id}</span>
            </div>
            
            {latestState.plan && (
              <div>
                <h3>Plan</h3>
                {latestState.plan.steps.map(s => (
                  <div key={s.id} className="task-step">
                    <strong>{s.id}. {s.goal}</strong>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '4px' }}>Expect: {s.expected_output}</div>
                  </div>
                ))}
              </div>
            )}
            
            {latestState.execution_steps.length > 0 && (
              <div>
                <h3>Agent Steps</h3>
                {latestState.execution_steps.map((step, idx) => (
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
