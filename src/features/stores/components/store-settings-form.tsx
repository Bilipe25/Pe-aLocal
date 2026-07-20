'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { updateStoreSettingsAction } from '@/features/stores/actions';
import { PriceInput } from '@/components/shared/price-input';
import { FormMessage } from '@/components/shared/form-message';
import { FormSubmitButton } from '@/components/shared/form-submit-button';
import { useState } from 'react';

interface StoreSettingsFormProps {
  storeId: string;
  expectedConfigurationVersion: number;
  readOnly?: boolean;
  settings: {
    minOrderValue: number;
    estimatedTime: string;
    deliveryEnabled: boolean;
    pickupEnabled: boolean;
    acceptsPix: boolean;
    acceptsCash: boolean;
    acceptsCardOnDelivery: boolean;
  } | null;
}

export function StoreSettingsForm({
  storeId,
  expectedConfigurationVersion,
  settings,
  readOnly = false,
}: StoreSettingsFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [configurationVersion, setConfigurationVersion] = useState(expectedConfigurationVersion);

  async function handleSubmit(formData: FormData) {
    setError(null);
    const result = await updateStoreSettingsAction(storeId, configurationVersion, formData);
    if (result.success) {
      setConfigurationVersion(result.data.configurationVersion);
      toast.success('Configurações atualizadas!');
      router.refresh();
    } else {
      setError(result.error.message);
      toast.error(result.error.message);
    }
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      <FormMessage message={error} />
      <fieldset disabled={readOnly} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="minOrderValue">Pedido mínimo</Label>
            <PriceInput
              id="minOrderValue"
              name="minOrderValue"
              defaultPrice={(settings?.minOrderValue ?? 0) / 100}
            />
            <p className="text-text-secondary text-sm">
              Valor mínimo do carrinho antes da entrega ou retirada.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="estimatedTime">Tempo estimado</Label>
            <Input
              id="estimatedTime"
              name="estimatedTime"
              defaultValue={settings?.estimatedTime ?? '30-50 min'}
              placeholder="30-50 min"
            />
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-text-primary font-semibold">Modalidades</h2>
          <div className="border-border flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="deliveryEnabled">Entrega habilitada</Label>
            <input type="hidden" name="deliveryEnabled" value="false" />
            <Switch
              id="deliveryEnabled"
              name="deliveryEnabled"
              defaultChecked={settings?.deliveryEnabled ?? true}
              value="true"
            />
          </div>
          <div className="border-border flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="pickupEnabled">Retirada habilitada</Label>
            <input type="hidden" name="pickupEnabled" value="false" />
            <Switch
              id="pickupEnabled"
              name="pickupEnabled"
              defaultChecked={settings?.pickupEnabled ?? true}
              value="true"
            />
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-text-primary font-semibold">Formas de pagamento</h2>
          <div className="border-border flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="acceptsPix">Aceita Pix</Label>
            <input type="hidden" name="acceptsPix" value="false" />
            <Switch
              id="acceptsPix"
              name="acceptsPix"
              defaultChecked={settings?.acceptsPix ?? true}
              value="true"
            />
          </div>
          <div className="border-border flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="acceptsCash">Aceita dinheiro</Label>
            <input type="hidden" name="acceptsCash" value="false" />
            <Switch
              id="acceptsCash"
              name="acceptsCash"
              defaultChecked={settings?.acceptsCash ?? true}
              value="true"
            />
          </div>
          <div className="border-border flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="acceptsCardOnDelivery">Aceita cartão na entrega</Label>
            <input type="hidden" name="acceptsCardOnDelivery" value="false" />
            <Switch
              id="acceptsCardOnDelivery"
              name="acceptsCardOnDelivery"
              defaultChecked={settings?.acceptsCardOnDelivery ?? true}
              value="true"
            />
          </div>
        </div>
      </fieldset>

      {!readOnly && (
        <div className="flex justify-end pt-2">
          <FormSubmitButton>Salvar configurações</FormSubmitButton>
        </div>
      )}
    </form>
  );
}
