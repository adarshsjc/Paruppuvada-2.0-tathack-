import { useState, useEffect } from 'react';
import { pingBackend } from '../api';
import { Activity, CheckCircle2, AlertCircle, Globe, Server } from 'lucide-react';

export default function Settings() {
  const [pingResult, setPingResult] = useState<{ status: string; latencyMs: number; provider?: string; model?: string } | null>(null);
  const [pinging, setPinging] = useState(false);
  const [pingError, setPingError] = useState('');

  // Auto-ping on mount to show active provider
  useEffect(() => {
    handleTestLatency();
  }, []);

  const handleTestLatency = async () => {
    setPinging(true);
    setPingError('');
    try {
      const res = await pingBackend();
      setPingResult(res);
    } catch (e: any) {
      setPingError(e.message || 'Health check unreachable');
    } finally {
      setPinging(false);
    }
  };

  const providerLabel = (p?: string) => {
    if (!p) return 'Unknown';
    if (p === 'ollama') return 'Ollama (Local)';
    if (p === 'openrouter') return 'OpenRouter (Cloud)';
    if (p === 'gemini') return 'Gemini (Cloud)';
    if (p === 'mock') return 'Mock Engine (Offline)';
    return p;
  };

  return (
    <div className="dashboard-content" style={{ maxWidth: '960px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 className="hero-heading" style={{ justifyContent: 'flex-start', fontSize: '1.8rem' }}>
          Platform Settings & Latency Hub
        </h1>
        <p className="hero-subheading">
          Configure multi-agent model providers, check backend connectivity, and manage API routing.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 24 }}>
        {/* Active Provider Status Card */}
        <div className="bento-card">
          <div className="card-header-row">
            <div className="card-title-group">
              <div className="card-icon-pill pill-indigo-icon">
                <Server size={16} />
              </div>
              <h2 className="card-heading">Active LLM Provider</h2>
            </div>
            {pingResult?.provider && (
              <span className={`nav-pill-badge ${pingResult.provider === 'ollama' ? 'pill-emerald-cat' : pingResult.provider === 'mock' ? 'pill-slate' : 'pill-blue'}`}>
                {providerLabel(pingResult.provider)}
              </span>
            )}
          </div>

          <p style={{ fontSize: '12.5px', color: '#64748b', marginBottom: 16 }}>
            The backend reports which LLM provider is currently handling Planner, Executor, and Reviewer agent calls.
            Change the provider by editing <code style={{ fontSize: '11px', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>backend/.env</code> and restarting the server.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {[
              { id: 'ollama', name: 'Ollama (Local)', tag: 'Privacy · Zero Cost', desc: 'Local Qwen2.5:3B via Ollama — no cloud, no API key', active: pingResult?.provider === 'ollama' },
              { id: 'openrouter', name: 'OpenRouter Free Router', tag: 'Cloud · Dynamic', desc: 'Auto-routes to the best free tier cloud LLM', active: pingResult?.provider === 'openrouter' },
              { id: 'gemini', name: 'Gemini Direct', tag: 'Cloud · Fast', desc: 'Google Gemini API with low-latency streaming', active: pingResult?.provider === 'gemini' },
              { id: 'mock', name: 'Mock Engine (Offline)', tag: 'Zero Latency', desc: 'Deterministic offline simulation for testing', active: pingResult?.provider === 'mock' },
            ].map(m => (
              <div 
                key={m.id}
                style={{
                  padding: '14px',
                  borderRadius: '16px',
                  border: `2px solid ${m.active ? '#2563eb' : '#e2e8f0'}`,
                  backgroundColor: m.active ? '#eff6ff' : '#ffffff',
                  transition: 'all 0.2s ease',
                  position: 'relative'
                }}
              >
                {m.active && (
                  <div style={{ position: 'absolute', top: 10, right: 10 }}>
                    <CheckCircle2 size={16} color="#2563eb" />
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: m.active ? '#1e40af' : '#0f172a' }}>{m.name}</span>
                  <span className="nav-pill-badge pill-slate" style={{ fontSize: '10px' }}>{m.tag}</span>
                </div>
                <p style={{ fontSize: '11px', color: '#64748b' }}>{m.desc}</p>
                {m.active && pingResult?.model && (
                  <div style={{ marginTop: 8, fontSize: '11px', fontFamily: 'var(--font-mono)', color: '#2563eb', background: '#dbeafe', padding: '4px 8px', borderRadius: 6, display: 'inline-block' }}>
                    Model: {pingResult.model}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Live Latency & Health Check */}
        <div className="bento-card">
          <div className="card-header-row">
            <div className="card-title-group">
              <div className="card-icon-pill pill-emerald-icon">
                <Activity size={16} />
              </div>
              <h2 className="card-heading">API Latency & Connectivity Test</h2>
            </div>
            <button 
              className="btn-join-primary"
              style={{ padding: '6px 14px', fontSize: '12px' }}
              onClick={handleTestLatency}
              disabled={pinging}
            >
              {pinging ? 'Measuring...' : 'Ping Backend API'}
            </button>
          </div>

          <p style={{ fontSize: '12.5px', color: '#64748b', marginBottom: 16 }}>
            Run a live roundtrip ping to the FastAPI backend and SQLite database layer.
          </p>

          {pingResult && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between', 
              padding: '14px 18px', 
              borderRadius: '16px', 
              backgroundColor: '#ecfdf5', 
              border: '1px solid #a7f3d0' 
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <CheckCircle2 size={18} color="#059669" />
                <div>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#065f46' }}>API Status: Online & Healthy</span>
                  <div style={{ fontSize: '11px', color: '#047857' }}>
                    Provider: {providerLabel(pingResult.provider)} · Model: {pingResult.model || 'N/A'}
                  </div>
                </div>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color: '#047857' }}>
                {pingResult.latencyMs} ms
              </span>
            </div>
          )}

          {pingError && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 10, 
              padding: '14px 18px', 
              borderRadius: '16px', 
              backgroundColor: '#fef2f2', 
              border: '1px solid #fecaca' 
            }}>
              <AlertCircle size={18} color="#dc2626" />
              <span style={{ fontSize: '13px', color: '#991b1b' }}>{pingError}</span>
            </div>
          )}
        </div>

        {/* System Configuration Details */}
        <div className="bento-card">
          <div className="card-header-row">
            <div className="card-title-group">
              <div className="card-icon-pill pill-amber-icon">
                <Globe size={16} />
              </div>
              <h2 className="card-heading">Environment Configuration</h2>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>
                Backend API Base URL
              </label>
              <input 
                className="hero-prompt-input" 
                style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '10px 14px', backgroundColor: '#f8fafc', color: '#475569', fontSize: '13px' }}
                value={import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1'} 
                disabled 
              />
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>
                Database Storage
              </label>
              <input 
                className="hero-prompt-input" 
                style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '10px 14px', backgroundColor: '#f8fafc', color: '#475569', fontSize: '13px' }}
                value="SQLite (memory.db) · Projects, Memories, and Full-Text Search" 
                disabled 
              />
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>
                How to Switch Provider
              </label>
              <div style={{ fontSize: '12px', color: '#475569', background: '#f8fafc', padding: '12px 14px', borderRadius: '12px', border: '1px solid #e2e8f0', fontFamily: 'var(--font-mono)', lineHeight: 1.8 }}>
                <div># Edit backend/.env:</div>
                <div>LLM_PROVIDER=ollama      # Local Ollama</div>
                <div>LLM_PROVIDER=openrouter   # Cloud OpenRouter</div>
                <div>LLM_PROVIDER=gemini       # Cloud Gemini</div>
                <div>USE_MOCK_LLM=True         # Offline mock mode</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
