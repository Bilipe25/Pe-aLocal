import { Loader2 } from 'lucide-react';

export default function DashboardLoading() {
  return (
    <div className="flex h-[50vh] w-full items-center justify-center">
      <div className="flex flex-col items-center gap-2 text-tinta/50">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm">Carregando...</p>
      </div>
    </div>
  );
}
