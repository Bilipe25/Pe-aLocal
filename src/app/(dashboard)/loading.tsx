export default function DashboardLoading() {
  return (
    <div className="space-y-6" role="status" aria-label="Carregando painel">
      <div className="space-y-2">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-tertiary" />
        <div className="h-5 w-full max-w-xl animate-pulse rounded bg-surface-tertiary" />
      </div>
      <div className="h-36 animate-pulse rounded-xl bg-surface-tertiary" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-20 animate-pulse rounded-xl bg-surface-tertiary" />
        ))}
      </div>
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
