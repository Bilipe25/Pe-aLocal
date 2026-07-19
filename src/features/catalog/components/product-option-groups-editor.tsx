'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { FormMessage } from '@/components/shared/form-message';
import { FormSubmitButton } from '@/components/shared/form-submit-button';
import { PriceInput } from '@/components/shared/price-input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  createOptionAction,
  createOptionGroupAction,
  deleteOptionAction,
  deleteOptionGroupAction,
  updateOptionAction,
  updateOptionGroupAction,
} from '@/features/catalog/actions';
import { formatCurrency } from '@/lib/utils';
import { CatalogOrderControls } from './catalog-order-controls';

interface ProductOption {
  id: string;
  name: string;
  price: number;
  isAvailable: boolean;
  sortOrder: number;
}

interface ProductOptionGroup {
  id: string;
  title: string;
  description: string | null;
  isRequired: boolean;
  isMultiple: boolean;
  minSelections: number;
  maxSelections: number;
  sortOrder: number;
  isActive: boolean;
  options: ProductOption[];
}

interface GroupFormProps {
  productId: string;
  group?: ProductOptionGroup;
  onCancel: () => void;
  onSaved: () => void;
}

function GroupForm({ productId, group, onCancel, onSaved }: GroupFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [isMultiple, setIsMultiple] = useState(group?.isMultiple ?? false);
  const prefix = group ? `group-${group.id}` : 'group-new';

  async function handleSubmit(formData: FormData) {
    setError(null);
    const result = group
      ? await updateOptionGroupAction(group.id, formData)
      : await createOptionGroupAction(formData);
    if (!result.success) {
      setError(result.error.message);
      toast.error(result.error.message);
      return;
    }
    toast.success(group ? 'Grupo de adicionais atualizado.' : 'Grupo de adicionais criado.');
    onSaved();
  }

  return (
    <form action={handleSubmit} className="bg-surface-secondary space-y-4 rounded-xl p-4">
      <FormMessage message={error} />
      {!group && <input type="hidden" name="productId" value={productId} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`${prefix}-title`}>Nome do grupo</Label>
          <Input
            id={`${prefix}-title`}
            name="title"
            required
            defaultValue={group?.title ?? ''}
            placeholder="Ex.: Escolha o ponto da carne"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`${prefix}-description`}>Orientação para o cliente</Label>
          <Textarea
            id={`${prefix}-description`}
            name="description"
            rows={2}
            defaultValue={group?.description ?? ''}
            placeholder="Explique como escolher, se necessário."
          />
        </div>
        <input type="hidden" name="sortOrder" value={group?.sortOrder ?? 0} />
        {isMultiple ? (
          <>
            <div className="space-y-2">
              <Label htmlFor={`${prefix}-min`}>Escolhas mínimas</Label>
              <Input
                id={`${prefix}-min`}
                name="minSelections"
                type="number"
                min={0}
                defaultValue={group?.minSelections ?? 0}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${prefix}-max`}>Escolhas máximas</Label>
              <Input
                id={`${prefix}-max`}
                name="maxSelections"
                type="number"
                min={1}
                defaultValue={group?.maxSelections ?? 1}
              />
            </div>
          </>
        ) : (
          <p className="text-text-secondary text-sm sm:col-span-2">
            O cliente poderá selecionar somente uma opção deste grupo.
          </p>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { name: 'isRequired', label: 'Obrigatório', checked: group?.isRequired ?? false },
          { name: 'isActive', label: 'Grupo ativo', checked: group?.isActive ?? true },
        ].map((field) => (
          <div
            key={field.name}
            className="border-border bg-surface flex min-h-14 items-center justify-between gap-3 rounded-lg border px-3"
          >
            <Label htmlFor={`${prefix}-${field.name}`}>{field.label}</Label>
            <input type="hidden" name={field.name} value="false" />
            <Switch
              id={`${prefix}-${field.name}`}
              name={field.name}
              value="true"
              defaultChecked={field.checked}
            />
          </div>
        ))}
        <div className="border-border bg-surface flex min-h-14 items-center justify-between gap-3 rounded-lg border px-3">
          <Label htmlFor={`${prefix}-isMultiple`}>Permitir várias opções</Label>
          <input type="hidden" name="isMultiple" value="false" />
          <Switch
            id={`${prefix}-isMultiple`}
            name="isMultiple"
            value="true"
            checked={isMultiple}
            onCheckedChange={setIsMultiple}
          />
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <FormSubmitButton pendingLabel="Salvando grupo…">
          {group ? 'Salvar grupo' : 'Criar grupo'}
        </FormSubmitButton>
      </div>
    </form>
  );
}

interface OptionFormProps {
  groupId: string;
  option?: ProductOption;
  onCancel: () => void;
  onSaved: () => void;
}

function OptionForm({ groupId, option, onCancel, onSaved }: OptionFormProps) {
  const [error, setError] = useState<string | null>(null);
  const prefix = option ? `option-${option.id}` : `option-new-${groupId}`;

  async function handleSubmit(formData: FormData) {
    setError(null);
    const result = option
      ? await updateOptionAction(option.id, formData)
      : await createOptionAction(formData);
    if (!result.success) {
      setError(result.error.message);
      toast.error(result.error.message);
      return;
    }
    toast.success(option ? 'Adicional atualizado.' : 'Adicional criado.');
    onSaved();
  }

  return (
    <form
      action={handleSubmit}
      className="border-border bg-surface space-y-3 rounded-lg border p-3"
    >
      <FormMessage message={error} />
      {!option && <input type="hidden" name="groupId" value={groupId} />}
      <input type="hidden" name="sortOrder" value={option?.sortOrder ?? 0} />
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <div className="space-y-2">
          <Label htmlFor={`${prefix}-name`}>Nome do adicional</Label>
          <Input
            id={`${prefix}-name`}
            name="name"
            required
            defaultValue={option?.name ?? ''}
            placeholder="Ex.: Bacon extra"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${prefix}-price`}>Acréscimo</Label>
          <PriceInput
            id={`${prefix}-price`}
            name="price"
            defaultPrice={(option?.price ?? 0) / 100}
            required
          />
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="border-border flex min-h-14 items-center justify-between gap-4 rounded-lg border px-3 sm:min-w-52">
          <Label htmlFor={`${prefix}-available`}>Disponível</Label>
          <input type="hidden" name="isAvailable" value="false" />
          <Switch
            id={`${prefix}-available`}
            name="isAvailable"
            value="true"
            defaultChecked={option?.isAvailable ?? true}
          />
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <FormSubmitButton pendingLabel="Salvando adicional…">
            {option ? 'Salvar adicional' : 'Adicionar'}
          </FormSubmitButton>
        </div>
      </div>
    </form>
  );
}

