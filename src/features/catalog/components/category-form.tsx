'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  createCategoryAction,
  updateCategoryAction,
  archiveCategoryAction,
} from '@/features/catalog/actions';
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
    version: number;
    archivedAt: Date | null;
  };
}

export function CategoryForm({ category }: CategoryFormProps) {
  const router = useRouter();
  const isEditing = !!category;
  const [error, setError] = useState<string | null>(null);
  const isConcurrencyError = error?.includes('foi alterado por outro usuário');

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
      if (result.error.code === 'CONCURRENCY_CONFLICT') {
        toast.error('Conflito de edição simultânea. Recarregue a página.');
      } else {
        toast.error(result.error.message);
      }
    }
  }

  async function handleArchive() {
    if (!category) return false;
    const result = await archiveCategoryAction(category.id);
    if (result.success) {
      toast.success('Categoria arquivada!');
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
      <FormMessage
        message={error}
        action={
          isConcurrencyError ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => router.refresh()}
            >
              Recarregar página
            </Button>
          ) : undefined
        }
      />

      {/* Versão para controle de concorrência otimista */}
      {isEditing && (
        <input type="hidden" name="version" value={category.version} />
      )}

      <div className="space-y-2">
        <Label htmlFor="name">Nome</Label>
        <Input
          id="name"
          name="name"
          defaultValue={category?.name ?? ''}
          required
          placeholder="Ex: Hambúrgueres"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descrição (opcional)</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={category?.description ?? ''}
          rows={2}
          placeholder="Breve descrição desta categoria"
        />
      </div>

      <input type="hidden" name="sortOrder" value={category?.sortOrder ?? 0} />
      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <div className="space-y-0.5">
          <Label htmlFor="isActive">Categoria ativa</Label>
          <p className="text-text-secondary text-xs">
            Categorias inativas não aparecem no cardápio público
          </p>
        </div>
        <input type="hidden" name="isActive" value="false" />
        <Switch
          id="isActive"
          name="isActive"
          defaultChecked={category?.isActive ?? true}
          value="true"
        />
      </div>

      <div className="flex items-center justify-between pt-4">
        {isEditing ? (
          <ConfirmDialog
            title={`Arquivar "${category.name}"?`}
            description="A categoria ficará oculta do cardápio. Os produtos não serão excluídos e você poderá restaurar depois."
            confirmLabel="Arquivar categoria"
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
        <FormSubmitButton>
          {isEditing ? 'Salvar categoria' : 'Criar categoria'}
        </FormSubmitButton>
      </div>
    </form>
  );
}
