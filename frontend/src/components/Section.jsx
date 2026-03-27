export default function Section({ title, subtitle, actions, children }) {
  return (
    <section className="section-card">
      <header className="section-card__header">
        <div>
          <h2 className="section-card__title">{title}</h2>
          {subtitle ? <p className="section-card__subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="section-card__actions">{actions}</div> : null}
      </header>
      <div className="section-card__body">{children}</div>
    </section>
  );
}
