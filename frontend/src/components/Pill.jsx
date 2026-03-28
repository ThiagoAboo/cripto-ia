import { safeInlineValue } from '../lib/render-safe';

const TONE_ALIASES = {
  buy: 'success',
  sell: 'danger',
  high: 'danger',
  ok: 'success',
};

export default function Pill({ children, tone = 'info' }) {
  const requestedTone = TONE_ALIASES[tone] || tone;
  const normalizedTone = ['info', 'success', 'warning', 'danger', 'neutral'].includes(requestedTone)
    ? requestedTone
    : 'info';

  return <span className={`pill pill--${normalizedTone}`}>{safeInlineValue(children)}</span>;
}
