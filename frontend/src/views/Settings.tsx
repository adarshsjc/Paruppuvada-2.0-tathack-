import { useEffect, useState } from 'react';
import { fetchHealth } from '../api';

export default function Settings() {
  const [health, setHealth] = useState<{ llm_mode: string; llm_model: string; agent_count: number } | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchHealth()
      .then(h => { if (mounted) setHealth(h); })
      .catch(() => { if (mounted) setHealth(null); });
    return () => { mounted = false; };
  }, []);

  return (
    <div className="glass-panel" style={{ maxWidth: '600px' }}>
      <h2>Settings</h2>
      <div className="flex-col" style={{ marginTop: '24px' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>API Base URL</label>
          <input className="input" value={import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1'} disabled />
          <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>Configure via .env file (VITE_API_BASE_URL).</p>
        </div>

        <div style={{ marginTop: '24px' }}>
          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>LLM Provider</label>
          {health ? (
            <div>
              <span className={`badge ${health.llm_mode === 'ollama' ? 'badge-green' : 'badge-blue'}`}>
                {health.llm_mode}
              </span>
              {health.llm_model && (
                <span className="badge badge-blue" style={{ marginLeft: '8px' }}>{health.llm_model}</span>
              )}
              <span className="badge" style={{ marginLeft: '8px' }}>{health.agent_count} agents</span>
              <p style={{ fontSize: '0.9rem', marginTop: '8px' }}>
                {health.llm_mode === 'ollama' && (
                  <>All inference runs locally via <strong>Ollama</strong>. No API key or internet connection is used.</>
                )}
                {health.llm_mode === 'openrouter' && (
                  <>Cloud models served via <strong>OpenRouter</strong> using free/open-weight routes.</>
                )}
                {health.llm_mode === 'mock' && (
                  <>Offline <strong>Mock LLM</strong> mode is active. Set <code>USE_MOCK_LLM=False</code> and <code>LLM_PROVIDER=ollama</code> in <code>backend/.env</code> for local inference.</>
                )}
                {health.llm_mode === 'unconfigured' && (
                  <>No LLM provider configured. Edit <code>backend/.env</code>.</>
                )}
              </p>
            </div>
          ) : (
            <p style={{ fontSize: '0.9rem', color: 'var(--warning)' }}>Backend offline — start the backend to see provider settings.</p>
          )}
        </div>

        <div>
           <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Authentication</label>
           <p style={{ fontSize: '0.9rem' }}>API keys and models are configured securely on the backend. They are never exposed to the browser.</p>
        </div>

        <div style={{ marginTop: '24px', padding: '16px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
          <h3 style={{ fontSize: '1rem', color: 'var(--accent)', marginBottom: '8px' }}>Planned Features Placeholder</h3>
          <p style={{ fontSize: '0.9rem', margin: 0 }}>
             - Graphify / Neo4j Graph Memory Integration<br/>
             - Vector Database Semantic Search<br/>
             - n8n Webhook Connections<br/>
             - Human-in-the-loop Security Approvals Dashboard
          </p>
        </div>
      </div>
    </div>
  );
}
