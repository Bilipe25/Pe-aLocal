'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Minus, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { FormMessage } from '@/components/shared/form-message';
import { FormSubmitButton } from '@/components/shared/form-submit-button';
import { PriceInput } from '@/components/shared/price-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { createComboAction, updateComboAction } from '@/features/offers/actions';
import {
  OfferScheduleFields,
  type OfferScheduleInitialValue,
} from '@/features/offers/components/offer-schedule-fields';
import { formatCurrency } from '@/lib/utils';

export interface OfferEditorProduct {
  id: string;
  name: string;
  basePrice: number;
  isAvailable: boolean;
  isSoldOut: boolean;
  categoryName: string;
}

export interface ComboEditorData extends OfferScheduleInitialValue {
  id: string;
  version: number;
  name: string;
  description: string | null;
  specialPrice: number;
  isActive: boolean;
  sortOrder: number;
  items: Array<{ productId: string; quantity: number }>;
}

interface ComponentDraft {
  key: string;
  productId: string;
  quantity: number;
}

function newComponent(productId = '', quantity = 1): ComponentDraft {
  return { key: crypto.randomUUID(), productId, quantity };
}

export function ComboForm({
  products,
  combo,
}: {
  products: OfferEditorProduct[];
  combo?: ComboEditorData;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [specialPrice, setSpecialPrice] = useState(combo?.specialPrice ?? 0);
  const [components, setComponents] = useState<ComponentDraft[]>(() =>
    combo?.items.length
      ? combo.items.map((item) => newComponent(item.productId, item.quantity))
      : [newComponent(), newComponent()],
  );
  const byId = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const regularPrice = components.reduce(
    (total, component) =>
      total + (byId.get(component.productId)?.basePrice ?? 0) * component.quantity,
    0,
  );
  const savings = Math.max(0, regularPrice - specialPrice);

  function updateComponent(key: string, patch: Partial<ComponentDraft>) {
    setComponents((current) =>
      current.map((component) => (component.key === key ? { ...component, ...patch } : component)),
    );
  }

  async function handleSubmit(formData: FormData) {
    setError(null);
    formData.set(
      'items',
      JSON.stringify(
        components.map(({ productId, quantity }) => ({ productId, quantity })),
      ),
    );
    const result = combo
      ? await updateComboAction(combo.id, combo.version, formData)
      : await createComboAction(formData);
    if (!result.success) {
      setError(result.error.message);
      toast.error(result.error.message);
      return;
    }
    toast.success(combo ? 'Combo atualizado.' : 'Combo publicado.');
    router.push('/dashboard/offers');
    router.refresh();
  }

  return (
    <form ref={formRef} action={handleSubmit} className="space-y-7">
      <FormMessage message={error} />
      <section className="border-border bg-surface space-y-5 rounded-xl border p-4 sm:p-6">
        <div>
          <h2 className="text-text-primary text-lg font-semibold">Identificação</h2>
          <p className="text-text-secondary mt-1 text-sm">Nome claro e composição reconhecível no cardápio.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="combo-name">Nome do combo</Label>
          <Input id="combo-name" name="name" required maxLength={120} defaultValue={combo?.name ?? ''} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="combo-description">Descrição</Label>
          <Textarea id="combo-description" name="description" maxLength={500} defaultValue={combo?.description ?? ''} rows={3} />
        </div>
      </section>

      <section className="border-border bg-surface space-y-5 rounded-xl border p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-text-primary text-lg font-semibold">Componentes</h2>
            <p className="text-text-secondary mt-1 text-sm">Produtos reais seguem para a Central e para a cozinha.</p>
          </div>
          <Button type="button" variant="outline" onClick={() => setComponents((current) => [...current, newComponent()])}>
            <Plus aria-hidden="true" /> Adicionar produto
          </Button>
        </div>
        <div className="space-y-3">
          {components.map((component, index) => {
            const selectedElsewhere = new Set(
              components.filter((candidate) => candidate.key !== component.key).map((candidate) => candidate.productId),
            );
            return (
              <div key={component.key} className="border-border grid gap-3 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto] sm:items-end">
                <div className="space-y-2">
                  <Label htmlFor={`combo-product-${component.key}`}>Produto {index + 1}</Label>
                  <select
                    id={`combo-product-${component.key}`}
                    required
                    value={component.productId}
                    onChange={(event) => updateComponent(component.key, { productId: event.target.value })}
                    className="border-border bg-surface text-text-primary focus-visible:ring-brand-500 h-11 w-full rounded-lg border px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                  >
                    <option value="">Selecione um produto</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id} disabled={selectedElsewhere.has(product.id)}>
                        {product.name} · {formatCurrency(product.basePrice)}
                        {!product.isAvailable || product.isSoldOut ? ' · indisponível' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`combo-quantity-${component.key}`}>Quantidade</Label>
                  <Input
                    id={`combo-quantity-${component.key}`}
                    type="number"
                    min={1}
                    max={999}
                    value={component.quantity}
                    onChange={(event) => updateComponent(component.key, { quantity: Math.max(1, Number(event.target.value) || 1) })}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={components.length <= 2}
                  onClick={() => setComponents((current) => current.filter((candidate) => candidate.key !== component.key))}
                  aria-label={`Remover produto ${index + 1}`}
                >
                  <Minus aria-hidden="true" />
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="border-border bg-surface rounded-xl border p-4 sm:p-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-5">
            <div>
              <h2 className="text-text-primary text-lg font-semibold">Preço</h2>
              <p className="text-text-secondary mt-1 text-sm">Adicionais continuam cobrados normalmente.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="combo-special-price">Preço especial</Label>
              <PriceInput
                id="combo-special-price"
                name="specialPrice"
                required
                defaultPrice={(combo?.specialPrice ?? 0) / 100}
                onChange={(event) => setSpecialPrice(Math.round((Number(event.target.value) || 0) * 100))}
              />
            </div>
            <input type="hidden" name="sortOrder" value={combo?.sortOrder ?? 0} />
          </div>
          <dl className="bg-surface-secondary space-y-3 rounded-xl p-4 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-text-secondary">Preço separado</dt><dd className="text-text-primary font-semibold">{formatCurrency(regularPrice)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-text-secondary">Preço especial</dt><dd className="text-text-primary font-semibold">{formatCurrency(specialPrice)}</dd></div>
            <div className="border-border flex justify-between gap-4 border-t pt-3"><dt className="text-text-primary font-medium">Economia</dt><dd className="text-success font-bold">{formatCurrency(savings)}</dd></div>
          </dl>
        </div>
        <div className="mt-7">
          <OfferScheduleFields prefix="combo" initialValue={combo} />
        </div>
      </section>

      <div className="border-border bg-surface flex min-h-16 items-center justify-between gap-4 rounded-xl border px-4">
        <div>
          <Label htmlFor="combo-active">Oferta ativa</Label>
          <p className="text-text-secondary mt-1 text-sm">A agenda e a economia ainda são validadas no checkout.</p>
        </div>
        <input type="hidden" name="isActive" value="false" />
        <Switch id="combo-active" name="isActive" defaultChecked={combo?.isActive ?? true} value="true" />
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={() => router.push('/dashboard/offers')}>Cancelar</Button>
        <FormSubmitButton pendingLabel={combo ? 'Salvando combo…' : 'Publicando combo…'}>
          {combo ? 'Salvar alterações' : 'Publicar combo'}
        </FormSubmitButton>
      </div>
    </form>
  );
}
