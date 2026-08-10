export default function CustomizationLoading() {
  return (
    <div
      className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]"
      aria-label="Carregando editor"
      aria-busy="true"
    >
      <div className="space-y-5">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="border-border bg-surface space-y-4 rounded-xl border p-5">
            <div className="bg-border h-6 w-56 max-w-full animate-pulse rounded" />
            <div className="bg-border h-24 animate-pulse rounded" />
          </div>
        ))}
      </div>
      <div className="border-border bg-surface h-96 animate-pulse rounded-xl border" />
      <span className="sr-only">Carregando personalização da loja…</span>
    </div>
  );
}
