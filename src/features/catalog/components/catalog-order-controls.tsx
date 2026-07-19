'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  moveCategoryAction,
  moveOptionAction,
  moveOptionGroupAction,
  moveProductAction,
} from '@/features/catalog/actions';

type OrderedItem = 'category' | 'product' | 'optionGroup' | 'option';

const moveActions = {
  category: moveCategoryAction,
  product: moveProductAction,
  optionGroup: moveOptionGroupAction,
  option: moveOptionAction,
};

export function CatalogOrderControls({
  id,
  kind,
  label,
  canMoveUp,
  canMoveDown,
}: {
  id: string;
  kind: OrderedItem;
  label: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const router = useRouter();
  const [moving, setMoving] = useState<'up' | 'down' | null>(null);

  async function move(direction: 'up' | 'down') {
    setMoving(direction);
    try {
      const result = await moveActions[kind](id, direction);
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      router.refresh();
    } finally {
      setMoving(null);
    }
  }

  return (
    <div className="flex items-center gap-1" role="group" aria-label={`Ordenar ${label}`}>
      <Button type="button" variant="ghost" size="icon" disabled={!canMoveUp || moving !== null} aria-label={`Mover ${label} para cima`} onClick={() => move('up')}>
        <ArrowUp aria-hidden="true" />
      </Button>
      <Button type="button" variant="ghost" size="icon" disabled={!canMoveDown || moving !== null} aria-label={`Mover ${label} para baixo`} onClick={() => move('down')}>
        <ArrowDown aria-hidden="true" />
      </Button>
    </div>
  );
}
