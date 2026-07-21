'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  restoreCategoryAction,
  restoreProductAction,
} from '@/features/catalog/actions';
import { formatCurrency } from '@/lib/utils';

function relativeTime(date: Date | null): string {
  if (!date) return '';
  const diffMs = Date.now() - new Date(date).getTime();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHr = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHr / 24);
  const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
  if (diffSec < 60) return rtf.format(-diffSec, 'second');
  if (diffMin < 60) return rtf.format(-diffMin, 'minute');
  if (diffHr < 24) return rtf.format(-diffHr, 'hour');
  return rtf.format(-diffDay, 'day');
}

interface ArchivedCategory {
  id: string;
  name: string;
  description: string | null;
  archivedAt: Date | null;
  archiveReason: string | null;
  _count: { products: number };
}

interface ArchivedProduct {
  id: string;
  name: string;
  basePrice: number;
  archivedAt: Date | null;
  archiveReason: string | null;
  category: { id: string; name: string } | null;
}

interface ArchivedCatalogPanelProps {
  categories: ArchivedCategory[];
  products: ArchivedProduct[];
}

export function ArchivedCatalogPanel({ categories, products }: ArchivedCatalogPanelProps) {
  const router = useRouter();
  const hasItems = categories.length > 0 || products.length > 0;

  async function handleRestoreCategory(id: string): Promise<boolean> {
    const result = await restoreCategoryAction(id);
    if (result.success) {
      toast.success('Categoria restaurada! Ela voltou ao catálogo como inativa para revisão.');
      router.refresh();
      return true;
    } else {
      toast.error(result.error.message);
      return false;
    }
  }

  async function handleRestoreProduct(id: string): Promise<boolean> {
    const result = await restoreProductAction(id);
    if (result.success) {
      toast.success('Produto restaurado! Ele voltou ao catálogo como indisponível para revisão.');
      router.refresh();
      return true;
    } else {
      toast.error(result.error.message);
      return false;
    }
  }

  if (!hasItems) {
    return (
      <div className="text-text-secondary flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
        <RotateCcw className="h-8 w-8 opacity-30" />
        <p className="text-sm font-medium">Nenhum item arquivado</p>
        <p className="text-xs">Categorias e produtos arquivados aparecem aqui.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Categorias Arquivadas */}
      {categories.length > 0 && (
        <section>
          <h2 className="text-text-secondary mb-3 text-sm font-semibold uppercase tracking-wide">
            Categorias ({categories.length})
          </h2>
          <div className="divide-border bg-surface divide-y rounded-xl border">
            {categories.map((category) => (
              <div
                key={category.id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-text-primary font-medium">{category.name}</p>
                  <div className="text-text-secondary flex flex-wrap gap-x-3 text-xs">
                    <span>
                      {category._count.products}{' '}
                      {category._count.products === 1 ? 'produto' : 'produtos'}
                    </span>
                    {category.archivedAt && (
                      <span>Arquivada {relativeTime(category.archivedAt)}</span>
                    )}
                    {category.archiveReason && (
                      <span className="text-text-tertiary italic">
                        &ldquo;{category.archiveReason}&rdquo;
                      </span>
                    )}
                  </div>
                </div>
                <ConfirmDialog
                  title={`Restaurar "${category.name}"?`}
                  description="A categoria voltará ao catálogo como inativa. Verifique e ative quando estiver pronta."
                  confirmLabel="Restaurar categoria"
                  onConfirm={() => handleRestoreCategory(category.id)}
                  trigger={
                    <Button variant="outline" size="sm">
                      <RotateCcw className="h-3.5 w-3.5" />
                      Restaurar
                    </Button>
                  }
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Produtos Arquivados */}
      {products.length > 0 && (
        <section>
          <h2 className="text-text-secondary mb-3 text-sm font-semibold uppercase tracking-wide">
            Produtos ({products.length})
          </h2>
          <div className="divide-border bg-surface divide-y rounded-xl border">
            {products.map((product) => (
              <div
                key={product.id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-text-primary font-medium">{product.name}</p>
                  <div className="text-text-secondary flex flex-wrap gap-x-3 text-xs">
                    <span className="font-mono">{formatCurrency(product.basePrice)}</span>
                    {product.category && <span>em {product.category.name}</span>}
                    {product.archivedAt && (
                      <span>Arquivado {relativeTime(product.archivedAt)}</span>
                    )}
                    {product.archiveReason && (
                      <span className="text-text-tertiary italic">
                        &ldquo;{product.archiveReason}&rdquo;
                      </span>
                    )}
                  </div>
                </div>
                <ConfirmDialog
                  title={`Restaurar "${product.name}"?`}
                  description="O produto voltará ao catálogo como indisponível. Configure e ative quando estiver pronto."
                  confirmLabel="Restaurar produto"
                  onConfirm={() => handleRestoreProduct(product.id)}
                  trigger={
                    <Button variant="outline" size="sm">
                      <RotateCcw className="h-3.5 w-3.5" />
                      Restaurar
                    </Button>
                  }
                />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
