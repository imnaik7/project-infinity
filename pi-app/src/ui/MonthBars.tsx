import { motion } from 'motion/react';

/** Paired bars per month (e.g. recognised vs billed) with an accessible summary. */
export function MonthBars({ data, aLabel, bLabel, format }: { data: { label: string; a: number; b: number }[]; aLabel: string; bLabel: string; format: (v: number) => string }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b]));
  return (
    <div className="month-bars-wrap">
      <div className="month-bars" role="img" aria-label={data.map((d) => `${d.label}: ${aLabel} ${format(d.a)}, ${bLabel} ${format(d.b)}`).join('; ')}>
        {data.map((d, i) => (
          <div key={d.label} className="mb-col">
            <div className="mb-pair">
              <motion.span className="mb-a" title={`${aLabel} ${format(d.a)}`} initial={{ height: 0 }} animate={{ height: `${(d.a / max) * 100}%` }} transition={{ delay: i * 0.06, type: 'spring', stiffness: 120, damping: 18 }} />
              <motion.span className="mb-b" title={`${bLabel} ${format(d.b)}`} initial={{ height: 0 }} animate={{ height: `${(d.b / max) * 100}%` }} transition={{ delay: i * 0.06 + 0.05, type: 'spring', stiffness: 120, damping: 18 }} />
            </div>
            <span className="small muted">{d.label}</span>
          </div>
        ))}
      </div>
      <div className="mb-legend small">
        <span><i className="mb-a" /> {aLabel}</span>
        <span><i className="mb-b" /> {bLabel}</span>
      </div>
    </div>
  );
}
