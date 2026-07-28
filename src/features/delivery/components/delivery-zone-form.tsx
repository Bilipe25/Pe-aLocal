'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { FormMessage } from '@/components/shared/form-message';
import { FormSubmitButton } from '@/components/shared/form-submit-button';
import { PriceInput } from '@/components/shared/price-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { createDeliveryZoneAction, updateDeliveryZoneAction } from '@/features/delivery/actions';

export interface DeliveryZoneData {
  id: string;
  name: string;
  fee: number;
  minOrderValue: number | null;
  estimatedTime: string | null;
  isActive: boolean;
  sortOrder: number;
  postalRanges: Array<{
    id: string;
    postalCodeStart: string;
    postalCodeEnd: string;
  }>;
}

interface DeliveryZoneFormProps {
  zone?: DeliveryZoneData;
  onCancel?: () => void;
  onSaved?: () => void;
}

interface EditablePostalRange {
  id: string;
  clientKey: string;
  postalCodeStart: string;
  postalCodeEnd: string;
}

export function DeliveryZoneForm({ zone, onCancel, onSaved }: DeliveryZoneFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const initialRangeKey = useId();
  const [error, setError] = useState<string | null>(null);
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

  async function handleSubmit(formData: FormData) {
    setError(null);
    const result = zone
      ? await updateDeliveryZoneAction(zone.id, formData)
      : await createDeliveryZoneAction(formData);

    if (!result.success) {
      setError(result.error.message);
      toast.error(result.error.message);
      return;
    }

    toast.success(zone ? 'Zona de entrega atualizada.' : 'Zona de entrega criada.');
    if (!zone) formRef.current?.reset();
    onSaved?.();
    router.refresh();
  }

  return (
    <form ref={formRef} action={handleSubmit} className="space-y-4">
      <FormMessage message={error} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor={`${prefix}-name`}>Bairro ou região</Label>
          <Input
            id={`${prefix}-name`}
            name="name"
            required
            defaultValue={zone?.name ?? ''}
            placeholder="Ex.: Centro, até 3 km"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${prefix}-fee`}>Taxa de entrega</Label>
          <PriceInput
            id={`${prefix}-fee`}
            name="fee"
            defaultPrice={(zone?.fee ?? 0) / 100}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${prefix}-minimum`}>Pedido mínimo da região</Label>
          <PriceInput
            id={`${prefix}-minimum`}
            name="minOrderValue"
            defaultPrice={(zone?.minOrderValue ?? 0) / 100}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${prefix}-time`}>Prazo estimado</Label>
          <Input
            id={`${prefix}-time`}
            name="estimatedTime"
            defaultValue={zone?.estimatedTime ?? ''}
            placeholder="Ex.: 30–40 min"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${prefix}-order`}>Ordem de exibição</Label>
          <Input
            id={`${prefix}-order`}
            name="sortOrder"
            type="number"
            min={0}
            defaultValue={zone?.sortOrder ?? 0}
          />
        </div>
      </div>

      <fieldset className="border-border space-y-3 rounded-lg border p-3">
        <legend className="text-text-primary px-1 text-sm font-semibold">
          Faixas de CEP atendidas
        </legend>
        <p className="text-text-secondary text-sm">
          O checkout usa estas faixas para determinar a zona, a taxa e o prazo sem confiar no
          navegador.
        </p>
        {postalRanges.map((range, index) => (
          <div
            key={range.clientKey}
            className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.75rem]"
          >
            {range.id ? <input type="hidden" name="postalRangeId" value={range.id} /> : null}
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
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
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
        ))}
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

      <div className="border-border flex min-h-14 items-center justify-between rounded-lg border px-3">
        <div>
          <Label htmlFor={`${prefix}-active`}>Zona ativa</Label>
          <p className="text-text-secondary text-sm">Disponível como destino no checkout.</p>
        </div>
        <input type="hidden" name="isActive" value="false" />
        <Switch
          id={`${prefix}-active`}
          name="isActive"
          defaultChecked={zone?.isActive ?? true}
          value="true"
        />
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <FormSubmitButton pendingLabel={zone ? 'Salvando zona…' : 'Adicionando zona…'}>
          {zone ? 'Salvar zona' : 'Adicionar zona'}
        </FormSubmitButton>
      </div>
    </form>
  );
}
