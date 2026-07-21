'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { reorderCategoriesAction, reorderProductsAction } from '@/features/catalog/actions';

type ReorderKind = 'category' | 'product';

interface SortableItem {
  id: string;
  name: string;
}

interface CatalogSortableListProps {
  items: SortableItem[];
  kind: ReorderKind;
  /** Label de acessibilidade (ex.: "categorias", "produtos da categoria X") */
  label: string;
  children?: (item: SortableItem, index: number) => React.ReactNode;
}

const reorderActions: Record<ReorderKind, (ids: string[]) => Promise<{ success: boolean; error?: { message: string } }>> = {
  category: reorderCategoriesAction,
  product: reorderProductsAction,
};

/**
 * Lista reordenável com drag-and-drop HTML5 nativo.
 * Mantém uma cópia local da ordem e persiste via server action apenas ao soltar.
 */
export function CatalogSortableList({ items, kind, label, children }: CatalogSortableListProps) {
  const router = useRouter();
  const [localOrder, setLocalOrder] = useState<SortableItem[]>(items);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const isSaving = useRef(false);

  // Atualiza localOrder quando os items externos mudam (ex.: router.refresh)
  const prevIds = useRef(items.map((i) => i.id).join(','));
  const currentIds = items.map((i) => i.id).join(',');
  if (prevIds.current !== currentIds) {
    prevIds.current = currentIds;
    setLocalOrder(items);
  }

  const handleDragStart = useCallback((e: React.DragEvent, index: number, id: string) => {
    dragIndexRef.current = index;
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverIndex(index);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent, dropIndex: number) => {
      e.preventDefault();
      const fromIndex = dragIndexRef.current;
      if (fromIndex === null || fromIndex === dropIndex) {
        setDraggingId(null);
        setOverIndex(null);
        return;
      }

      // Reordena localmente (optimistic)
      const next = [...localOrder];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(dropIndex, 0, moved);
      setLocalOrder(next);
      setDraggingId(null);
      setOverIndex(null);
      dragIndexRef.current = null;

      if (isSaving.current) return;
      isSaving.current = true;
      try {
        const result = await reorderActions[kind](next.map((i) => i.id));
        if (!result.success) {
          toast.error(result.error?.message ?? 'Erro ao reordenar.');
          setLocalOrder(items); // reverte
        } else {
          router.refresh();
        }
      } finally {
        isSaving.current = false;
      }
    },
    [localOrder, items, kind, router],
  );

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setOverIndex(null);
    dragIndexRef.current = null;
  }, []);

  return (
    <ol
      className="divide-border divide-y"
      aria-label={`Reordenar ${label} — arraste para reorganizar`}
    >
      {localOrder.map((item, index) => {
        const isDragging = draggingId === item.id;
        const isOver = overIndex === index && !isDragging;

        return (
          <li
            key={item.id}
            draggable
            onDragStart={(e) => handleDragStart(e, index, item.id)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            className={`group flex items-center gap-2 transition-all ${
              isDragging ? 'opacity-40' : ''
            } ${isOver ? 'border-t-2 border-brand-500' : ''}`}
          >
            {/* Handle de drag */}
            <button
              type="button"
              className="text-text-tertiary hover:text-text-secondary ml-2 cursor-grab touch-none active:cursor-grabbing"
              aria-label={`Arrastar ${item.name}`}
              tabIndex={-1}
            >
              <GripVertical className="h-4 w-4" aria-hidden="true" />
            </button>

            {/* Conteúdo customizável */}
            <div className="min-w-0 flex-1">
              {children ? children(item, index) : <span className="text-text-primary text-sm">{item.name}</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
