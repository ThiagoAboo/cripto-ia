export const DASHBOARD_PAGES = [
  { key: 'dashboard', label: 'Dashboard', hint: 'Resumo executivo da operação, saúde e sinais recentes' },
  { key: 'config', label: 'Configuração', hint: 'Parâmetros de trading, risco, taxas e comportamento da IA' },
  { key: 'operacoes', label: 'Operações', hint: 'Portfólio, ordens, backtests e validações da estratégia' },
  { key: 'execucao', label: 'Execução', hint: 'Controles operacionais, healthchecks e supervisão do runtime' },
  { key: 'governanca', label: 'Governança', hint: 'Readiness, alertas, incidentes e trilha operacional' },
  { key: 'social', label: 'Social', hint: 'Narrativas, ranking consultivo e saúde dos provedores' },
  { key: 'treinamento', label: 'Treinamento', hint: 'Runtime da AI, presets por regime, drift e experts' },
];

export function getPageDefinition(pageKey) {
  return DASHBOARD_PAGES.find((item) => item.key === pageKey) || DASHBOARD_PAGES[0];
}

export function getPageTitle(pageKey) {
  return getPageDefinition(pageKey)?.label || 'Dashboard';
}

export function getPageSubtitle(pageKey) {
  return getPageDefinition(pageKey)?.hint || DASHBOARD_PAGES[0].hint;
}
