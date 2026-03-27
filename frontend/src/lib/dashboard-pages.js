export const DASHBOARD_PAGES = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    hint: 'Visão executiva do capital, da saúde do backend, dos riscos e da atividade mais recente.',
  },
  {
    key: 'mercado',
    label: 'Mercado',
    hint: 'Radar visual de moedas com mini gráficos, variação em 24h, favoritos e comparação entre pares.',
  },
  {
    key: 'config',
    label: 'Configuração',
    hint: 'Parâmetros de risco, taxas, execução, reserva de BNB e universo monitorado pela IA.',
  },
  {
    key: 'operacoes',
    label: 'Operações',
    hint: 'Portfólio, ordens, backtests e resultados recentes para leitura operacional do bot.',
  },
  {
    key: 'execucao',
    label: 'Execução',
    hint: 'Controles do bot, prévias de ordem, healthchecks, reconciliação e supervisão do runtime.',
  },
  {
    key: 'governanca',
    label: 'Governança',
    hint: 'Readiness, incidentes, promoções, políticas e segurança antes de qualquer ativação sensível.',
  },
  {
    key: 'social',
    label: 'Social',
    hint: 'Ranking consultivo de moedas, narrativas, alertas e saúde dos provedores sociais.',
  },
  {
    key: 'treinamento',
    label: 'Treinamento',
    hint: 'Runtime da IA, drift, qualidade, presets por regime e experts ativos.',
  },
];

export function getPageDefinition(pageKey) {
  return DASHBOARD_PAGES.find((item) => item.key === pageKey) || DASHBOARD_PAGES[0];
}

export function getPageTitle(pageKey) {
  return getPageDefinition(pageKey).label;
}

export function getPageSubtitle(pageKey) {
  return getPageDefinition(pageKey).hint;
}
