export default function DashboardLoading() {
  return (
    <div className="space-y-6" role="status" aria-label="Carregando painel">
      <div className="space-y-2">
        <div className="bg-surface-tertiary h-8 w-48 animate-pulse rounded-lg" />
        <div className="bg-surface-tertiary h-5 w-full max-w-xl animate-pulse rounded" />
      </div>
      <div className="bg-surface-tertiary h-36 animate-pulse rounded-xl" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="bg-surface-tertiary h-20 animate-pulse rounded-xl" />
        ))}
      </div>
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
