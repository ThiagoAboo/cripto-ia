import { safeInlineValue } from '../lib/render-safe';

export default function Pill({ children, tone = 'info' }) {
  const normalizedTone = ['info', 'success', 'warning', 'danger', 'neutral'].includes(tone)
    ? tone
    : 'info';

  return <span className={`pill pill--${normalizedTone}`}>{safeInlineValue(children)}</span>;
}
