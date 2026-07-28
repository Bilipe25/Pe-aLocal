'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { FormMessage } from '@/components/shared/form-message';
import { FormSubmitButton } from '@/components/shared/form-submit-button';
import { PriceInput } from '@/components/shared/price-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { createCouponAction, updateCouponAction } from '@/features/coupons/actions';

export interface CouponData {
  id: string;
  code: string;
  type: 'PERCENTAGE' | 'FIXED';
  value: number;
  minOrderValue: number | null;
  maxDiscount: number | null;
  maxUsages: number | null;
  usageCount: number;
  isActive: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CouponFormProps {
  coupon?: CouponData;
  onCancel?: () => void;
  onSaved?: () => void;
}

function localDateTime(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function normalizeDate(formData: FormData, field: 'startsAt' | 'expiresAt') {
  const value = formData.get(field);
  if (typeof value === 'string' && value) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) formData.set(field, date.toISOString());
  }
}

export function CouponForm({ coupon, onCancel, onSaved }: CouponFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [type, setType] = useState<CouponData['type']>(coupon?.type ?? 'PERCENTAGE');
  const [error, setError] = useState<string | null>(null);
  const prefix = coupon ? `coupon-${coupon.id}` : 'coupon-new';

  async function handleSubmit(formData: FormData) {
    setError(null);
    normalizeDate(formData, 'startsAt');
    normalizeDate(formData, 'expiresAt');
    const result = coupon
      ? await updateCouponAction(coupon.id, formData)
      : await createCouponAction(formData);

    if (!result.success) {
      setError(result.error.message);
      toast.error(result.error.message);
      return;
    }

    toast.success(coupon ? 'Cupom atualizado.' : 'Cupom criado.');
    if (!coupon) {
      formRef.current?.reset();
      setType('PERCENTAGE');
    }
    onSaved?.();
    router.refresh();
  }

  return (
    <form ref={formRef} action={handleSubmit} className="space-y-5">
      <FormMessage message={error} />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${prefix}-code`}>Código do cupom</Label>
          <Input
            id={`${prefix}-code`}
            name="code"
            required
            minLength={3}
            maxLength={32}
            autoCapitalize="characters"
            autoComplete="off"
            defaultValue={coupon?.code ?? ''}
            placeholder="BEMVINDO10"
            className="font-mono uppercase"
          />
          <p className="text-text-secondary text-sm">
            Letras sem acento, números, hífen ou sublinhado.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${prefix}-type`}>Tipo de desconto</Label>
          <select
            id={`${prefix}-type`}
            name="type"
            value={type}
            onChange={(event) => setType(event.target.value as CouponData['type'])}
            className="border-border bg-surface text-text-primary focus-visible:ring-brand-500 h-11 w-full rounded-lg border px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <option value="PERCENTAGE">Percentual</option>
            <option value="FIXED">Valor fixo</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${prefix}-value`}>
            {type === 'PERCENTAGE' ? 'Percentual de desconto' : 'Valor do desconto'}
          </Label>
          {type === 'PERCENTAGE' ? (
            <div className="relative">
              <Input
                id={`${prefix}-value`}
                name="value"
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                step={1}
                required
                defaultValue={coupon?.type === 'PERCENTAGE' ? coupon.value : 10}
                className="pr-10"
              />
              <span
                className="text-text-secondary pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm"
                aria-hidden="true"
              >
                %
              </span>
            </div>
          ) : (
            <PriceInput
              id={`${prefix}-value`}
              name="value"
              required
              defaultPrice={coupon?.type === 'FIXED' ? coupon.value / 100 : 5}
            />
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${prefix}-minimum`}>Pedido mínimo para usar</Label>
          <PriceInput
            id={`${prefix}-minimum`}
            name="minOrderValue"
            defaultPrice={(coupon?.minOrderValue ?? 0) / 100}
          />
        </div>

        {type === 'PERCENTAGE' ? (
          <div className="space-y-2">
            <Label htmlFor={`${prefix}-maximum`}>Desconto máximo</Label>
            <PriceInput
              id={`${prefix}-maximum`}
              name="maxDiscount"
              defaultPrice={(coupon?.maxDiscount ?? 0) / 100}
            />
            <p className="text-text-secondary text-sm">Use R$ 0,00 para não limitar.</p>
          </div>
        ) : (
          <input type="hidden" name="maxDiscount" value="" />
        )}

        <div className="space-y-2">
          <Label htmlFor={`${prefix}-uses`}>Limite total de usos</Label>
          <Input
            id={`${prefix}-uses`}
            name="maxUsages"
            type="number"
            inputMode="numeric"
            min={Math.max(1, coupon?.usageCount ?? 1)}
            step={1}
            defaultValue={coupon?.maxUsages ?? ''}
            placeholder="Sem limite"
          />
          {coupon && coupon.usageCount > 0 && (
            <p className="text-text-secondary text-sm">
              O cupom já foi usado {coupon.usageCount} {coupon.usageCount === 1 ? 'vez' : 'vezes'}.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${prefix}-starts`}>Início da validade</Label>
          <Input
            id={`${prefix}-starts`}
            name="startsAt"
            type="datetime-local"
            defaultValue={localDateTime(coupon?.startsAt)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${prefix}-expires`}>Fim da validade</Label>
          <Input
            id={`${prefix}-expires`}
            name="expiresAt"
            type="datetime-local"
            defaultValue={localDateTime(coupon?.expiresAt)}
          />
        </div>
      </div>

      <div className="border-border flex min-h-16 items-center justify-between gap-4 rounded-lg border px-3">
        <div>
          <Label htmlFor={`${prefix}-active`}>Cupom ativo</Label>
          <p className="text-text-secondary mt-1 text-sm">
            O checkout ainda respeita período, mínimo e limite de usos.
          </p>
        </div>
        <input type="hidden" name="isActive" value="false" />
        <Switch
          id={`${prefix}-active`}
          name="isActive"
          defaultChecked={coupon?.isActive ?? true}
          value="true"
        />
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <FormSubmitButton pendingLabel={coupon ? 'Salvando cupom…' : 'Criando cupom…'}>
          {coupon ? 'Salvar alterações' : 'Criar cupom'}
        </FormSubmitButton>
      </div>
    </form>
  );
}
