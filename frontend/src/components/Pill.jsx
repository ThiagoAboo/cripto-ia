import { safeInlineValue } from '../lib/render-safe';
import { mapStatusTone } from '../lib/ui';

const TONE_ALIASES = {
  buy: 'success',
  sell: 'danger',
  high: 'danger',
  ok: 'success',
  positive: 'success',
  negative: 'danger',
  active: 'success',
  online: 'success',
  offline: 'danger',
  blocked: 'danger',
  erro: 'danger',
  error: 'danger',
  warning: 'warning',
  neutral: 'neutral',
};

export default function Pill({ children, tone = 'status' }) {
  const inferredTone = tone === 'status' ? mapStatusTone(children) : tone;
  const requestedTone = TONE_ALIASES[inferredTone] || inferredTone;
  const normalizedTone = ['info', 'success', 'warning', 'danger', 'neutral'].includes(requestedTone)
    ? requestedTone
    : 'info';

  return <span className={`pill pill--${normalizedTone}`}>{safeInlineValue(children)}</span>;
}
