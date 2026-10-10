import { useState, useEffect, useRef } from 'react';
import { 
  Send, 
  Loader2, 
  AlertCircle, 
  Sparkles, 
  Copy, 
  Check, 
  Terminal, 
  Bot, 
  FileCode, 
  Cpu, 
  ShieldCheck, 
  BrainCircuit, 
  CheckCircle2,
  Trash2,
  Zap
} from 'lucide-react';
import { submitTask } from '../api';
import type { TaskState } from '../types';
import SkillSelectorModal from '../components/SkillSelectorModal';

interface Message {
  role: 'user' | 'agent';
  content: string;
  state?: TaskState;
  timestamp?: string;
  latencySeconds?: number;
  mode?: 'simple' | 'complex';
}

export default function ChatWorkspace({ 
  projectId,
  initialPrompt,
  selectedSkills,
  onClearInitialPrompt
}: { 
  projectId: string;
  initialPrompt?: string;
  selectedSkills?: string[];
  onClearInitialPrompt?: () => void;
}) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [chatMode, setChatMode] = useState<'simple' | 'complex'>('simple');
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'agent',
      content: "Hello! I'm Open Chat, powered by local Qwen 2.5:3B on Ollama. Choose 'Simple' mode for instant terminal-style answers, or 'Complex' mode to use persistent memory, parallel agents, and verification.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      mode: 'simple'
    }
  ]);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [elapsedTimer, setElapsedTimer] = useState(0);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [showRawJsonModal, setShowRawJsonModal] = useState(false);
  const [selectedTraceState, setSelectedTraceState] = useState<TaskState | null>(null);
  
  const [currentSkills, setCurrentSkills] = useState<string[]>(selectedSkills || []);
  const [isSkillModalOpen, setIsSkillModalOpen] = useState(false);
  
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat on new message
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Stepper timer while loading
  useEffect(() => {
    let interval: any = null;
    if (loading) {
      const startTime = Date.now();
      interval = setInterval(() => {
        const secs = Math.floor((Date.now() - startTime) / 1000);
        setElapsedTimer(secs);
        if (chatMode === 'complex') {
          // Animate stepper nodes for complex multi-agent loop
          if (secs < 3) setActiveStepIndex(0);
          else if (secs < 8) setActiveStepIndex(1);
          else if (secs < 13) setActiveStepIndex(2);
          else setActiveStepIndex(3);
        } else {
          setActiveStepIndex(0);
        }
      }, 500);
    } else {
      setElapsedTimer(0);
      setActiveStepIndex(3);
    }
    return () => clearInterval(interval);
  }, [loading, chatMode]);

  // Handle initial prompt from Dashboard view
  useEffect(() => {
    if (initialPrompt && initialPrompt.trim()) {
      handleSendPrompt(initialPrompt.trim());
      if (onClearInitialPrompt) onClearInitialPrompt();
    }
  }, [initialPrompt]);

  const handleSendPrompt = async (taskText: string) => {
    if (!taskText.trim() || loading) return;
    
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages(prev => [...prev, { role: 'user', content: taskText, timestamp: timeStr, mode: chatMode }]);
    setInput('');
    setLoading(true);
    setError('');
    const startTime = Date.now();

    try {
      const res = await submitTask(
        taskText, 
        projectId, 
        currentSkills.length > 0 ? currentSkills : undefined,
        chatMode
      );
      const latency = Math.round((Date.now() - startTime) / 100) / 10;
      const agentMsg: Message = { 
        role: 'agent', 
        content: res.result || 'Task completed without final answer text.',
        state: res.details,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        latencySeconds: latency,
        mode: chatMode
      };
      setMessages(prev => [...prev, agentMsg]);
      setSelectedTraceState(res.details);
    } catch (err: any) {
      setError(err.message || 'Unknown error occurred while running task.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const latestState = selectedTraceState || messages.filter(m => m.state).pop()?.state;
  const agentCandidates = latestState?.execution_steps.flatMap(step =>
    Array.isArray(step.parallel_agents) ? step.parallel_agents : []
  ) ?? [];
  const webResults = latestState?.execution_steps.flatMap(step =>
    Array.isArray(step.web_research) ? step.web_research : []
  ) ?? [];
  const webSearchErrors = latestState?.execution_steps
    .map(step => step.web_search_error)
    .filter((message): message is string => typeof message === 'string') ?? [];

  return (
    <div className="open-chat-layout">
      {/* LEFT COLUMN: Open Chat Stream */}
      <div className="chat-stream-column">
        {/* Chat Stream Header */}
        <div className="chat-stream-header">
          <div className="chat-header-title-box">
            <div className="brand-icon-box" style={{ width: 28, height: 28, borderRadius: 8 }}>
              <Bot size={16} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 className="chat-header-title">Open Chat Workspace</h2>
                <span className="service-badge service-online" style={{ fontSize: '10px', padding: '2px 8px' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
                  Qwen2.5:3B (Ollama Local)
                </span>
              </div>
              <span style={{ fontSize: '11px', color: '#64748b' }}>
                Context: {projectId ? `Project ${projectId.slice(0, 8)}...` : 'Global Mode'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Simple vs Complex Mode Toggle */}
            <div style={{ 
              display: 'flex', 
              background: '#f1f5f9', 
              padding: '2px', 
              borderRadius: '8px', 
              border: '1px solid #e2e8f0' 
            }}>
              <button 
                type="button"
                onClick={() => setChatMode('simple')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: chatMode === 'simple' ? 700 : 500,
                  borderRadius: '6px',
                  border: 'none',
                  background: chatMode === 'simple' ? '#ffffff' : 'transparent',
                  color: chatMode === 'simple' ? '#b45309' : '#64748b',
                  boxShadow: chatMode === 'simple' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                  cursor: 'pointer'
                }}
                title="Simple Mode: Fast direct response with local Qwen 2.5:3B (~1-2s)"
              >
                <Zap size={13} color="#f59e0b" />
                <span>Simple</span>
              </button>
              <button 
                type="button"
                onClick={() => setChatMode('complex')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: chatMode === 'complex' ? 700 : 500,
                  borderRadius: '6px',
                  border: 'none',
                  background: chatMode === 'complex' ? '#ffffff' : 'transparent',
                  color: chatMode === 'complex' ? '#4338ca' : '#64748b',
                  boxShadow: chatMode === 'complex' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                  cursor: 'pointer'
                }}
                title="Complex Mode: Uses persistent memory, 3 parallel agents, and verification"
              >
                <BrainCircuit size={13} color="#6366f1" />
                <span>Complex</span>
              </button>
            </div>

            <button 
              className={`btn-ghost-outline ${currentSkills.length > 0 ? 'pill-emerald-cat' : ''}`}
              style={{ padding: '6px 10px', fontSize: '11px', borderColor: currentSkills.length > 0 ? '#10b981' : undefined }}
              onClick={() => setIsSkillModalOpen(true)}
              title="Select skills for chat"
            >
              <BrainCircuit size={13} /> {currentSkills.length > 0 ? `${currentSkills.length} Skills` : 'Skills'}
            </button>
            <button 
              className="btn-ghost-outline" 
              style={{ padding: '6px 10px', fontSize: '11px' }}
              onClick={() => setMessages([{
                role: 'agent',
                content: "Open Chat conversation reset. How can I assist you now?",
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                mode: chatMode
              }])}
              title="Clear chat session"
            >
              <Trash2 size={13} /> Clear
            </button>
          </div>
        </div>

        {/* Real-Time Agent Progress Stepper */}
        {loading && (
          <div style={{ padding: '12px 20px', backgroundColor: chatMode === 'simple' ? '#fffbeb' : '#f8fafc', borderBottom: `1px solid ${chatMode === 'simple' ? '#fef3c7' : '#f1f5f9'}` }}>
            {chatMode === 'complex' ? (
              <div className="agent-stepper-box">
                <div className="stepper-header-row">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Loader2 size={14} className="spinner" />
                    Complex Mode: Searching Memory & Executing Multi-Agent Loop
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#2563eb' }}>
                    Elapsed: {elapsedTimer}s
                  </span>
                </div>
                <div className="stepper-nodes-row">
                  <div className={`stepper-node ${activeStepIndex === 0 ? 'active-step' : activeStepIndex > 0 ? 'completed-step' : ''}`}>
                    <BrainCircuit size={14} />
                    <span>1. Memory & Plan</span>
                  </div>
                  <div className={`stepper-node ${activeStepIndex === 1 ? 'active-step' : activeStepIndex > 1 ? 'completed-step' : ''}`}>
                    <Cpu size={14} />
                    <span>2. Parallel Agents</span>
                  </div>
                  <div className={`stepper-node ${activeStepIndex === 2 ? 'active-step' : activeStepIndex > 2 ? 'completed-step' : ''}`}>
                    <ShieldCheck size={14} />
                    <span>3. Judge Review</span>
                  </div>
                  <div className={`stepper-node ${activeStepIndex === 3 ? 'active-step' : activeStepIndex > 3 ? 'completed-step' : ''}`}>
                    <CheckCircle2 size={14} />
                    <span>4. Memory Write</span>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '12px', color: '#b45309', fontWeight: 600 }}>
                  <Loader2 size={14} className="spinner" color="#f59e0b" />
                  Simple Mode: Direct Qwen 2.5:3B terminal response (no memory wait)...
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#b45309', fontWeight: 600 }}>
                  {elapsedTimer}s
                </span>
              </div>
            )}
          </div>
        )}

        {/* Chat Messages Scroll Area */}
        <div className="chat-scroll-area" ref={chatScrollRef}>
          {messages.map((msg, i) => (
            <div 
              key={i} 
              className={`chat-bubble ${msg.role === 'user' ? 'bubble-user' : 'bubble-agent'}`}
            >
              <div className="bubble-header">
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {msg.role === 'user' ? (
                    'You'
                  ) : (
                    <>
                      <Sparkles size={13} />
                      Open Chat
                      {msg.mode === 'simple' ? (
                        <span style={{ fontSize: '10px', color: '#b45309', background: '#fffbeb', border: '1px solid #fef3c7', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
                          ⚡ Simple
                        </span>
                      ) : msg.mode === 'complex' ? (
                        <span style={{ fontSize: '10px', color: '#4338ca', background: '#eef2ff', border: '1px solid #e0e7ff', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
                          🧠 Complex
                        </span>
                      ) : null}
                      {msg.latencySeconds && (
                        <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 500, marginLeft: 2 }}>
                          ({msg.latencySeconds}s)
                        </span>
                      )}
                    </>
                  )}
                </span>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '10px', color: msg.role === 'user' ? '#94a3b8' : '#94a3b8' }}>
                    {msg.timestamp}
                  </span>
                  {msg.role === 'agent' && (
                    <button 
                      className="bubble-copy-btn" 
                      onClick={() => copyToClipboard(msg.content, i)}
                      title="Copy response"
                    >
                      {copiedIndex === i ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                    </button>
                  )}
                </div>
              </div>

              <div className="bubble-content">{msg.content}</div>

              {/* Inspect Trace Button for this specific message */}
              {msg.state && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    ID: {msg.state.task_id?.slice(0, 8)}... ({msg.state.status})
                  </span>
                  <button 
                    className="card-header-action"
                    onClick={() => setSelectedTraceState(msg.state!)}
                  >
                    Inspect Trace DAG
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* Loading Indicator */}
          {loading && (
            <div className="chat-bubble bubble-agent" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Loader2 size={16} className="spinner" color={chatMode === 'simple' ? '#f59e0b' : '#2563eb'} />
              <span style={{ fontSize: '13px', color: '#475569' }}>
                {chatMode === 'simple'
                  ? '⚡ Qwen 2.5:3B is answering directly (Simple mode)...'
                  : '🧠 Open Chat is searching memory and synthesizing multi-agent solutions...'}
              </span>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="chat-bubble bubble-agent" style={{ borderColor: '#fca5a5', backgroundColor: '#fef2f2' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#dc2626', fontWeight: 600, fontSize: '13px' }}>
                <AlertCircle size={16} /> Error Occurred
              </div>
              <p style={{ marginTop: 6, fontSize: '12px', color: '#991b1b' }}>{error}</p>
            </div>
          )}
        </div>

        {/* Quick Action Suggestion Pills */}
        <div style={{ padding: '8px 20px', borderTop: '1px solid #f8fafc', display: 'flex', gap: 6, overflowX: 'auto' }}>
          {chatMode === 'simple' ? (
            <>
              <button 
                className="chip-btn" 
                style={{ fontSize: '11px', padding: '4px 10px', whiteSpace: 'nowrap' }}
                onClick={() => handleSendPrompt('What is 25 * 4?')}
              >
                ⚡ What is 25 * 4?
              </button>
              <button 
                className="chip-btn" 
                style={{ fontSize: '11px', padding: '4px 10px', whiteSpace: 'nowrap' }}
                onClick={() => handleSendPrompt('Explain autonomous AI agents in 2 short sentences.')}
              >
                ⚡ Explain Autonomous Agents
              </button>
              <button 
                className="chip-btn" 
                style={{ fontSize: '11px', padding: '4px 10px', whiteSpace: 'nowrap' }}
                onClick={() => handleSendPrompt('Write a quick Python hello world script.')}
              >
                ⚡ Python Hello World
              </button>
            </>
          ) : (
            <>
              <button 
                className="chip-btn" 
                style={{ fontSize: '11px', padding: '4px 10px', whiteSpace: 'nowrap' }}
                onClick={() => handleSendPrompt('Calculate 347 * 829')}
              >
                🧠 Calculate 347 * 829
              </button>
              <button 
                className="chip-btn" 
                style={{ fontSize: '11px', padding: '4px 10px', whiteSpace: 'nowrap' }}
                onClick={() => handleSendPrompt('Save project note: Verified multi-agent DAG pipeline with review scoring')}
              >
                📝 Save Project Note (Memory)
              </button>
              <button 
                className="chip-btn" 
                style={{ fontSize: '11px', padding: '4px 10px', whiteSpace: 'nowrap' }}
                onClick={() => handleSendPrompt('Search memory for project')}
              >
                🔍 Search Memory
              </button>
            </>
          )}
        </div>

        {/* Mode Selector Strip */}
        <div style={{ 
          padding: '6px 20px', 
          backgroundColor: '#f8fafc', 
          borderTop: '1px solid #f1f5f9', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          fontSize: '11px' 
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: '#64748b', fontWeight: 600 }}>Mode:</span>
            <button
              type="button"
              onClick={() => setChatMode('simple')}
              style={{
                padding: '3px 8px',
                borderRadius: 6,
                fontSize: '11px',
                fontWeight: 600,
                border: chatMode === 'simple' ? '1px solid #f59e0b' : '1px solid #cbd5e1',
                background: chatMode === 'simple' ? '#fffbeb' : '#ffffff',
                color: chatMode === 'simple' ? '#b45309' : '#64748b',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
            >
              <Zap size={12} color="#f59e0b" /> Simple (Fast Qwen 2.5)
            </button>
            <button
              type="button"
              onClick={() => setChatMode('complex')}
              style={{
                padding: '3px 8px',
                borderRadius: 6,
                fontSize: '11px',
                fontWeight: 600,
                border: chatMode === 'complex' ? '1px solid #6366f1' : '1px solid #cbd5e1',
                background: chatMode === 'complex' ? '#eef2ff' : '#ffffff',
                color: chatMode === 'complex' ? '#4338ca' : '#64748b',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
            >
              <BrainCircuit size={12} color="#6366f1" /> Complex (Agent + Memory)
            </button>
          </div>
          <div style={{ color: '#64748b', fontSize: '11px' }}>
            {chatMode === 'simple' 
              ? '⚡ Terminal speed (~1-2s). Direct prompt response.' 
              : '🧠 Deep reasoning. Uses memory, 3 agents & review.'
            }
          </div>
        </div>

        {/* Bottom Input Area */}
        <div className="chat-bottom-input-bar">
          <form 
            onSubmit={e => {
              e.preventDefault();
              handleSendPrompt(input);
            }} 
            className="chat-input-pill-wrap"
          >
            <Sparkles size={18} color={chatMode === 'simple' ? '#f59e0b' : '#2563eb'} style={{ flexShrink: 0 }} />
            <input 
              type="text" 
              className="chat-text-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={
                chatMode === 'simple'
                  ? "Ask Qwen 2.5:3B directly (Fast terminal reply without memory wait)..."
                  : "Ask Open Chat complex task (Searches memory, 3-agent ensemble, DAG verification)..."
              }
              disabled={loading}
            />
            <button 
              type="submit" 
              className="chat-send-btn"
              disabled={loading || !input.trim()}
              title="Send to Open Chat"
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      </div>

      {/* RIGHT COLUMN: Execution Trace & Agent DAG */}
      <div className="trace-column">
        {/* Trace Header */}
        <div className="trace-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Terminal size={18} color="#2563eb" />
            <h2 className="trace-title">Execution Trace & DAG</h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {latestState && (
              <span className={`nav-pill-badge ${latestState.status === 'completed' ? 'pill-emerald-cat' : latestState.status === 'failed' ? 'due-today' : 'pill-amber'}`}>
                {latestState.status.toUpperCase()}
              </span>
            )}
            {latestState && (
              <button 
                className="btn-ghost-outline" 
                style={{ padding: '6px 10px', fontSize: '11px' }}
                onClick={() => setShowRawJsonModal(true)}
              >
                <FileCode size={13} /> Raw JSON
              </button>
            )}
          </div>
        </div>

        {/* Trace Scroll Area */}
        <div className="trace-scroll-area">
          {!latestState ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
              <Cpu size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <p style={{ fontSize: '14px', fontWeight: 600, color: '#64748b' }}>No active execution trace</p>
              <p style={{ fontSize: '12px', marginTop: 4 }}>
                Send a task from the Open Chat stream or select a previous run to inspect the DAG.
              </p>
            </div>
          ) : (
            <>
              {/* Task Goal Overview Card */}
              <div className="trace-step-card" style={{ borderLeft: '4px solid #2563eb' }}>
                <div className="trace-card-top">
                  <span className="step-agent-badge badge-planner">Autonomous Planner</span>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>ID: {latestState.task_id}</span>
                </div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                  Request: {latestState.request}
                </div>
                {latestState.plan && (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {latestState.plan.steps.map(s => (
                      <div key={s.id} style={{ fontSize: '12px', color: '#475569', background: '#f8fafc', padding: '6px 10px', borderRadius: 8 }}>
                        <strong>Step {s.id}:</strong> {s.goal}
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: 2 }}>Expected: {s.expected_output}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Execution Steps */}
              {latestState.execution_steps && latestState.execution_steps.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Agent Tool Iterations ({latestState.execution_steps.length})
                  </h3>

                  {latestState.execution_steps.map((step, idx) => (
                    <div key={idx} className="trace-step-card" style={{ borderLeft: `4px solid ${step.mode === 'simple' ? '#f59e0b' : '#3b82f6'}` }}>
                      <div className="trace-card-top">
                        {step.mode === 'simple' ? (
                          <span className="step-agent-badge" style={{ backgroundColor: '#fffbeb', color: '#b45309' }}>
                            ⚡ Simple Mode · Direct Qwen 2.5:3B
                          </span>
                        ) : (
                          <span className="step-agent-badge badge-executor">
                            Iteration #{idx + 1} • Executor
                          </span>
                        )}
                        {step.action?.tool && step.action?.tool !== 'none' && (
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#2563eb', background: '#eff6ff', padding: '2px 8px', borderRadius: 6 }}>
                            Tool: {step.action.tool}
                          </span>
                        )}
                      </div>

                      {step.action?.thought && (
                        <div className="trace-thought">
                          Thought: {step.action.thought}
                        </div>
                      )}

                      {step.action?.tool !== 'none' && step.action?.tool_input && (
                        <div className="trace-tool-box">
                          <div className="trace-tool-name">Tool Input Payload:</div>
                          <code>{JSON.stringify(step.action.tool_input, null, 2)}</code>
                        </div>
                      )}

                      {step.tool_result && (
                        <div className="trace-result-box">
                          <strong style={{ color: '#059669', display: 'block', marginBottom: 2 }}>Execution Result:</strong>
                          {step.tool_result}
                        </div>
                      )}

                      {/* Step Review Scorecard */}
                      {step.review && (
                        <div style={{ 
                          marginTop: 10, 
                          padding: '8px 10px', 
                          borderRadius: 8, 
                          backgroundColor: step.review.approved ? '#ecfdf5' : '#fef2f2',
                          border: `1px solid ${step.review.approved ? '#a7f3d0' : '#fecaca'}`,
                          fontSize: '12px'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: step.review.approved ? '#047857' : '#b91c1c' }}>
                            <ShieldCheck size={14} />
                            Reviewer: {step.review.approved ? 'Approved ✓' : 'Revision Required ✗'}
                          </div>
                          <p style={{ marginTop: 4, color: '#334155' }}>{step.review.feedback}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Parallel Agent Solutions if present */}
              {agentCandidates.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Parallel Agent Solutions ({agentCandidates.length})
                  </h3>
                  {agentCandidates.map((candidate, idx) => (
                    <div key={idx} className="trace-step-card" style={{ borderLeft: `4px solid ${candidate.selected ? '#10b981' : '#6366f1'}` }}>
                      <div className="trace-card-top">
                        <span className="step-agent-badge" style={{ backgroundColor: candidate.selected ? '#ecfdf5' : '#eef2ff', color: candidate.selected ? '#047857' : '#4338ca' }}>
                          Agent {candidate.agent} · {candidate.role || 'Solution Agent'}
                        </span>
                        {candidate.selected && <span className="nav-pill-badge pill-emerald-cat">Selected</span>}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginBottom: 6 }}>Model: {candidate.model}</div>
                      <div style={{ fontSize: '12px', whiteSpace: 'pre-wrap', color: '#1e293b' }}>
                        {candidate.solution || `Agent failed: ${candidate.error}`}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Web Research Sources if present */}
              {webResults.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Web Research Sources ({webResults.length})
                  </h3>
                  {webResults.map((result, idx) => (
                    <div key={idx} className="trace-step-card" style={{ borderLeft: '4px solid #06b6d4' }}>
                      <a href={result.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, fontSize: '13px', color: '#0284c7', textDecoration: 'none' }}>
                        {result.title} ↗
                      </a>
                      {result.snippet && (
                        <div style={{ fontSize: '12px', color: '#475569', marginTop: 4 }}>
                          {result.snippet}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {webSearchErrors.map((message, idx) => (
                <div key={idx} className="trace-step-card" style={{ borderLeft: '4px solid #f59e0b', color: '#b45309', fontSize: '12px' }}>
                  {message}
                </div>
              ))}

              {/* Reviewer Final Verification */}
              {latestState.review && (
                <div className="trace-step-card" style={{ borderLeft: '4px solid #10b981' }}>
                  <div className="trace-card-top">
                    <span className="step-agent-badge badge-reviewer">Reviewer Verification</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: latestState.review.approved ? '#059669' : '#dc2626' }}>
                      {latestState.review.approved ? 'Verdict: Passed' : 'Verdict: Needs Review'}
                    </span>
                  </div>
                  <p style={{ fontSize: '13px', color: '#1e293b' }}>
                    {latestState.review.feedback}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Raw JSON Modal */}
      {showRawJsonModal && latestState && (
        <div className="modal-overlay" onClick={() => setShowRawJsonModal(false)}>
          <div className="modal-dialog" style={{ maxWidth: '720px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-title-row">
              <h3 className="modal-title">Raw TaskState JSON Payload</h3>
              <button className="modal-close-btn" onClick={() => setShowRawJsonModal(false)}>✕</button>
            </div>
            <pre style={{ 
              background: '#0f172a', 
              color: '#38bdf8', 
              padding: '16px', 
              borderRadius: '12px', 
              fontSize: '12px', 
              fontFamily: 'var(--font-mono)', 
              maxHeight: '450px', 
              overflowY: 'auto',
              whiteSpace: 'pre-wrap'
            }}>
              {JSON.stringify(latestState, null, 2)}
            </pre>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
              <button className="btn-join-primary" onClick={() => setShowRawJsonModal(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      <SkillSelectorModal
        open={isSkillModalOpen}
        initialSelected={currentSkills}
        onClose={() => setIsSkillModalOpen(false)}
        onConfirm={(skills) => {
          setCurrentSkills(skills);
          setIsSkillModalOpen(false);
        }}
      />
    </div>
  );
}
