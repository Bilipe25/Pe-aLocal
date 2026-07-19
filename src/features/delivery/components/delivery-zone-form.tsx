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
import { createDeliveryZoneAction, updateDeliveryZoneAction } from '@/features/delivery/actions';

export interface DeliveryZoneData {
  id: string;
  name: string;
  fee: number;
  minOrderValue: number | null;
  estimatedTime: string | null;
  isActive: boolean;
  sortOrder: number;
}

interface DeliveryZoneFormProps {
  zone?: DeliveryZoneData;
  onCancel?: () => void;
  onSaved?: () => void;
}

export function DeliveryZoneForm({ zone, onCancel, onSaved }: DeliveryZoneFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const prefix = zone ? `delivery-${zone.id}` : 'delivery-new';

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
          <PriceInput id={`${prefix}-fee`} name="fee" defaultPrice={(zone?.fee ?? 0) / 100} required />
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

      <div className="flex min-h-14 items-center justify-between rounded-lg border border-border px-3">
        <div>
          <Label htmlFor={`${prefix}-active`}>Zona ativa</Label>
          <p className="text-sm text-text-secondary">Disponível como destino no checkout.</p>
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
