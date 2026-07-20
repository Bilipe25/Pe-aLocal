'use client';

import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { updateStoreSettingsAction } from '@/features/stores/actions';
import { PriceInput } from '@/components/shared/price-input';
import { FieldMessage, FormMessage } from '@/components/shared/form-message';
import { FormActions } from '@/components/shared/form-actions';
import { useStoreForm } from '@/features/stores/use-store-form';

interface StoreSettingsFormProps {
  storeId: string;
  expectedConfigurationVersion: number;
  readOnly?: boolean;
  hasActiveDeliveryZone: boolean;
  settings: {
    minOrderValue: number;
    estimatedTime: string;
    estimatedTimeMinMinutes: number;
    estimatedTimeMaxMinutes: number;
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
  hasActiveDeliveryZone,
  readOnly = false,
}: StoreSettingsFormProps) {
  const {
    formRef,
    configurationVersion,
    formError,
    fieldErrors,
    isDirty,
    markDirty,
    handleResult,
    restore,
  } = useStoreForm(expectedConfigurationVersion);

  async function handleSubmit(formData: FormData) {
    const result = await updateStoreSettingsAction(storeId, configurationVersion, formData);
    handleResult(result, 'Configurações atualizadas!');
  }

  return (
    <form ref={formRef} action={handleSubmit} onChange={markDirty} className="space-y-6">
      <FormMessage message={formError} fieldErrors={fieldErrors} />
      <fieldset disabled={readOnly} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="minOrderValue">Pedido mínimo</Label>
            <PriceInput
              id="minOrderValue"
              name="minOrderValue"
              defaultPrice={(settings?.minOrderValue ?? 0) / 100}
              aria-invalid={Boolean(fieldErrors.minOrderValue)}
              aria-describedby={
                fieldErrors.minOrderValue
                  ? 'minOrderValue-error minOrderValue-help'
                  : 'minOrderValue-help'
              }
            />
            <p id="minOrderValue-help" className="text-text-secondary text-sm">
              Valor mínimo do carrinho antes da entrega ou retirada.
            </p>
            <FieldMessage id="minOrderValue-error" errors={fieldErrors.minOrderValue} />
          </div>
          <div className="space-y-2 sm:col-span-1">
            <p className="text-text-primary text-sm font-medium">Prazo estimado</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="estimatedTimeMinMinutes">Mínimo</Label>
                <Input
                  id="estimatedTimeMinMinutes"
                  name="estimatedTimeMinMinutes"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={1440}
                  defaultValue={settings?.estimatedTimeMinMinutes ?? 30}
                  aria-invalid={Boolean(fieldErrors.estimatedTimeMinMinutes)}
                  aria-describedby={
                    fieldErrors.estimatedTimeMinMinutes
                      ? 'estimatedTimeMinMinutes-error'
                      : undefined
                  }
                />
                <FieldMessage
                  id="estimatedTimeMinMinutes-error"
                  errors={fieldErrors.estimatedTimeMinMinutes}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="estimatedTimeMaxMinutes">Máximo</Label>
                <Input
                  id="estimatedTimeMaxMinutes"
                  name="estimatedTimeMaxMinutes"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={1440}
                  defaultValue={settings?.estimatedTimeMaxMinutes ?? 50}
                  aria-invalid={Boolean(fieldErrors.estimatedTimeMaxMinutes)}
                  aria-describedby={
                    fieldErrors.estimatedTimeMaxMinutes
                      ? 'estimatedTimeMaxMinutes-error'
                      : undefined
                  }
                />
                <FieldMessage
                  id="estimatedTimeMaxMinutes-error"
                  errors={fieldErrors.estimatedTimeMaxMinutes}
                />
              </div>
            </div>
            <p className="text-text-secondary text-sm">
              Em minutos. Exibido como intervalo ao cliente.
            </p>
          </div>
        </div>

        <fieldset className="space-y-4">
          <legend>
            <h2 className="text-text-primary font-semibold">Modalidades</h2>
          </legend>
          <div className="border-border flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="deliveryEnabled">Entrega habilitada</Label>
              <p className="text-text-secondary text-sm">
                Permite pedidos nas zonas de entrega ativas.
              </p>
            </div>
            <input type="hidden" name="deliveryEnabled" value="false" />
            <Switch
              id="deliveryEnabled"
              name="deliveryEnabled"
              defaultChecked={settings?.deliveryEnabled ?? true}
              value="true"
              aria-invalid={Boolean(fieldErrors.deliveryEnabled)}
              aria-describedby={fieldErrors.deliveryEnabled ? 'deliveryEnabled-error' : undefined}
            />
          </div>
          <div className="border-border flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="pickupEnabled">Retirada habilitada</Label>
              <p className="text-text-secondary text-sm">
                Permite ao cliente retirar o pedido na unidade.
              </p>
            </div>
            <input type="hidden" name="pickupEnabled" value="false" />
            <Switch
              id="pickupEnabled"
              name="pickupEnabled"
              defaultChecked={settings?.pickupEnabled ?? true}
              value="true"
            />
          </div>
          <FieldMessage id="deliveryEnabled-error" errors={fieldErrors.deliveryEnabled} />
          {!hasActiveDeliveryZone && (settings?.deliveryEnabled ?? true) && (
            <div className="bg-warning-light text-warning flex items-start gap-2 rounded-lg px-3 py-2 text-sm">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>
                A entrega precisa de ao menos uma zona ativa antes de a loja abrir.{' '}
                <Link
                  href="/dashboard/delivery"
                  className="font-semibold underline underline-offset-2"
                >
                  Configurar zonas de entrega
                </Link>
              </p>
            </div>
          )}
        </fieldset>

        <fieldset className="space-y-4">
          <legend>
            <h2 className="text-text-primary font-semibold">Formas de pagamento</h2>
          </legend>
          <div className="border-border flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="acceptsPix">Aceita Pix</Label>
            <input type="hidden" name="acceptsPix" value="false" />
            <Switch
              id="acceptsPix"
              name="acceptsPix"
              defaultChecked={settings?.acceptsPix ?? true}
              value="true"
              aria-invalid={Boolean(fieldErrors.acceptsPix)}
              aria-describedby={fieldErrors.acceptsPix ? 'acceptsPix-error' : undefined}
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
          <FieldMessage id="acceptsPix-error" errors={fieldErrors.acceptsPix} />
        </fieldset>
      </fieldset>

      {!readOnly && (
        <FormActions isDirty={isDirty} onRestore={restore} submitLabel="Salvar configurações" />
      )}
    </form>
  );
}
