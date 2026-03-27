import { safeInlineValue, safeMultilineValue } from '../lib/render-safe';

export default function StatCard({ label, value, hint, tone = 'default', action }) {
  const normalizedTone = ['default', 'positive', 'warning', 'danger'].includes(tone)
    ? tone
    : 'default';

  return (
    <article className={`stat-card stat-card--${normalizedTone}`}>
      <div className="stat-card__header">
        <span className="stat-card__label">{safeInlineValue(label)}</span>
        {action ? <div className="stat-card__action">{action}</div> : null}
      </div>

      <div className="stat-card__value">{safeMultilineValue(value)}</div>

      {hint ? <div className="stat-card__hint">{safeMultilineValue(hint)}</div> : null}
    </article>
  );
}
