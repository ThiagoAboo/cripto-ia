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
  return (
    <div className="workspace">
      <SidebarNav items={DASHBOARD_PAGES} activeKey={activePage} onSelect={onSelectPage} />

      <main className="workspace__content">
        <header className="workspace__header panel">
          <div>
            <p className="eyebrow">Cripto IA</p>
            <h2>{getPageTitle(activePage)}</h2>
            <p className="workspace__subtitle">{getPageSubtitle(activePage)}</p>
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
