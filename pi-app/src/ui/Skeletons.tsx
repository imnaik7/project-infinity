/** Shimmering placeholders shown while data loads. */
export function SkeletonBlock({ h = 16, w = '100%', r = 8 }: { h?: number; w?: number | string; r?: number }) {
  return <span className="skeleton" style={{ height: h, width: w, borderRadius: r }} aria-hidden />;
}

export function PageSkeleton() {
  return (
    <div className="page" aria-busy="true" aria-label="Loading">
      <SkeletonBlock h={120} r={20} />
      <div className="kpi-grid">
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonBlock key={i} h={112} r={16} />
        ))}
      </div>
      <div className="grid-2">
        <SkeletonBlock h={280} r={16} />
        <SkeletonBlock h={280} r={16} />
      </div>
    </div>
  );
}
