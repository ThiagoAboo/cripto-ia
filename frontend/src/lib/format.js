export function formatNumber(value, digits = 2) {
  const numeric = Number(value || 0);
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(numeric);
}

export function formatPercent(value, digits = 2) {
  return `${formatNumber(value, digits)}%`;
}

export function formatMoney(value, currency = 'USDT') {
  const numeric = Number(value || 0);

  if (currency === 'BRL') {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numeric);
  }

  return `${currency} ${formatNumber(numeric, 2)}`;
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(date);
}

export function formatList(values = []) {
  return Array.isArray(values) && values.length ? values.join(', ') : '—';
}
