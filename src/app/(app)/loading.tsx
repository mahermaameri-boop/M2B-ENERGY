// Squelette affiché instantanément pendant le chargement d'une page.
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 border-b border-gray-200 pb-4">
        <div className="skeleton h-6 w-56" />
        <div className="skeleton mt-2 h-4 w-80" />
      </div>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="carte p-4">
            <div className="skeleton h-3 w-24" />
            <div className="skeleton mt-3 h-7 w-20" />
          </div>
        ))}
      </div>
      <div className="carte p-4">
        <div className="skeleton mb-4 h-4 w-40" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="mb-3 flex gap-4">
            <div className="skeleton h-4 w-1/4" />
            <div className="skeleton h-4 w-1/3" />
            <div className="skeleton h-4 w-1/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
