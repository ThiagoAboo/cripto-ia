import DashboardPage from './pages/DashboardPage';
import MercadoPage from './pages/MercadoPage';
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
  mercado: MercadoPage,
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
      {loading ? (
        <section className="section-card section-card--loading">
          <div className="loading-state">
            <div className="loading-state__spinner" aria-hidden="true" />
            <div>
              <strong>Carregando painel...</strong>
              <p>Estamos sincronizando saúde, configuração, execução, social e treinamento.</p>
            </div>
          </div>
        </section>
      ) : (
        <ActivePage ctx={pageContext} />
      )}
    </AppShell>
  );
}
