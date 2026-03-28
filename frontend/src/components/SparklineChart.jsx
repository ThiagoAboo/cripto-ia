function buildPoints(values = [], width, height, padding) {
  if (!Array.isArray(values) || values.length < 2) return '';

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return values
    .map((value, index) => {
      const x = padding + (index * (width - padding * 2)) / Math.max(values.length - 1, 1);
      const y = height - padding - ((value - min) * (height - padding * 2)) / range;
      return `${x},${y}`;
    })
    .join(' ');
}

export default function SparklineChart({ values = [], positive = true, ariaLabel = 'Mini gráfico' }) {
  const width = 240;
  const height = 72;
  const padding = 6;
  const points = buildPoints(values, width, height, padding);

  if (!points) {
    return <div className="sparkline sparkline--empty">Sem candles suficientes.</div>;
  }

  return (
    <svg
      className={`sparkline ${positive ? 'sparkline--positive' : 'sparkline--negative'}`}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="none"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        points={points}
      />
    </svg>
  );
}
