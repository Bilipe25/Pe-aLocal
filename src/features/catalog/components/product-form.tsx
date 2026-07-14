'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { createProductAction, updateProductAction, deleteProductAction } from '@/features/catalog/actions';

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

  async function handleSubmit(formData: FormData) {
    const result = isEditing
      ? await updateProductAction(product.id, formData)
      : await createProductAction(formData);

    if (result.success) {
      toast.success(isEditing ? 'Produto atualizado!' : 'Produto criado!');
      router.push('/dashboard/catalog');
      router.refresh();
    } else {
      toast.error(result.error.message);
    }
  }

  async function handleDelete() {
    if (!product || !confirm('Tem certeza que deseja excluir este produto?')) return;
    const result = await deleteProductAction(product.id);
    if (result.success) {
      toast.success('Produto excluído!');
      router.push('/dashboard/catalog');
      router.refresh();
    } else {
      toast.error(result.error.message);
    }
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="categoryId">Categoria</Label>
        <select
          id="categoryId"
          name="categoryId"
          defaultValue={product?.categoryId ?? ''}
          required
          className="flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="basePrice">Preço (R$)</Label>
          <Input id="basePrice" name="basePrice" type="number" step="0.01" min="0" defaultValue={product ? (product.basePrice / 100).toFixed(2) : ''} required placeholder="24.90" />
          <p className="text-xs text-text-tertiary">Valor em reais. Ex: 24.90</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="sortOrder">Ordem</Label>
          <Input id="sortOrder" name="sortOrder" type="number" defaultValue={product?.sortOrder ?? 0} min={0} />
        </div>
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
          <Button type="button" variant="outline" onClick={handleDelete} className="text-error hover:bg-error-light">
            Excluir
          </Button>
        ) : (
          <div />
        )}
        <Button type="submit">{isEditing ? 'Salvar' : 'Criar produto'}</Button>
      </div>
    </form>
  );
}
