export default function Settings() {
  return (
    <div className="glass-panel" style={{ maxWidth: '600px' }}>
      <h2>Settings</h2>
      <div className="flex-col" style={{ marginTop: '24px' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>API Base URL</label>
          <input className="input" value={import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1'} disabled />
          <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>Configure via .env file (VITE_API_BASE_URL).</p>
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
