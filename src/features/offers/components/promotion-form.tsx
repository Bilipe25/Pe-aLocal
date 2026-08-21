'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { FormMessage } from '@/components/shared/form-message';
import { FormSubmitButton } from '@/components/shared/form-submit-button';
import { PriceInput } from '@/components/shared/price-input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  createProductPromotionAction,
  updateProductPromotionAction,
} from '@/features/offers/actions';
import type { OfferEditorProduct } from '@/features/offers/components/combo-form';
import {
  OfferScheduleFields,
  type OfferScheduleInitialValue,
} from '@/features/offers/components/offer-schedule-fields';
import { formatCurrency } from '@/lib/utils';

export interface PromotionEditorData extends OfferScheduleInitialValue {
  id: string;
  version: number;
  productId: string;
  promotionalPrice: number;
  isActive: boolean;
}

export function PromotionForm({
  products,
  promotion,
}: {
  products: OfferEditorProduct[];
  promotion?: PromotionEditorData;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [productId, setProductId] = useState(promotion?.productId ?? '');
  const [promotionalPrice, setPromotionalPrice] = useState(promotion?.promotionalPrice ?? 0);
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const selectedProduct = productById.get(productId);
  const savings = Math.max(0, (selectedProduct?.basePrice ?? 0) - promotionalPrice);

  async function handleSubmit(formData: FormData) {
    setError(null);
    const result = promotion
      ? await updateProductPromotionAction(promotion.id, promotion.version, formData)
      : await createProductPromotionAction(formData);
    if (!result.success) {
      setError(result.error.message);
      toast.error(result.error.message);
      return;
    }
    toast.success(promotion ? 'Promoção atualizada.' : 'Promoção publicada.');
    router.push('/dashboard/offers');
    router.refresh();
  }

  return (
    <form action={handleSubmit} className="space-y-7">
      <FormMessage message={error} />
      <section className="border-border bg-surface rounded-xl border p-4 sm:p-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-5">
            <div>
              <h2 className="text-text-primary text-lg font-semibold">Produto e preço</h2>
              <p className="text-text-secondary mt-1 text-sm">A promoção reduz somente o preço-base; adicionais não mudam.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="promotion-product">Produto</Label>
              <select
                id="promotion-product"
                name="productId"
                required
                value={productId}
                onChange={(event) => setProductId(event.target.value)}
                className="border-border bg-surface text-text-primary focus-visible:ring-brand-500 h-11 w-full rounded-lg border px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                <option value="">Selecione um produto</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} · {formatCurrency(product.basePrice)}
                    {!product.isAvailable || product.isSoldOut ? ' · indisponível' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="promotion-price">Preço promocional</Label>
              <PriceInput
                id="promotion-price"
                name="promotionalPrice"
                required
                defaultPrice={(promotion?.promotionalPrice ?? 0) / 100}
                onChange={(event) => setPromotionalPrice(Math.round((Number(event.target.value) || 0) * 100))}
              />
            </div>
          </div>
          <dl className="bg-surface-secondary h-fit space-y-3 rounded-xl p-4 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-text-secondary">Preço atual</dt><dd className="text-text-primary font-semibold">{formatCurrency(selectedProduct?.basePrice ?? 0)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-text-secondary">Preço promocional</dt><dd className="text-text-primary font-semibold">{formatCurrency(promotionalPrice)}</dd></div>
            <div className="border-border flex justify-between gap-4 border-t pt-3"><dt className="text-text-primary font-medium">Economia</dt><dd className="text-success font-bold">{formatCurrency(savings)}</dd></div>
          </dl>
        </div>
        <div className="mt-7">
          <OfferScheduleFields prefix="promotion" initialValue={promotion} />
        </div>
      </section>

      <div className="border-border bg-surface flex min-h-16 items-center justify-between gap-4 rounded-xl border px-4">
        <div>
          <Label htmlFor="promotion-active">Promoção ativa</Label>
          <p className="text-text-secondary mt-1 text-sm">Aparece somente quando preço, produto e agenda forem válidos.</p>
        </div>
        <input type="hidden" name="isActive" value="false" />
        <Switch id="promotion-active" name="isActive" defaultChecked={promotion?.isActive ?? true} value="true" />
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={() => router.push('/dashboard/offers')}>Cancelar</Button>
        <FormSubmitButton pendingLabel={promotion ? 'Salvando promoção…' : 'Publicando promoção…'}>
          {promotion ? 'Salvar alterações' : 'Publicar promoção'}
        </FormSubmitButton>
      </div>
    </form>
  );
}
