'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { createCategoryAction, updateCategoryAction, deleteCategoryAction } from '@/features/catalog/actions';
import { FormMessage } from '@/components/shared/form-message';
import { FormSubmitButton } from '@/components/shared/form-submit-button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useState } from 'react';

interface CategoryFormProps {
  category?: {
    id: string;
    name: string;
    description: string | null;
    sortOrder: number;
    isActive: boolean;
  };
}

export function CategoryForm({ category }: CategoryFormProps) {
  const router = useRouter();
  const isEditing = !!category;
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setError(null);
    const result = isEditing
      ? await updateCategoryAction(category.id, formData)
      : await createCategoryAction(formData);

    if (result.success) {
      toast.success(isEditing ? 'Categoria atualizada!' : 'Categoria criada!');
      router.push('/dashboard/catalog');
      router.refresh();
    } else {
      setError(result.error.message);
      toast.error(result.error.message);
    }
  }

  async function handleDelete() {
    if (!category) return false;

    const result = await deleteCategoryAction(category.id);
    if (result.success) {
      toast.success('Categoria excluída!');
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
        <Label htmlFor="name">Nome</Label>
        <Input id="name" name="name" defaultValue={category?.name ?? ''} required placeholder="Ex: Hambúrgueres" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descrição (opcional)</Label>
        <Textarea id="description" name="description" defaultValue={category?.description ?? ''} rows={2} />
      </div>

      <input type="hidden" name="sortOrder" value={category?.sortOrder ?? 0} />
      <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <Label htmlFor="isActive">Ativa</Label>
          <input type="hidden" name="isActive" value="false" />
          <Switch id="isActive" name="isActive" defaultChecked={category?.isActive ?? true} value="true" />
      </div>

      <div className="flex items-center justify-between pt-4">
        {isEditing ? (
          <ConfirmDialog
            title={`Excluir “${category.name}”?`}
            description="Os produtos e adicionais desta categoria também serão excluídos. Pedidos anteriores não serão alterados."
            confirmLabel="Excluir categoria"
            destructive
            onConfirm={handleDelete}
            trigger={<Button type="button" variant="ghost" className="text-error hover:bg-error-light hover:text-error">Excluir</Button>}
          />
        ) : (
          <div />
        )}
        <FormSubmitButton>{isEditing ? 'Salvar categoria' : 'Criar categoria'}</FormSubmitButton>
      </div>
    </form>
  );
}
