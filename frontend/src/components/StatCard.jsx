import React from 'react';

function formatObjectSummary(value) {
  if (!value || typeof value !== 'object') return '';
  const preferredKeys = [
    'label',
    'status',
    'mode',
    'value',
    'message',
    'count',
    'counts',
    'liveReady',
    'supervised',
    'useTestnet',
    'configVersion',
  ];

  const parts = [];

  for (const key of preferredKeys) {
    if (!(key in value)) continue;
    const raw = value[key];
    if (raw === null || raw === undefined || raw === '') continue;

    if (typeof raw === 'object') {
      if (Array.isArray(raw)) {
        parts.push(`${key}: ${raw.length} item(ns)`);
      } else {
        parts.push(`${key}: ${Object.keys(raw).length} campo(s)`);
      }
    } else if (typeof raw === 'boolean') {
      parts.push(`${key}: ${raw ? 'sim' : 'não'}`);
    } else {
      parts.push(`${key}: ${String(raw)}`);
    }
  }

  if (!parts.length) {
    const keys = Object.keys(value);
    return keys.length ? `Objeto com ${keys.length} campo(s)` : 'Objeto vazio';
  }

  return parts.join(' • ');
}

function renderSafeValue(value, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback;
  if (React.isValidElement(value)) return value;
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';

  if (Array.isArray(value)) {
    if (!value.length) return fallback;
    return value
      .map((item) => renderSafeValue(item, '').toString())
      .filter(Boolean)
      .join(', ');
  }

  if (value instanceof Date) {
    return value.toLocaleString('pt-BR');
  }

  if (typeof value === 'object') {
    return formatObjectSummary(value);
  }

  return String(value);
}

export default function StatCard({ label, value, hint, tone = 'default' }) {
  const safeValue = renderSafeValue(value);
  const safeHint = renderSafeValue(hint, '');

  return (
    <article className={`stat-card stat-card--${tone}`}>
      <span className="stat-card__label">{renderSafeValue(label)}</span>
      <strong className="stat-card__value">{safeValue}</strong>
      {safeHint ? <div className="stat-card__hint">{safeHint}</div> : null}
    </article>
  );
}
