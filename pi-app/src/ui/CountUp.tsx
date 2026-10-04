import { useEffect, useRef, useState } from 'react';
import { animate, useReducedMotion } from 'motion/react';

/** Animates a number from its previous value to `value`. */
export function CountUp({ value, suffix = '', duration = 1.1 }: { value: number; suffix?: string; duration?: number }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    if (reduce) return;
    const controls = animate(from.current, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setShown(v),
    });
    from.current = value;
    return () => controls.stop();
  }, [value, duration, reduce]);

  return (
    <span className="tabular">
      {Math.round(reduce ? value : shown).toLocaleString('en-IN')}
      {suffix}
    </span>
  );
}
