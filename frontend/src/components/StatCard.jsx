export default function StatCard({ label, value, hint, tone = 'default' }) {
  return (
    <article className={`stat-card stat-card--${tone}`}>
      <div className="stat-card__label">{label}</div>
      <div className="stat-card__value">{value}</div>
      {hint ? <div className="stat-card__hint">{hint}</div> : null}
    </article>
  );
}
