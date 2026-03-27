export default function ConfigField({ label, hint, children }) {
  return (
    <label className="config-field">
      <span className="config-field__label">{label}</span>
      <div className="config-field__control">{children}</div>
      {hint ? <span className="config-field__hint">{hint}</span> : null}
    </label>
  );
}
