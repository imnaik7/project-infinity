/** Slow-drifting gradient blobs behind the app (pure CSS animation, paused for reduced motion). */
export function Aura() {
  return (
    <div className="aura" aria-hidden>
      <span className="blob b1" />
      <span className="blob b2" />
      <span className="blob b3" />
      <span className="grain" />
    </div>
  );
}
