export default function StatusBadge({ connected, label }) {
  return (
    <span className={`status-badge ${connected ? 'status-badge--ok' : 'status-badge--warn'}`}>
      <span className="status-badge__dot" aria-hidden="true" />
      {label}
    </span>
  );
}
