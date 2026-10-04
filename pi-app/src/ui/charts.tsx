// Hand-rolled SVG charts — no chart library, theme-aware via CSS variables.
import { motion } from 'motion/react';
import { useId } from 'react';

export function Sparkline({ values, width = 96, height = 32 }: { values: number[]; width?: number; height?: number }) {
  const gid = useId();
  if (values.length < 2) return <svg width={width} height={height} aria-hidden />;
  const max = Math.max(...values, 1);
  const step = width / (values.length - 1);
  const pts = values.map((v, i) => [i * step, height - 3 - (v / max) * (height - 6)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <defs>
        <linearGradient id={`sl${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`sk${gid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#db2777" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sl${gid})`} />
      <motion.path
        d={line}
        fill="none"
        stroke={`url(#sk${gid})`}
        strokeWidth="2"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.1, ease: 'easeOut' }}
      />
    </svg>
  );
}

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

export function Donut({ slices, size = 168, thickness = 18, center }: { slices: DonutSlice[]; size?: number; thickness?: number; center?: React.ReactNode }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Status distribution">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={thickness} />
        {total > 0 &&
          slices
            .filter((s) => s.value > 0)
            .map((s, i) => {
              const len = (s.value / total) * c;
              const seg = (
                <motion.circle
                  key={s.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={thickness}
                  strokeLinecap="butt"
                  transform={`rotate(-90 ${size / 2} ${size / 2})`}
                  strokeDasharray={`${Math.max(len - 2, 0)} ${c}`}
                  initial={{ strokeDashoffset: -offset + len }}
                  animate={{ strokeDashoffset: -offset }}
                  transition={{ duration: 0.9, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                >
                  <title>{`${s.label}: ${s.value}`}</title>
                </motion.circle>
              );
              offset += len;
              return seg;
            })}
      </svg>
      {center && <div className="donut-center">{center}</div>}
    </div>
  );
}

export function ProgressRing({ value, size = 56, stroke = 6, label }: { value: number; size?: number; stroke?: number; label?: string }) {
  const gid = useId();
  const pct = Math.max(0, Math.min(1, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={label ?? `${Math.round(pct * 100)}% complete`}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id={`rg${gid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="60%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#ec4899" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#rg${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <span className="ring-label">{Math.round(pct * 100)}%</span>
    </div>
  );
}

export interface BarPart {
  label: string;
  value: number;
  color: string;
}

/** Horizontal stacked bar (salary breakup, funnel splits). */
export function StackedBar({ parts, height = 12 }: { parts: BarPart[]; height?: number }) {
  const total = parts.reduce((s, p) => s + Math.max(p.value, 0), 0);
  return (
    <div className="stacked" style={{ height }} role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(', ')}>
      {total > 0 &&
        parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <motion.span
              key={p.label}
              title={`${p.label}: ${p.value.toLocaleString('en-IN')}`}
              style={{ background: p.color }}
              initial={{ width: 0 }}
              animate={{ width: `${(p.value / total) * 100}%` }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            />
          ))}
    </div>
  );
}
