/**
 * Skeleton shown while a MovieRow's async data is pending.
 */
export function MovieRowSkeleton({ title }: { title: string }) {
  return (
    <section className="row">
      <h3 className="row-title">{title}</h3>
      <div className="row-grid">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton" />)}
      </div>
    </section>
  );
}
