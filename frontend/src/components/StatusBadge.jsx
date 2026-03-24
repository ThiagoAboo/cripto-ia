export default function StatusBadge({ connected, label }) {
  return (
    <span className={`status-badge ${connected ? 'status-badge--online' : 'status-badge--offline'}`}>
      <span className="status-badge__dot" />
      {label}
    </span>
  );
}
