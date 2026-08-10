export default function AdminLoading() {
  return (
    <div className="space-y-6" aria-label="Carregando administração" aria-busy="true">
      <div className="space-y-2">
        <div className="bg-border h-4 w-24 animate-pulse rounded" />
        <div className="bg-border h-8 w-72 max-w-full animate-pulse rounded" />
        <div className="bg-border h-4 w-full max-w-xl animate-pulse rounded" />
      </div>
      <div className="border-border bg-surface grid grid-cols-2 overflow-hidden rounded-xl border lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="border-border space-y-3 border-r p-5 last:border-r-0">
            <div className="bg-border h-4 w-24 animate-pulse rounded" />
            <div className="bg-border h-9 w-16 animate-pulse rounded" />
          </div>
        ))}
      </div>
      <div className="border-border bg-surface space-y-4 rounded-xl border p-5">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="bg-border h-12 animate-pulse rounded" />
        ))}
      </div>
      <span className="sr-only">Carregando dados administrativos…</span>
    </div>
  );
}
