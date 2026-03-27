import SidebarNav from './SidebarNav';
import StatusBadge from './StatusBadge';
import { DASHBOARD_PAGES, getPageDefinition } from '../lib/dashboard-pages';

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
  const page = getPageDefinition(activePage);

  return (
    <div className="workspace">
      <SidebarNav items={DASHBOARD_PAGES} activeKey={activePage} onSelect={onSelectPage} />

      <main className="workspace__content">
        <header className="workspace__header panel">
          <div>
            <p className="eyebrow">Cripto IA</p>
            <h2>{page.label}</h2>
            <p className="workspace__subtitle">{page.hint}</p>
            <div className="workspace__header-meta">
              <span className="workspace__header-chip">Área atual: {page.label}</span>
              <span className="workspace__header-chip workspace__header-chip--muted">{page.context}</span>
            </div>
          </div>
          <div className="hero__status-group">
            <StatusBadge connected={sseConnected} label={sseConnected ? 'SSE conectado' : 'SSE reconectando'} />
            <StatusBadge connected={Boolean(health?.ok)} label={health?.ok ? 'Backend saudável' : 'Backend indisponível'} />
            <button className="button button--ghost" onClick={onRefresh}>Atualizar agora</button>
          </div>
        </header>

        {error ? <div className="alert alert--danger">{error}</div> : null}
        {saveMessage ? <div className="alert alert--success">{saveMessage}</div> : null}

        {children}
      </main>
    </div>
  );
}
