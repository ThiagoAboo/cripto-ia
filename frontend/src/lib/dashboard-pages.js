export const DASHBOARD_PAGES = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    hint: 'Visão geral da saúde do backend, carteira simulada, decisões recentes e sinais sociais.',
  },
  {
    key: 'config',
    label: 'Configuração',
    hint: 'Ajuste risco, execução, taxas, símbolos monitorados e políticas operacionais do bot.',
  },
  {
    key: 'operacoes',
    label: 'Operações',
    hint: 'Acompanhe portfólio, ordens, backtests e comparativos de estratégia em um só lugar.',
  },
  {
    key: 'execucao',
    label: 'Execução',
    hint: 'Controle o bot, verifique healthchecks e acompanhe a execução em paper ou live.',
  },
  {
    key: 'governanca',
    label: 'Governança',
    hint: 'Monitore readiness, alertas, incidentes e critérios de segurança operacional.',
  },
  {
    key: 'social',
    label: 'Social',
    hint: 'Veja narrativas, ranking consultivo, provedores e radar de risco social.',
  },
  {
    key: 'treinamento',
    label: 'Treinamento',
    hint: 'Gerencie runtime, presets por regime, drift e desempenho dos experts da IA.',
  },
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
