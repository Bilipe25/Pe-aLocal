'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { FieldMessage, FormMessage } from '@/components/shared/form-message';
import { FormSubmitButton } from '@/components/shared/form-submit-button';
import { PriceInput } from '@/components/shared/price-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { MAX_DELIVERY_MONEY_REAIS } from '@/domain/delivery/constants';
import { createDeliveryZoneAction, updateDeliveryZoneAction } from '@/features/delivery/actions';
import { fieldErrorsFromDetails } from '@/lib/form-errors';

export interface DeliveryZoneData {
  id: string;
  name: string;
  fee: number;
  minOrderValue: number | null;
  estimatedTime: string | null;
  isActive: boolean;
  sortOrder: number;
  updatedAt: string;
  postalRanges: Array<{
    id: string;
    postalCodeStart: string;
    postalCodeEnd: string;
  }>;
}

interface DeliveryZoneFormProps {
  zone?: DeliveryZoneData;
  defaultSortOrder?: number;
  onCancel?: () => void;
  onSaved?: () => void;
}

interface EditablePostalRange {
  id: string;
  clientKey: string;
  postalCodeStart: string;
  postalCodeEnd: string;
}

export function DeliveryZoneForm({
  zone,
  defaultSortOrder = 0,
  onCancel,
  onSaved,
}: DeliveryZoneFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const initialRangeKey = useId();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [postalRanges, setPostalRanges] = useState<EditablePostalRange[]>(
    zone?.postalRanges.length
      ? zone.postalRanges.map((range) => ({ ...range, clientKey: range.id }))
      : [
          {
            id: '',
            clientKey: initialRangeKey,
            postalCodeStart: '',
            postalCodeEnd: '',
          },
        ],
  );
  const prefix = zone ? `delivery-${zone.id}` : 'delivery-new';

  function formatPostalCode(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 8);
    return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
  }

  function focusFirstInvalidField() {
    requestAnimationFrame(() => {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]:not([disabled])')?.focus();
    });
  }

  async function handleSubmit(formData: FormData) {
    setError(null);
    setFieldErrors({});
    const result = zone
      ? await updateDeliveryZoneAction(zone.id, formData)
      : await createDeliveryZoneAction(formData);

    if (!result.success) {
      const nextFieldErrors = fieldErrorsFromDetails(result.error.details);
      setError(result.error.message);
      setFieldErrors(nextFieldErrors);
      toast.error(result.error.message);
      if (result.error.code === 'CONCURRENCY_CONFLICT') router.refresh();
      focusFirstInvalidField();
      return;
    }

    toast.success(zone ? 'Região de entrega atualizada.' : 'Região de entrega criada.');
    onSaved?.();
    router.refresh();
  }

  return (
    <form ref={formRef} action={handleSubmit} className="space-y-5">
      {zone ? <input type="hidden" name="expectedUpdatedAt" value={zone.updatedAt} /> : null}
      <input type="hidden" name="sortOrder" value={zone?.sortOrder ?? defaultSortOrder} />

      <FormMessage message={error} fieldErrors={fieldErrors} />

      <section aria-labelledby={`${prefix}-commercial-heading`} className="space-y-4">
        <div>
          <h3 id={`${prefix}-commercial-heading`} className="text-text-primary font-semibold">
            Regras comerciais
          </h3>
          <p className="text-text-secondary mt-1 text-sm">
            Estes valores serão recalculados no servidor antes da confirmação do pedido.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor={`${prefix}-name`}>Bairro ou região</Label>
            <Input
              id={`${prefix}-name`}
              name="name"
              required
              maxLength={80}
              defaultValue={zone?.name ?? ''}
              placeholder="Ex.: Centro, até 3 km"
              aria-invalid={Boolean(fieldErrors.name)}
              aria-describedby={fieldErrors.name ? `${prefix}-name-error` : undefined}
            />
            <FieldMessage id={`${prefix}-name-error`} errors={fieldErrors.name} />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${prefix}-fee`}>Taxa de entrega</Label>
            <PriceInput
              id={`${prefix}-fee`}
              name="fee"
              defaultPrice={(zone?.fee ?? 0) / 100}
              required
              max={MAX_DELIVERY_MONEY_REAIS}
              aria-invalid={Boolean(fieldErrors.fee)}
              aria-describedby={fieldErrors.fee ? `${prefix}-fee-error` : undefined}
            />
            <FieldMessage id={`${prefix}-fee-error`} errors={fieldErrors.fee} />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${prefix}-minimum`}>Pedido mínimo da região</Label>
            <PriceInput
              id={`${prefix}-minimum`}
              name="minOrderValue"
              defaultPrice={zone?.minOrderValue == null ? null : zone.minOrderValue / 100}
              max={MAX_DELIVERY_MONEY_REAIS}
              placeholder="Opcional"
              aria-invalid={Boolean(fieldErrors.minOrderValue)}
              aria-describedby={
                fieldErrors.minOrderValue
                  ? `${prefix}-minimum-help ${prefix}-minimum-error`
                  : `${prefix}-minimum-help`
              }
            />
            <p id={`${prefix}-minimum-help`} className="text-text-secondary text-xs">
              Em branco, usa o mínimo geral da loja.
            </p>
            <FieldMessage id={`${prefix}-minimum-error`} errors={fieldErrors.minOrderValue} />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor={`${prefix}-time`}>Prazo estimado</Label>
            <Input
              id={`${prefix}-time`}
              name="estimatedTime"
              maxLength={30}
              defaultValue={zone?.estimatedTime ?? ''}
              placeholder="Ex.: 30–40 min"
              aria-invalid={Boolean(fieldErrors.estimatedTime)}
              aria-describedby={
                fieldErrors.estimatedTime
                  ? `${prefix}-time-help ${prefix}-time-error`
                  : `${prefix}-time-help`
              }
            />
            <p id={`${prefix}-time-help`} className="text-text-secondary text-xs">
              Em branco, usa o prazo geral configurado em Minha loja.
            </p>
            <FieldMessage id={`${prefix}-time-error`} errors={fieldErrors.estimatedTime} />
          </div>
        </div>
      </section>

      <fieldset className="border-border space-y-3 rounded-xl border p-3 sm:p-4">
        <legend className="text-text-primary px-1 text-sm font-semibold">
          Faixas de CEP atendidas
        </legend>
        <p className="text-text-secondary text-sm text-pretty">
          O checkout cruza o CEP informado com estas faixas. Intervalos da mesma loja não podem se
          sobrepor.
        </p>

        {postalRanges.map((range, index) => {
          const startError = fieldErrors[`postalRanges.${index}.postalCodeStart`];
          const endError = fieldErrors[`postalRanges.${index}.postalCodeEnd`];
          return (
            <div
              key={range.clientKey}
              className="border-border grid items-end gap-3 border-t pt-3 first:border-t-0 first:pt-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.75rem]"
            >
              <div className="space-y-2">
                <Label htmlFor={`${prefix}-postal-start-${index}`}>CEP inicial</Label>
                <Input
                  id={`${prefix}-postal-start-${index}`}
                  name="postalCodeStart"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  maxLength={9}
                  required
                  value={formatPostalCode(range.postalCodeStart)}
                  aria-invalid={Boolean(startError)}
                  aria-describedby={
                    startError ? `${prefix}-postal-start-${index}-error` : undefined
                  }
                  onChange={(event) =>
                    setPostalRanges((current) =>
                      current.map((candidate, candidateIndex) =>
                        candidateIndex === index
                          ? {
                              ...candidate,
                              postalCodeStart: event.target.value.replace(/\D/g, '').slice(0, 8),
                            }
                          : candidate,
                      ),
                    )
                  }
                  placeholder="00000-000"
                />
                <FieldMessage id={`${prefix}-postal-start-${index}-error`} errors={startError} />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`${prefix}-postal-end-${index}`}>CEP final</Label>
                <Input
                  id={`${prefix}-postal-end-${index}`}
                  name="postalCodeEnd"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  maxLength={9}
                  required
                  value={formatPostalCode(range.postalCodeEnd)}
                  aria-invalid={Boolean(endError)}
                  aria-describedby={endError ? `${prefix}-postal-end-${index}-error` : undefined}
                  onChange={(event) =>
                    setPostalRanges((current) =>
                      current.map((candidate, candidateIndex) =>
                        candidateIndex === index
                          ? {
                              ...candidate,
                              postalCodeEnd: event.target.value.replace(/\D/g, '').slice(0, 8),
                            }
                          : candidate,
                      ),
                    )
                  }
                  placeholder="00000-000"
                />
                <FieldMessage id={`${prefix}-postal-end-${index}-error`} errors={endError} />
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-error hover:bg-error-light hover:text-error"
                aria-label={`Remover faixa ${index + 1}`}
                disabled={postalRanges.length === 1}
                onClick={() =>
                  setPostalRanges((current) =>
                    current.filter((_, candidateIndex) => candidateIndex !== index),
                  )
                }
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          );
        })}

        <FieldMessage id={`${prefix}-postal-ranges-error`} errors={fieldErrors.postalRanges} />
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            setPostalRanges((current) => [
              ...current,
              {
                id: '',
                clientKey: crypto.randomUUID(),
                postalCodeStart: '',
                postalCodeEnd: '',
              },
            ])
          }
          disabled={postalRanges.length >= 50}
        >
          <Plus aria-hidden="true" />
          Adicionar faixa
        </Button>
      </fieldset>

      <div className="border-border flex min-h-16 items-center justify-between gap-4 rounded-xl border px-3 py-2">
        <div className="min-w-0">
          <Label htmlFor={`${prefix}-active`}>Região ativa</Label>
          <p className="text-text-secondary text-sm text-pretty">
            Regiões inativas ficam salvas, mas não aparecem no checkout.
          </p>
        </div>
        <input type="hidden" name="isActive" value="false" />
        <Switch
          id={`${prefix}-active`}
          name="isActive"
          defaultChecked={zone?.isActive ?? true}
          value="true"
        />
      </div>

      <div className="border-border bg-surface sticky -bottom-4 -mx-4 flex flex-col-reverse gap-2 border-t px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:-bottom-5 sm:-mx-5 sm:flex-row sm:justify-end sm:px-5 sm:pb-5">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
        <FormSubmitButton pendingLabel={zone ? 'Salvando região…' : 'Adicionando região…'}>
          {zone ? 'Salvar alterações' : 'Adicionar região'}
        </FormSubmitButton>
      </div>
    </form>
  );
}
