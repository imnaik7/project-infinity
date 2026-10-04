import type { HTMLAttributes, ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'motion/react';

type Props = {
  children: ReactNode;
  className?: string;
  /** Lift + glow on hover (for clickable cards) */
  interactive?: boolean;
  /** Stagger index for entrance animation */
  index?: number;
  padded?: boolean;
} & Omit<HTMLMotionProps<'div'>, 'children'>;

/** Frosted glass surface with a staggered entrance. */
export function GlassCard({ children, className = '', interactive, index = 0, padded = true, ...rest }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: Math.min(index, 10) * 0.05, ease: [0.22, 1, 0.36, 1] }}
      whileHover={interactive ? { y: -3 } : undefined}
      className={`glass ${padded ? 'pad' : ''} ${interactive ? 'interactive' : ''} ${className}`}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export function SectionTitle({ title, action, hint }: { title: string; action?: ReactNode; hint?: string }) {
  return (
    <div className="section-title">
      <div>
        <h3>{title}</h3>
        {hint && <span className="muted small">{hint}</span>}
      </div>
      {action}
    </div>
  );
}

export function Pill({ children, tone = 'neutral', ...rest }: { children: ReactNode; tone?: 'neutral' | 'brand' | 'ok' | 'warn' | 'bad' } & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={`pill pill-${tone}`} {...rest}>
      {children}
    </span>
  );
}
