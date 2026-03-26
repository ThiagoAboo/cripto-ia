export const DASHBOARD_PAGES = [
  { key: 'dashboard', label: 'Dashboard', hint: 'Visão geral da operação' },
  { key: 'config', label: 'Configuração', hint: 'Parâmetros do sistema e da IA' },
  { key: 'operacoes', label: 'Operações', hint: 'Portfólio, ordens e backtests' },
  { key: 'execucao', label: 'Execução', hint: 'Controles, saúde e envio supervisionado' },
  { key: 'governanca', label: 'Governança', hint: 'Promoções, policy, observabilidade e incidentes' },
  { key: 'social', label: 'Social', hint: 'Sugestões consultivas e provedores' },
  { key: 'treinamento', label: 'Treinamento', hint: 'Qualidade do modelo, drift e logs' },
];

export function getPageDefinition(pageKey) {
  return DASHBOARD_PAGES.find((item) => item.key === pageKey) || DASHBOARD_PAGES[0];
}

export function getPageTitle(pageKey) {
  return getPageDefinition(pageKey)?.label || 'Dashboard';
}
