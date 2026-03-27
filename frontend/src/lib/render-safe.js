import React from 'react';

function summarizeObject(value) {
  if (!value || typeof value !== 'object') return '';

  const preferredKeys = [
    'label',
    'status',
    'mode',
    'message',
    'value',
    'count',
    'counts',
    'liveReady',
    'supervised',
    'useTestnet',
    'configVersion',
    'updatedAt',
    'drift',
    'experts',
    'quality',
  ];

  const parts = preferredKeys
    .filter((key) => Object.prototype.hasOwnProperty.call(value, key))
    .map((key) => {
      const raw = value[key];
      if (raw === null || raw === undefined || raw === '') return null;
      if (Array.isArray(raw)) return `${key}: ${raw.length} item(ns)`;
      if (typeof raw === 'object') return `${key}: ${Object.keys(raw).length} campo(s)`;
      if (typeof raw === 'boolean') return `${key}: ${raw ? 'sim' : 'não'}`;
      return `${key}: ${String(raw)}`;
    })
    .filter(Boolean);

  if (parts.length) return parts.join(' • ');
  const keys = Object.keys(value);
  return keys.length ? `Objeto com ${keys.length} campo(s)` : 'Objeto vazio';
}

export function safeInlineValue(value, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback;
  if (React.isValidElement(value)) return value;
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (value instanceof Date) return value.toLocaleString('pt-BR');

  if (Array.isArray(value)) {
    const joined = value
      .map((item) => safeInlineValue(item, ''))
      .filter((item) => item !== null && item !== undefined && item !== '');

    if (!joined.length) return fallback;

    const hasReactElement = joined.some((item) => React.isValidElement(item));
    if (hasReactElement) {
      return React.createElement(
        React.Fragment,
        null,
        ...joined.map((item, index) =>
          React.createElement(React.Fragment, { key: `safe-inline-${index}` }, item, index < joined.length - 1 ? ', ' : null),
        ),
      );
    }

    return joined.join(', ');
  }

  if (typeof value === 'object') return summarizeObject(value);
  return String(value);
}

export function safeMultilineValue(value, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback;
  if (React.isValidElement(value)) return value;

  if (Array.isArray(value)) {
    if (!value.length) return fallback;

    return React.createElement(
      React.Fragment,
      null,
      ...value.map((item, index) =>
        React.createElement('div', { key: `safe-line-${index}` }, safeInlineValue(item, '')),
      ),
    );
  }

  if (typeof value === 'object') {
    return React.createElement('span', null, summarizeObject(value));
  }

  return safeInlineValue(value, fallback);
}
