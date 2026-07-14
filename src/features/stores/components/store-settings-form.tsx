'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { updateStoreSettingsAction } from '@/features/stores/actions';

interface StoreSettingsFormProps {
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

export function StoreSettingsForm({ settings }: StoreSettingsFormProps) {
  const router = useRouter();

  async function handleSubmit(formData: FormData) {
    const result = await updateStoreSettingsAction(formData);
    if (result.success) {
      toast.success('Configurações atualizadas!');
      router.refresh();
    } else {
      toast.error(result.error.message);
    }
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="minOrderValue">Pedido mínimo (centavos)</Label>
          <Input id="minOrderValue" name="minOrderValue" type="number" defaultValue={settings?.minOrderValue ?? 0} min={0} />
          <p className="text-xs text-text-tertiary">Valor em centavos. Ex: 2000 = R$ 20,00</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="estimatedTime">Tempo estimado</Label>
          <Input id="estimatedTime" name="estimatedTime" defaultValue={settings?.estimatedTime ?? '30-50 min'} placeholder="30-50 min" />
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-semibold text-text-primary">Modalidades</h3>
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <Label htmlFor="deliveryEnabled">Entrega habilitada</Label>
          <input type="hidden" name="deliveryEnabled" value="false" />
          <Switch id="deliveryEnabled" name="deliveryEnabled" defaultChecked={settings?.deliveryEnabled ?? true} value="true" />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <Label htmlFor="pickupEnabled">Retirada habilitada</Label>
          <input type="hidden" name="pickupEnabled" value="false" />
          <Switch id="pickupEnabled" name="pickupEnabled" defaultChecked={settings?.pickupEnabled ?? true} value="true" />
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-semibold text-text-primary">Formas de Pagamento</h3>
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <Label htmlFor="acceptsPix">Aceita Pix</Label>
          <input type="hidden" name="acceptsPix" value="false" />
          <Switch id="acceptsPix" name="acceptsPix" defaultChecked={settings?.acceptsPix ?? true} value="true" />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <Label htmlFor="acceptsCash">Aceita Dinheiro</Label>
          <input type="hidden" name="acceptsCash" value="false" />
          <Switch id="acceptsCash" name="acceptsCash" defaultChecked={settings?.acceptsCash ?? true} value="true" />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border p-3">
          <Label htmlFor="acceptsCardOnDelivery">Aceita Cartão na Entrega</Label>
          <input type="hidden" name="acceptsCardOnDelivery" value="false" />
          <Switch id="acceptsCardOnDelivery" name="acceptsCardOnDelivery" defaultChecked={settings?.acceptsCardOnDelivery ?? true} value="true" />
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit">Salvar configurações</Button>
      </div>
    </form>
  );
}
