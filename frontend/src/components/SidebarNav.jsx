export default function SidebarNav({ items, activeKey, onSelect }) {
  return (
    <aside className="sidebar panel">
      <div className="sidebar__brand">
        <p className="eyebrow">Cripto IA</p>
        <h1>Painel modular</h1>
        <p>Etapa 19 — navegação por domínio e visão mais limpa do dashboard.</p>
      </div>

      <nav className="sidebar__nav">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`sidebar__nav-item ${activeKey === item.key ? 'sidebar__nav-item--active' : ''}`}
            onClick={() => onSelect(item.key)}
          >
            <span className="sidebar__nav-title">{item.label}</span>
            <span className="sidebar__nav-hint">{item.hint}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
