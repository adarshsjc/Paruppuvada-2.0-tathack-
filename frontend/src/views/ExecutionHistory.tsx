export default function ExecutionHistory() {
  return (
    <div className="glass-panel">
      <h2>Execution History</h2>
      <p>This is a placeholder for the history view, which will load past tasks from the database.</p>
      <div className="memory-card" style={{ opacity: 0.5 }}>
         <strong>Task ID:</strong> Placeholder<br/>
         <strong>Request:</strong> Example request<br/>
         <strong>Status:</strong> Completed
      </div>
    </div>
  );
}
