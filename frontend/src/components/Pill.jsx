export default function Pill({ children, tone = 'info' }) {
  return <span className={`pill pill--${tone}`}>{children}</span>;
}
