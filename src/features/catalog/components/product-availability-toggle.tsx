'use client';

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

  async function handleToggle() {
    const newSoldOut = !initialSoldOut;
    const result = await setProductAvailabilityAction(productId, { isSoldOut: newSoldOut });
    if (result.success) {
      toast.success(newSoldOut ? 'Produto marcado como esgotado.' : 'Produto disponível novamente.');
      router.refresh();
    } else {
      toast.error(result.error.message);
    }
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={initialSoldOut ? 'Marcar como disponível' : 'Marcar como esgotado'}
      title={initialSoldOut ? 'Clique para marcar como disponível' : 'Clique para marcar como esgotado'}
      className={`flex h-6 items-center gap-1 rounded-full px-2 text-xs font-medium transition-colors ${
        initialSoldOut
          ? 'bg-warning/15 text-warning hover:bg-warning/25'
          : 'bg-surface-secondary text-text-tertiary hover:bg-surface-secondary hover:text-text-secondary border border-border'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${initialSoldOut ? 'bg-warning' : 'bg-text-tertiary'}`} />
      {initialSoldOut ? 'Esgotado' : 'Em estoque'}
    </button>
  );
}
