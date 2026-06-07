export function Skeleton() {
  return (
    <div>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="skeleton skeleton-block" style={{ marginBottom: 8 }} />
      ))}
    </div>
  );
}
