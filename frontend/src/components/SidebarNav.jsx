export default function SidebarNav({ items, activeKey, onSelect }) {
  return (
    <aside className="workspace__sidebar panel">
      <div className="workspace__brand">
        <p className="eyebrow">Cripto IA</p>
        <h1>Painel operacional</h1>
        <p className="workspace__sidebar-copy">
          Navegação por área para acompanhar operação, configuração, IA, social e governança sem misturar contextos.
        </p>
      </div>

      <nav className="workspace__nav">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`workspace__nav-item ${activeKey === item.key ? 'is-active' : ''}`}
            onClick={() => onSelect(item.key)}
          >
            <span className="workspace__nav-label">{item.label}</span>
            <span className="workspace__nav-hint">{item.hint}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
