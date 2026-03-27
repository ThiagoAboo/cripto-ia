export default function SidebarNav({ items, activeKey, onSelect }) {
  return (
    <aside className="workspace__sidebar panel panel--sidebar-clean">
      <div className="workspace__brand">
        <p className="eyebrow">Cripto IA</p>
        <h1>Painel operacional</h1>
        <p className="workspace__sidebar-copy">
          Acompanhe operação, mercado, configuração, IA, social e governança em áreas separadas e mais fáceis de ler.
        </p>
      </div>

      <nav className="workspace__nav" aria-label="Navegação principal do painel">
        {items.map((item) => {
          const isActive = activeKey === item.key;
          return (
            <button
              key={item.key}
              type="button"
              className={`workspace__nav-item ${isActive ? 'workspace__nav-item--active' : ''}`}
              onClick={() => onSelect(item.key)}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="workspace__nav-label">{item.label}</span>
              <span className="workspace__nav-hint">{item.hint}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
