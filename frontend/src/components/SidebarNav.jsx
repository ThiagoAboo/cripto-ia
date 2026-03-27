export default function SidebarNav({ items, activeKey, onSelect }) {
  const styles = {
    aside: {
      display: 'flex',
      flexDirection: 'column',
      gap: '18px',
      padding: '18px 14px',
      minHeight: '100%',
      position: 'sticky',
      top: '16px',
      alignSelf: 'start',
    },
    brand: {
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      paddingBottom: '6px',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
    },
    title: {
      margin: 0,
      fontSize: 'clamp(1.65rem, 2.5vw, 2.3rem)',
      lineHeight: 1.05,
    },
    copy: {
      margin: 0,
      color: 'var(--text)',
      opacity: 0.92,
      lineHeight: 1.45,
      fontSize: '0.98rem',
    },
    nav: {
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
    },
    item: {
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: '4px',
      textAlign: 'left',
      padding: '12px 14px',
      borderRadius: '14px',
      border: '1px solid rgba(255,255,255,0.08)',
      background: 'rgba(255,255,255,0.03)',
      color: 'var(--text)',
      transition: 'background 0.18s ease, border-color 0.18s ease, transform 0.18s ease',
    },
    itemActive: {
      border: '1px solid rgba(106,168,255,0.38)',
      background: 'rgba(106,168,255,0.14)',
      boxShadow: 'inset 0 0 0 1px rgba(106,168,255,0.12)',
    },
    label: {
      display: 'block',
      margin: 0,
      fontSize: '0.98rem',
      fontWeight: 700,
      lineHeight: 1.2,
    },
    hint: {
      display: 'block',
      margin: 0,
      color: 'var(--muted)',
      fontSize: '0.92rem',
      lineHeight: 1.35,
      whiteSpace: 'normal',
      wordBreak: 'break-word',
    },
  };

  return (
    <aside className="workspace__sidebar panel" style={styles.aside}>
      <div className="workspace__brand" style={styles.brand}>
        <p className="eyebrow">Cripto IA</p>
        <h1 style={styles.title}>Painel operacional</h1>
        <p className="workspace__sidebar-copy" style={styles.copy}>
          Navegação por área para acompanhar operação, configuração, IA, social e governança sem misturar contextos.
        </p>
      </div>

      <nav className="workspace__nav" style={styles.nav}>
        {items.map((item) => {
          const isActive = activeKey === item.key;
          return (
            <button
              key={item.key}
              type="button"
              className={`workspace__nav-item ${isActive ? 'is-active' : ''}`}
              onClick={() => onSelect(item.key)}
              style={{ ...styles.item, ...(isActive ? styles.itemActive : null) }}
            >
              <span className="workspace__nav-label" style={styles.label}>{item.label}</span>
              <span className="workspace__nav-hint" style={styles.hint}>{item.hint}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
