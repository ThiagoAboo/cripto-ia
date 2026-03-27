export default function SidebarNav({ items, activeKey, onSelect }) {
  return (
    <aside className="sidebar-nav">
      <div className="sidebar-nav__brand">
        <span className="sidebar-nav__brand-chip">IA</span>
        <div>
          <strong>Cripto IA</strong>
          <p>Painel operacional em português-BR, com módulos separados por domínio.</p>
        </div>
      </div>

      <nav className="sidebar-nav__menu" aria-label="Navegação principal do painel">
        {items.map((item) => {
          const isActive = activeKey === item.key;
          return (
            <button
              key={item.key}
              type="button"
              className={`sidebar-nav__item ${isActive ? 'sidebar-nav__item--active' : ''}`}
              onClick={() => onSelect(item.key)}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="sidebar-nav__label">{item.label}</span>
              <span className="sidebar-nav__hint">{item.hint}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
