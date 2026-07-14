import { Store } from 'lucide-react';

export const metadata = {
  title: 'Entrar',
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-secondary px-4">
      <div className="mb-8 flex items-center gap-2">
        <Store className="h-8 w-8 text-brand-500" />
        <span className="text-2xl font-bold text-text-primary">PedidoLocal</span>
      </div>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
