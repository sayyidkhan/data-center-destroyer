import React from 'react';

/** Shared stat cell for hero + tower inspector grids (boxed label / value rows). */
export function InspectMiniStat({
  label,
  value,
  muted,
}: {
  label: string;
  value: string | number;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex min-h-[2.75rem] items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 ${
        muted ? 'border-white/[0.08] bg-dark-800/55' : 'border-white/[0.08] bg-dark-700/85'
      }`}
    >
      <span className="shrink-0 font-mono text-sm uppercase tracking-wide text-white/55">{label}</span>
      <span
        className={`min-w-0 truncate text-right font-mono text-base font-bold tabular-nums ${
          muted ? 'text-white/50' : 'text-white/92'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
