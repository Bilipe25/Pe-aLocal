'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  createProductAction,
  updateProductAction,
  archiveProductAction,
  setProductAvailabilityAction,
} from '@/features/catalog/actions';
import { FormMessage } from '@/components/shared/form-message';
import { FormSubmitButton } from '@/components/shared/form-submit-button';
import { PriceInput } from '@/components/shared/price-input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useState } from 'react';

interface Category {
  id: string;
  name: string;
}

interface ProductFormProps {
  categories: Category[];
  product?: {
    id: string;
    categoryId: string;
    name: string;
    description: string | null;
    basePrice: number;
    isAvailable: boolean;
    isFeatured: boolean;
    isSoldOut: boolean;
    allowNotes: boolean;
    sortOrder: number;
    version: number;
    archivedAt: Date | null;
  };
}

export function ProductForm({ categories, product }: ProductFormProps) {
  const router = useRouter();
  const isEditing = !!product;
  const [error, setError] = useState<string | null>(null);
  const [isSoldOut, setIsSoldOut] = useState(product?.isSoldOut ?? false);
  const [isAvailableOptimistic, setIsAvailableOptimistic] = useState(product?.isAvailable ?? true);
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? '');
  const isConcurrencyError = error?.includes('foi alterado por outro usuário');

  async function handleSubmit(formData: FormData) {
    setError(null);
    const result = isEditing
      ? await updateProductAction(product.id, formData)
      : await createProductAction(formData);

    if (result.success) {
      toast.success(isEditing ? 'Produto atualizado!' : 'Produto criado!');
      const createdProduct =
        typeof result.data === 'object' && result.data !== null && 'id' in result.data
          ? result.data
          : null;
      router.push(
        createdProduct
          ? `/dashboard/catalog/products/${createdProduct.id}/edit`
          : '/dashboard/catalog',
      );
      router.refresh();
    } else {
      setError(result.error.message);
      if (result.error.code === 'CONCURRENCY_CONFLICT') {
        toast.error('Conflito de edição simultânea. Recarregue a página.');
      } else {
        toast.error(result.error.message);
      }
    }
  }

  async function handleArchive() {
    if (!product) return false;
    const result = await archiveProductAction(product.id);
    if (result.success) {
      toast.success('Produto arquivado!');
      router.push('/dashboard/catalog');
      router.refresh();
      return true;
    } else {
      toast.error(result.error.message);
      return false;
    }
  }

  async function handleToggleSoldOut() {
    if (!product) return;
    const newSoldOut = !isSoldOut;
    setIsSoldOut(newSoldOut);
    const result = await setProductAvailabilityAction(product.id, { isSoldOut: newSoldOut });
    if (!result.success) {
      setIsSoldOut(!newSoldOut); // reverter
      toast.error(result.error.message);
    } else {
      toast.success(
        newSoldOut ? 'Produto marcado como esgotado.' : 'Produto disponível novamente.',
      );
      router.refresh();
    }
  }

  async function handleToggleAvailable() {
    if (!product) return;
    const newAvailable = !isAvailableOptimistic;
    setIsAvailableOptimistic(newAvailable);
    const result = await setProductAvailabilityAction(product.id, { isAvailable: newAvailable });
    if (!result.success) {
      setIsAvailableOptimistic(!newAvailable); // reverter
      toast.error(result.error.message);
    } else {
      toast.success(
        newAvailable ? 'Produto marcado como disponível.' : 'Produto marcado como indisponível.',
      );
      router.refresh();
    }
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <FormMessage
        message={error}
        action={
          isConcurrencyError ? (
            <Button type="button" variant="outline" size="sm" onClick={() => router.refresh()}>
              Recarregar
            </Button>
          ) : undefined
        }
      />

      {/* Versão para controle de concorrência otimista */}
      {isEditing && <input type="hidden" name="version" value={product.version} />}

      {/* Status rápido — disponível fora do form para ATTENDANT */}
      {isEditing && (
        <div className="border-border bg-surface-secondary flex flex-wrap gap-2 rounded-lg border p-3">
          <button
            type="button"
            onClick={handleToggleAvailable}
            className={`flex min-h-11 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              isAvailableOptimistic
                ? 'bg-success text-white'
                : 'bg-surface text-text-secondary border-border hover:bg-surface-secondary border'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${isAvailableOptimistic ? 'bg-white' : 'bg-text-tertiary'}`}
            />
            {isAvailableOptimistic ? 'Disponível' : 'Indisponível'}
          </button>
          <button
            type="button"
            onClick={handleToggleSoldOut}
            className={`flex min-h-11 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              isSoldOut
                ? 'bg-warning text-white'
                : 'bg-surface text-text-secondary border-border hover:bg-surface-secondary border'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${isSoldOut ? 'bg-white' : 'bg-text-tertiary'}`}
            />
            {isSoldOut ? 'Esgotado' : 'Em estoque'}
          </button>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="categoryId">Categoria</Label>
        <select
          id="categoryId"
          name="categoryId"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          required
          className="border-border bg-surface text-text-primary focus-visible:ring-brand-500 flex h-11 w-full rounded-lg border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <option value="">Selecione...</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="name">Nome</Label>
        <Input
          id="name"
          name="name"
          defaultValue={product?.name ?? ''}
          required
          placeholder="Ex: X-Burguer Clássico"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descrição</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={product?.description ?? ''}
          rows={2}
          placeholder="Ingredientes, detalhes..."
        />
      </div>

      <input type="hidden" name="sortOrder" value={product?.sortOrder ?? 0} />
      <div className="max-w-xs space-y-2">
        <Label htmlFor="basePrice">Preço</Label>
        <PriceInput
          id="basePrice"
          name="basePrice"
          defaultPrice={(product?.basePrice ?? 0) / 100}
          required
        />
      </div>

      <div className="space-y-3">
        <div className="border-border flex items-center justify-between rounded-lg border p-3">
          <div className="space-y-0.5">
            <Label htmlFor="isAvailable">Visível no cardápio</Label>
            <p className="text-text-secondary text-xs">
              Quando desativado, o produto fica oculto para clientes
            </p>
          </div>
          <input type="hidden" name="isAvailable" value="false" />
          <Switch
            id="isAvailable"
            name="isAvailable"
            checked={isAvailableOptimistic}
            onCheckedChange={setIsAvailableOptimistic}
            value="true"
          />
        </div>
        <div className="border-border flex items-center justify-between rounded-lg border p-3">
          <div className="space-y-0.5">
            <Label htmlFor="isFeatured">Destaque</Label>
            <p className="text-text-secondary text-xs">
              Produtos em destaque aparecem no topo do cardápio
            </p>
          </div>
          <input type="hidden" name="isFeatured" value="false" />
          <Switch
            id="isFeatured"
            name="isFeatured"
            defaultChecked={product?.isFeatured ?? false}
            value="true"
          />
        </div>
        <div className="border-border flex items-center justify-between rounded-lg border p-3">
          <div className="space-y-0.5">
            <Label htmlFor="allowNotes">Aceita observações</Label>
            <p className="text-text-secondary text-xs">
              O cliente pode escrever uma observação para este item
            </p>
          </div>
          <input type="hidden" name="allowNotes" value="false" />
          <Switch
            id="allowNotes"
            name="allowNotes"
            defaultChecked={product?.allowNotes ?? true}
            value="true"
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-4">
        {isEditing ? (
          <ConfirmDialog
            title={`Arquivar "${product.name}"?`}
            description="O produto ficará oculto do cardápio. Os adicionais não serão excluídos e você poderá restaurar depois."
            confirmLabel="Arquivar produto"
            destructive
            onConfirm={handleArchive}
            trigger={
              <Button
                type="button"
                variant="ghost"
                className="text-error hover:bg-error-light hover:text-error"
              >
                Arquivar
              </Button>
            }
          />
        ) : (
          <div />
        )}
        <FormSubmitButton>{isEditing ? 'Salvar produto' : 'Criar produto'}</FormSubmitButton>
      </div>
    </form>
  );
}
