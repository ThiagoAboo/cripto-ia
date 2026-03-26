import DashboardPage from './pages/DashboardPage';
import ConfiguracaoPage from './pages/ConfiguracaoPage';
import OperacoesPage from './pages/OperacoesPage';
import ExecucaoPage from './pages/ExecucaoPage';
import GovernancaPage from './pages/GovernancaPage';
import SocialPage from './pages/SocialPage';
import TreinamentoPage from './pages/TreinamentoPage';
import AppShell from './components/AppShell';
import { useDashboardController } from './hooks/useDashboardController';

const PAGE_COMPONENTS = {
  dashboard: DashboardPage,
  config: ConfiguracaoPage,
  operacoes: OperacoesPage,
  execucao: ExecucaoPage,
  governanca: GovernancaPage,
  social: SocialPage,
  treinamento: TreinamentoPage,
};

export default function App() {
  const {
    activePage,
    setActivePage,
    loading,
    error,
    saveMessage,
    sseConnected,
    health,
    loadEverything,
    pageContext,
  } = useDashboardController();

  if (loading) {
    return <div className="app-loading">Carregando painel modular...</div>;
  }

  const ActivePage = PAGE_COMPONENTS[activePage] || DashboardPage;

  return (
    <AppShell
      activePage={activePage}
      onSelectPage={setActivePage}
      health={health}
      sseConnected={sseConnected}
      error={error}
      saveMessage={saveMessage}
      onRefresh={loadEverything}
    >
      <ActivePage ctx={pageContext} />
    </AppShell>
  );
}
