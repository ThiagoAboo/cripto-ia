export function normalizeUiToken(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function mapStatusTone(status) {
  const raw = normalizeUiToken(status);
  if (!raw) return 'neutral';

  if (
    [
      'ok',
      'success',
      'successful',
      'completed',
      'complete',
      'done',
      'healthy',
      'ready',
      'ativo',
      'online',
      'concluido',
      'concluído',
      'pronto',
      'disponível',
      'disponivel',
      'saudável',
      'saudavel',
      'habilitado',
    ].some((token) => raw.includes(token))
  ) {
    return 'success';
  }

  if (
    [
      'error',
      'erro',
      'failed',
      'failure',
      'critical',
      'blocked',
      'bloqueado',
      'crash',
      'offline',
      'invalid',
      'emergência',
      'emergencia',
      'rejected',
      'rejeitado',
      'negado',
      'negada',
    ].some((token) => raw.includes(token))
  ) {
    return 'danger';
  }

  if (
    [
      'warning',
      'warn',
      'pending',
      'degraded',
      'retry',
      'paused',
      'pausado',
      'attention',
      'aguardando',
      'partial',
      'parcial',
      'manutenção',
      'manutencao',
      'incompleto',
      'backoff',
      'atenção',
      'moderado',
      'moderate',
    ].some((token) => raw.includes(token))
  ) {
    return 'warning';
  }

  if (
    [
      'running',
      'processing',
      'in_progress',
      'in-progress',
      'started',
      'executing',
      'queued',
      'loading',
      'sincronizando',
      'sincronizado',
      'em andamento',
      'analisando',
      'simulado',
    ].some((token) => raw.includes(token))
  ) {
    return 'info';
  }

  return 'neutral';
}

export function mapActionTone(action) {
  const raw = normalizeUiToken(action);
  if (!raw) return 'neutral';

  if (
    [
      'buy',
      'compra',
      'comprar',
      'long',
      'entry',
      'entrar',
      'increase',
      'aumentar',
      'aprovar',
      'approved',
      'aprovado',
    ].some((token) => raw.includes(token))
  ) {
    return 'success';
  }

  if (
    [
      'sell',
      'venda',
      'vender',
      'short',
      'exit',
      'saida',
      'saída',
      'close',
      'encerrar',
      'reduzir',
      'reduce',
      'rejeitar',
      'rejeitado',
      'rollback',
      'bloqueado',
    ].some((token) => raw.includes(token))
  ) {
    return 'danger';
  }

  if (
    [
      'block',
      'bloquear',
      'reject',
      'deny',
      'denied',
      'cancel',
      'cancelado',
      'warning',
      'atenção',
      'atencao',
    ].some((token) => raw.includes(token))
  ) {
    return 'warning';
  }

  if (
    [
      'hold',
      'manter',
      'aguardar',
      'esperar',
      'wait',
      'skip',
      'noop',
      'no-op',
      'neutral',
      'info',
    ].some((token) => raw.includes(token))
  ) {
    return 'neutral';
  }

  return 'info';
}

export function signedClassName(value, neutralClass = 'value-neutral') {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return neutralClass;
  if (numeric > 0) return 'value-positive';
  if (numeric < 0) return 'value-negative';
  return neutralClass;
}
