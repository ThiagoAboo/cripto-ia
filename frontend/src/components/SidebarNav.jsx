export default function SidebarNav({ items, activeKey, onSelect }) {
  return (
    <nav className="sidebar-nav" aria-label="Navegação principal">
      <div
        className="sidebar-nav__menu"
        style={{ height: '100%', overflowY: 'auto', paddingRight: 6 }}
      >
        {items.map((item) => {
          const isActive = activeKey === item.key;
          return (
            <button
              key={item.key}
              className={`sidebar-nav__item${isActive ? ' sidebar-nav__item--active' : ''}`}
              onClick={() => onSelect(item.key)}
              aria-current={isActive ? 'page' : undefined}
            >
              <strong>{item.label}</strong>
              <span>{item.hint}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
