import { useId } from 'react';

/**
 * Project Infinity mark: an infinity loop stroked with a violet → indigo → cyan gradient, with a short
 * pulse of light that travels around the loop (paused for reduced motion via CSS).
 */
export function InfinityMark({ size = 40, badge = true, animated = true }: { size?: number; badge?: boolean; animated?: boolean }) {
  const id = useId().replace(/:/g, '');
  const loop = 'M30 30 C30 15 47 15 50 30 C53 45 70 45 70 30 C70 15 53 15 50 30 C47 45 30 45 30 30 Z';
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="Project Infinity" className={`infinity-mark ${animated ? 'animated' : ''}`}>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a855f7" />
          <stop offset="0.5" stopColor="#6366f1" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
        <linearGradient id={`bg${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1e1147" />
          <stop offset="1" stopColor="#0b0b25" />
        </linearGradient>
        <filter id={`glow${id}`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {badge && <rect x="2" y="2" width="96" height="96" rx="26" fill={`url(#bg${id})`} stroke="rgba(167,139,250,0.35)" strokeWidth="1.5" />}
      <g transform="translate(0 20)" filter={`url(#glow${id})`}>
        <path d={loop} fill="none" stroke={`url(#g${id})`} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
        {animated && <path className="infinity-pulse" d={loop} fill="none" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" pathLength={100} strokeDasharray="8 92" />}
      </g>
    </svg>
  );
}

/** Mark + wordmark for the sidebar / sign-in. */
export function Wordmark({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <span className="wordmark">
      <InfinityMark size={38} />
      {!collapsed && (
        <span className="wordmark-text">
          <strong>Project</strong>
          <em>Infinity</em>
        </span>
      )}
    </span>
  );
}
