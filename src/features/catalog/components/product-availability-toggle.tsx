'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { setProductAvailabilityAction } from '@/features/catalog/actions';

interface ProductAvailabilityToggleProps {
  productId: string;
  isSoldOut: boolean;
}

/**
 * Toggle compacto de "Esgotado" para uso direto na listagem do catálogo.
 * Acessível para ATTENDANT — não requer MANAGE_CATALOG.
 */
export function ProductAvailabilityToggle({
  productId,
  isSoldOut: initialSoldOut,
}: ProductAvailabilityToggleProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleToggle() {
    if (pending) return;
    setPending(true);
    const newSoldOut = !initialSoldOut;
    try {
      const result = await setProductAvailabilityAction(productId, { isSoldOut: newSoldOut });
      if (result.success) {
        toast.success(
          newSoldOut ? 'Produto marcado como esgotado.' : 'Produto disponível novamente.',
        );
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={pending}
      aria-busy={pending}
      aria-label={initialSoldOut ? 'Marcar como disponível' : 'Marcar como esgotado'}
      title={
        initialSoldOut ? 'Clique para marcar como disponível' : 'Clique para marcar como esgotado'
      }
      className={`flex min-h-11 items-center gap-1 rounded-full px-3 text-xs font-medium transition-colors disabled:cursor-wait disabled:opacity-60 ${
        initialSoldOut
          ? 'bg-warning/15 text-warning hover:bg-warning/25'
          : 'bg-surface-secondary text-text-tertiary hover:bg-surface-secondary hover:text-text-secondary border-border border'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${initialSoldOut ? 'bg-warning' : 'bg-text-tertiary'}`}
      />
      {initialSoldOut ? 'Esgotado' : 'Em estoque'}
    </button>
  );
}
