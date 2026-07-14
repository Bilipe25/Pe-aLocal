'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { createCategoryAction, updateCategoryAction, deleteCategoryAction } from '@/features/catalog/actions';

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

  async function handleSubmit(formData: FormData) {
    const result = isEditing
      ? await updateCategoryAction(category.id, formData)
      : await createCategoryAction(formData);

    if (result.success) {
      toast.success(isEditing ? 'Categoria atualizada!' : 'Categoria criada!');
      router.push('/dashboard/catalog');
      router.refresh();
    } else {
      toast.error(result.error.message);
    }
  }

  async function handleDelete() {
    if (!category || !confirm('Tem certeza que deseja excluir esta categoria? Os produtos serão excluídos também.')) return;

    const result = await deleteCategoryAction(category.id);
    if (result.success) {
      toast.success('Categoria excluída!');
      router.push('/dashboard/catalog');
      router.refresh();
    } else {
      toast.error(result.error.message);
    }
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Nome</Label>
        <Input id="name" name="name" defaultValue={category?.name ?? ''} required placeholder="Ex: Hambúrgueres" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descrição (opcional)</Label>
        <Textarea id="description" name="description" defaultValue={category?.description ?? ''} rows={2} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="sortOrder">Ordem de exibição</Label>
          <Input id="sortOrder" name="sortOrder" type="number" defaultValue={category?.sortOrder ?? 0} min={0} />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <Label htmlFor="isActive">Ativa</Label>
          <input type="hidden" name="isActive" value="false" />
          <Switch id="isActive" name="isActive" defaultChecked={category?.isActive ?? true} value="true" />
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
        <Button type="submit">{isEditing ? 'Salvar' : 'Criar categoria'}</Button>
      </div>
    </form>
  );
}
