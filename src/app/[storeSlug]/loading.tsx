import { Loader2 } from 'lucide-react';

export default function StorefrontLoading() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-papel">
      <div className="flex flex-col items-center gap-2 text-pimenta/60">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    </div>
  );
}
