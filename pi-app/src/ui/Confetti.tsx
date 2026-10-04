import { useEffect, useRef } from 'react';

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#22c55e', '#f59e0b', '#38bdf8'];

/** One-shot canvas confetti burst; renders nothing after it finishes. Skipped for reduced motion. */
export function Confetti({ fire, onDone }: { fire: boolean; onDone?: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!fire) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onDone?.();
      return;
    }
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const parts = Array.from({ length: 160 }, () => ({
      x: canvas.width / 2 + (Math.random() - 0.5) * 200,
      y: canvas.height / 3,
      vx: (Math.random() - 0.5) * 14,
      vy: Math.random() * -14 - 4,
      r: Math.random() * 6 + 3,
      a: Math.random() * Math.PI,
      va: (Math.random() - 0.5) * 0.3,
      c: COLORS[Math.floor(Math.random() * COLORS.length)]!,
    }));
    let frame = 0;
    let raf = 0;
    const tick = () => {
      frame += 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of parts) {
        p.vy += 0.35;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.a += p.va;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - frame / 140);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.a);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6);
        ctx.restore();
      }
      if (frame < 140) raf = requestAnimationFrame(tick);
      else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        onDone?.();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fire, onDone]);

  return fire ? <canvas ref={ref} className="confetti" aria-hidden /> : null;
}
