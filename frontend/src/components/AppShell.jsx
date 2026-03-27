import SidebarNav from './SidebarNav';
import StatusBadge from './StatusBadge';
import { DASHBOARD_PAGES, getPageTitle, getPageSubtitle } from '../lib/dashboard-pages';

export default function AppShell({
  activePage,
  onSelectPage,
  health,
  sseConnected,
  error,
  saveMessage,
  onRefresh,
  children,
}) {
  const backendHealthy = Boolean(health?.ok);

  return (
    <div className="workspace-shell">
      <SidebarNav items={DASHBOARD_PAGES} activeKey={activePage} onSelect={onSelectPage} />

      <div className="workspace-main">
        <header className="workspace-header">
          <div>
            <span className="workspace-header__eyebrow">Cripto IA</span>
            <h1 className="workspace-header__title">{getPageTitle(activePage)}</h1>
            <p className="workspace-header__subtitle">{getPageSubtitle(activePage)}</p>
          </div>

          <div className="workspace-header__actions">
            <StatusBadge connected={backendHealthy} label={backendHealthy ? 'Backend online' : 'Backend indisponível'} />
            <StatusBadge connected={sseConnected} label={sseConnected ? 'SSE conectado' : 'SSE desconectado'} />
            <button type="button" className="btn btn--secondary" onClick={onRefresh}>
              Atualizar agora
            </button>
          </div>
        </header>

        {error ? <div className="banner banner--danger">{error}</div> : null}
        {saveMessage ? <div className="banner banner--success">{saveMessage}</div> : null}

        <main className="workspace-content">{children}</main>
      </div>
    </div>
  );
}
