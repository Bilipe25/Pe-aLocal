export default function DiningRoomLoading() {
  return (
    <main
      className="mx-auto w-full max-w-[92rem] space-y-7 px-4 py-6 sm:px-6 lg:px-8"
      aria-busy="true"
      aria-label="Carregando salão"
    >
      <div className="border-border space-y-3 border-b pb-6">
        <div className="bg-surface-secondary h-9 w-32 animate-pulse rounded-lg" />
        <div className="bg-surface-secondary h-5 w-72 max-w-full animate-pulse rounded-md" />
      </div>
      <div className="flex gap-2">
        <div className="bg-surface-secondary h-11 w-24 animate-pulse rounded-lg" />
        <div className="bg-surface-secondary h-11 w-36 animate-pulse rounded-lg" />
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="bg-surface-secondary h-48 animate-pulse rounded-xl" />
        ))}
      </div>
      <span className="sr-only">Carregando visão operacional do salão.</span>
    </main>
  );
}
