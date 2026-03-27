export const DASHBOARD_PAGES = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    hint: 'Visão executiva da operação, do capital simulado e dos sinais mais recentes do sistema.',
    context: 'Resumo rápido para entender saúde, exposição, alertas e atividade do bot.',
  },
  {
    key: 'config',
    label: 'Configuração',
    hint: 'Parâmetros que controlam risco, execução, taxas, universo monitorado e comportamento da IA.',
    context: 'Aqui você ajusta a política operacional antes de liberar o runtime.',
  },
  {
    key: 'operacoes',
    label: 'Operações',
    hint: 'Portfólio, ordens, backtests e validações para acompanhar o que a estratégia está produzindo.',
    context: 'Área voltada para resultado operacional, histórico e análise prática da estratégia.',
  },
  {
    key: 'execucao',
    label: 'Execução',
    hint: 'Controles do bot, healthchecks, reconciliação e envio supervisionado em paper ou live.',
    context: 'Use esta área para pausar, retomar, validar e supervisionar a execução.',
  },
  {
    key: 'governanca',
    label: 'Governança',
    hint: 'Readiness, políticas, promoções, incidentes e critérios de segurança operacional.',
    context: 'Tudo o que protege a operação antes de qualquer promoção ou ativação mais sensível.',
  },
  {
    key: 'social',
    label: 'Social',
    hint: 'Narrativas, ranking consultivo, alertas e saúde dos provedores sociais.',
    context: 'Camada consultiva para contexto de mercado, sem executar compra e venda diretamente.',
  },
  {
    key: 'treinamento',
    label: 'Treinamento',
    hint: 'Runtime, presets por regime, drift, qualidade e experts usados pela IA.',
    context: 'Gerencie aprendizado, sincronização de runtime e ajustes assistidos da IA.',
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
