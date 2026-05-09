/** Whole-number stats: under 1000 as digits; ≥1000 as 1k / 1.3k / 12k / 2.5m. */
export function formatCompactCount(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const v = Math.trunc(n);
  const neg = v < 0;
  const a = Math.abs(v);
  const sign = neg ? '-' : '';

  if (a < 1000) return `${sign}${a}`;

  if (a < 1_000_000) {
    const k = a / 1000;
    const r = Math.round(k * 10) / 10;
    const s = Number.isInteger(r) ? String(r) : r.toFixed(1);
    return `${sign}${s}k`;
  }

  const m = a / 1_000_000;
  const r = Math.round(m * 10) / 10;
  const s = Number.isInteger(r) ? String(r) : r.toFixed(1);
  return `${sign}${s}m`;
}
