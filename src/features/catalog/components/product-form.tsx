'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { createProductAction, updateProductAction, deleteProductAction } from '@/features/catalog/actions';
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
    allowNotes: boolean;
    sortOrder: number;
  };
}

export function ProductForm({ categories, product }: ProductFormProps) {
  const router = useRouter();
  const isEditing = !!product;
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setError(null);
    const result = isEditing
      ? await updateProductAction(product.id, formData)
      : await createProductAction(formData);

    if (result.success) {
      toast.success(isEditing ? 'Produto atualizado!' : 'Produto criado!');
      const createdProduct = typeof result.data === 'object' && result.data !== null && 'id' in result.data
        ? result.data
        : null;
      router.push(createdProduct ? `/dashboard/catalog/products/${createdProduct.id}/edit` : '/dashboard/catalog');
      router.refresh();
    } else {
      setError(result.error.message);
      toast.error(result.error.message);
    }
  }

  async function handleDelete() {
    if (!product) return false;
    const result = await deleteProductAction(product.id);
    if (result.success) {
      toast.success('Produto excluído!');
      router.push('/dashboard/catalog');
      router.refresh();
      return true;
    } else {
      toast.error(result.error.message);
      return false;
    }
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <FormMessage message={error} />
      <div className="space-y-2">
        <Label htmlFor="categoryId">Categoria</Label>
        <select
          id="categoryId"
          name="categoryId"
          defaultValue={product?.categoryId ?? ''}
          required
          className="flex h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          <option value="">Selecione...</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="name">Nome</Label>
        <Input id="name" name="name" defaultValue={product?.name ?? ''} required placeholder="Ex: X-Burguer Clássico" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descrição</Label>
        <Textarea id="description" name="description" defaultValue={product?.description ?? ''} rows={2} placeholder="Ingredientes, detalhes..." />
      </div>

      <input type="hidden" name="sortOrder" value={product?.sortOrder ?? 0} />
      <div className="max-w-xs space-y-2">
          <Label htmlFor="basePrice">Preço</Label>
          <PriceInput id="basePrice" name="basePrice" defaultPrice={(product?.basePrice ?? 0) / 100} required />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <Label htmlFor="isAvailable">Disponível</Label>
          <input type="hidden" name="isAvailable" value="false" />
          <Switch id="isAvailable" name="isAvailable" defaultChecked={product?.isAvailable ?? true} value="true" />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <Label htmlFor="isFeatured">Destaque</Label>
          <input type="hidden" name="isFeatured" value="false" />
          <Switch id="isFeatured" name="isFeatured" defaultChecked={product?.isFeatured ?? false} value="true" />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <Label htmlFor="allowNotes">Aceita observações</Label>
          <input type="hidden" name="allowNotes" value="false" />
          <Switch id="allowNotes" name="allowNotes" defaultChecked={product?.allowNotes ?? true} value="true" />
        </div>
      </div>

      <div className="flex items-center justify-between pt-4">
        {isEditing ? (
          <ConfirmDialog
            title={`Excluir “${product.name}”?`}
            description="O produto e seus adicionais deixarão de aparecer no cardápio. Pedidos anteriores não serão alterados."
            confirmLabel="Excluir produto"
            destructive
            onConfirm={handleDelete}
            trigger={<Button type="button" variant="ghost" className="text-error hover:bg-error-light hover:text-error">Excluir</Button>}
          />
        ) : (
          <div />
        )}
        <FormSubmitButton>{isEditing ? 'Salvar produto' : 'Criar produto'}</FormSubmitButton>
      </div>
    </form>
  );
}