export function ProductOptionGroupsEditor({
  productId,
  groups,
}: {
  productId: string;
  groups: ProductOptionGroup[];
}) {
  const router = useRouter();
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [addingOptionGroupId, setAddingOptionGroupId] = useState<string | null>(null);
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);

  function refreshAndClose() {
    setCreatingGroup(false);
    setEditingGroupId(null);
    setAddingOptionGroupId(null);
    setEditingOptionId(null);
    router.refresh();
  }

  async function deleteGroup(group: ProductOptionGroup) {
    const result = await deleteOptionGroupAction(group.id);
    if (!result.success) {
      toast.error(result.error.message);
      return false;
    }
    toast.success(`Grupo “${group.title}” excluído.`);
    router.refresh();
    return true;
  }

  async function deleteOption(option: ProductOption) {
    const result = await deleteOptionAction(option.id);
    if (!result.success) {
      toast.error(result.error.message);
      return false;
    }
    toast.success(`Adicional “${option.name}” excluído.`);
    router.refresh();
    return true;
  }

  return (
    <section
      className="border-border bg-surface mt-6 rounded-xl border p-4 sm:p-6"
      aria-labelledby="addons-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="addons-heading" className="text-text-primary text-xl font-semibold">
            Grupos de adicionais
          </h2>
          <p className="text-text-secondary mt-1 text-sm">
            Configure escolhas, complementos e acréscimos deste produto.
          </p>
        </div>
        {!creatingGroup && (
          <Button type="button" onClick={() => setCreatingGroup(true)}>
            <Plus aria-hidden="true" /> Novo grupo
          </Button>
        )}
      </div>

      {creatingGroup && (
        <div className="mt-5">
          <GroupForm
            productId={productId}
            onCancel={() => setCreatingGroup(false)}
            onSaved={refreshAndClose}
          />
        </div>
      )}

      {groups.length === 0 && !creatingGroup ? (
        <div className="border-border mt-5 rounded-xl border border-dashed px-4 py-8 text-center">
          <p className="text-text-primary font-medium">Nenhum grupo configurado</p>
          <p className="text-text-secondary mt-1 text-sm">
            Use grupos para tamanhos, sabores e complementos opcionais ou obrigatórios.
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {groups.map((group, groupIndex) => (
            <section key={group.id} className="border-border rounded-xl border">
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-text-primary font-semibold">{group.title}</h3>
                    {group.isRequired && <Badge variant="warning">Obrigatório</Badge>}
                    <Badge variant={group.isActive ? 'success' : 'secondary'}>
                      {group.isActive ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                  <p className="text-text-secondary mt-1 text-sm">
                    {group.isMultiple
                      ? `Escolha de ${group.minSelections} a ${group.maxSelections}`
                      : 'Escolha única'}{' '}
                    · {group.options.length} {group.options.length === 1 ? 'opção' : 'opções'}
                  </p>
                  {group.description && (
                    <p className="text-text-secondary mt-1 text-sm">{group.description}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <CatalogOrderControls
                    id={group.id}
                    kind="optionGroup"
                    label={`grupo ${group.title}`}
                    canMoveUp={groupIndex > 0}
                    canMoveDown={groupIndex < groups.length - 1}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditingGroupId(group.id)}
                  >
                    <Pencil aria-hidden="true" /> Editar grupo
                  </Button>
                  <ConfirmDialog
                    title={`Excluir “${group.title}”?`}
                    description="Todos os adicionais deste grupo também serão excluídos. Essa ação não altera pedidos já realizados."
                    confirmLabel="Excluir grupo"
                    destructive
                    onConfirm={() => deleteGroup(group)}
                    trigger={
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-error hover:bg-error-light hover:text-error"
                      >
                        <Trash2 aria-hidden="true" /> Excluir
                      </Button>
                    }
                  />
                </div>
              </div>

              {editingGroupId === group.id && (
                <div className="border-border border-t p-4">
                  <GroupForm
                    productId={productId}
                    group={group}
                    onCancel={() => setEditingGroupId(null)}
                    onSaved={refreshAndClose}
                  />
                </div>
              )}

              <div className="border-border border-t p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-text-primary text-sm font-semibold">Adicionais</h4>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setAddingOptionGroupId(group.id)}
                  >
                    <Plus aria-hidden="true" /> Adicionar opção
                  </Button>
                </div>
                {addingOptionGroupId === group.id && (
                  <div className="mt-3">
                    <OptionForm
                      groupId={group.id}
                      onCancel={() => setAddingOptionGroupId(null)}
                      onSaved={refreshAndClose}
                    />
                  </div>
                )}
                {group.options.length === 0 ? (
                  <p className="text-text-secondary mt-3 text-sm">
                    Adicione ao menos uma opção para este grupo aparecer no produto.
                  </p>
                ) : (
                  <div className="divide-border border-border mt-3 divide-y rounded-lg border">
                    {group.options.map((option, optionIndex) => (
                      <div key={option.id}>
                        <div className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center">
                          <div className="min-w-0 flex-1">
                            <p className="text-text-primary font-medium">{option.name}</p>
                            <p className="text-text-secondary text-sm">
                              {option.price ? `+ ${formatCurrency(option.price)}` : 'Sem acréscimo'}{' '}
                              · {option.isAvailable ? 'Disponível' : 'Indisponível'}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <CatalogOrderControls
                              id={option.id}
                              kind="option"
                              label={`adicional ${option.name}`}
                              canMoveUp={optionIndex > 0}
                              canMoveDown={optionIndex < group.options.length - 1}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => setEditingOptionId(option.id)}
                            >
                              <Pencil aria-hidden="true" /> Editar
                            </Button>
                            <ConfirmDialog
                              title={`Excluir “${option.name}”?`}
                              description="A opção deixará de aparecer neste produto. Pedidos anteriores não serão alterados."
                              confirmLabel="Excluir adicional"
                              destructive
                              onConfirm={() => deleteOption(option)}
                              trigger={
                                <Button
                                  type="button"
                                  variant="ghost"
                                  className="text-error hover:bg-error-light hover:text-error"
                                >
                                  <Trash2 aria-hidden="true" /> Excluir
                                </Button>
                              }
                            />
                          </div>
                        </div>
                        {editingOptionId === option.id && (
                          <div className="border-border border-t p-3">
                            <OptionForm
                              groupId={group.id}
                              option={option}
                              onCancel={() => setEditingOptionId(null)}
                              onSaved={refreshAndClose}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      <div className="border-border mt-6 flex justify-end border-t pt-4">
        <Button asChild variant="outline">
          <Link href="/dashboard/catalog">Concluir edição</Link>
        </Button>
      </div>
    </section>
  );
}
