export const DASHBOARD_PAGES = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    hint: 'Visão executiva da operação, do capital simulado, dos riscos e da atividade mais recente.',
    context: 'Use esta tela para entender rapidamente saúde do backend, patrimônio, PnL, alertas e posições.',
  },
  {
    key: 'mercado',
    label: 'Mercado',
    hint: 'Radar com mini gráficos, favoritos, presets rápidos e comparação lado a lado entre pares da Binance.',
    context: 'Selecione a base de conversão, monte uma watchlist e use os atalhos para ir direto para operação ou execução.',
  },
  {
    key: 'config',
    label: 'Configuração',
    hint: 'Parâmetros de risco, execução, taxas, universo monitorado e comportamento da IA.',
    context: 'Ajuste aqui as regras operacionais antes de colocar o runtime para agir.',
  },
  {
    key: 'operacoes',
    label: 'Operações',
    hint: 'Portfólio, ordens, backtests e validações para acompanhar o resultado da estratégia.',
    context: 'Área de acompanhamento prático do que o sistema está gerando no dia a dia.',
  },
  {
    key: 'execucao',
    label: 'Execução',
    hint: 'Controles do bot, prévias de ordem, healthchecks, reconciliação e supervisão do runtime.',
    context: 'Use para pausar, retomar, validar e supervisionar paper ou live com segurança.',
  },
  {
    key: 'governanca',
    label: 'Governança',
    hint: 'Readiness, políticas, promoções, incidentes e critérios de segurança operacional.',
    context: 'Camada de proteção antes de qualquer promoção de configuração ou ativação sensível.',
  },
  {
    key: 'social',
    label: 'Social',
    hint: 'Narrativas, ranking consultivo, alertas e saúde dos provedores sociais.',
    context: 'Contexto de mercado para apoiar leitura de cenário, sem executar trades diretamente.',
  },
  {
    key: 'treinamento',
    label: 'Treinamento',
    hint: 'Runtime, presets por regime, drift, qualidade e experts usados pela IA.',
    context: 'Gerencie aprendizado, sincronização do runtime e ajustes assistidos dos experts.',
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
