import { AlertTriangle } from 'lucide-react';

interface StoreClosedBannerProps {
  status: 'CLOSED' | 'PAUSED';
}

export function StoreClosedBanner({ status }: StoreClosedBannerProps) {
  return (
    <div className="border-b border-pimenta/20 bg-pimenta/5 px-4 py-2.5">
      <div className="mx-auto flex max-w-2xl items-center gap-2 text-sm">
        <AlertTriangle className="storefront-action-text h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="text-tinta">
          {status === 'PAUSED'
            ? 'A loja está temporariamente indisponível.'
            : 'A loja está fechada no momento. Você pode ver o cardápio, mas não pode fazer pedidos.'}
        </p>
      </div>
    </div>
  );
}
