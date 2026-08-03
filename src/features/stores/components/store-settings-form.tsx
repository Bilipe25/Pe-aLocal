'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ShoppingBag,
  Store,
  Truck,
  WalletCards,
} from 'lucide-react';
import { useState } from 'react';

import { FieldMessage, FormMessage } from '@/components/shared/form-message';
import { FormActions } from '@/components/shared/form-actions';
import { PriceInput } from '@/components/shared/price-input';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { updateStoreSettingsAction } from '@/features/stores/actions';
import { useStoreForm } from '@/features/stores/use-store-form';
import { formatCurrency } from '@/lib/utils';

interface PaymentSummary {
  acceptsPix: boolean;
  acceptsCash: boolean;
  acceptsCardOnDelivery: boolean;
  pixConfigured: boolean;
}

interface StoreSettingsFormProps {
  storeId: string;
  storeStatus: 'OPEN' | 'CLOSED' | 'PAUSED';
  expectedConfigurationVersion: number;
  readOnly?: boolean;
  hasActiveDeliveryZone: boolean;
  paymentsHref: string | null;
  paymentSummary: PaymentSummary;
  settings: {
    minOrderValue: number;
    estimatedTime: string;
    estimatedTimeMinMinutes: number;
    estimatedTimeMaxMinutes: number;
    deliveryEnabled: boolean;
    pickupEnabled: boolean;
  } | null;
}

function paymentLabels(summary: PaymentSummary) {
  return [
    summary.acceptsPix ? 'Pix' : null,
    summary.acceptsCash ? 'Dinheiro' : null,
    summary.acceptsCardOnDelivery ? 'Cartão no recebimento' : null,
  ].filter((label): label is string => Boolean(label));
}

export function StoreSettingsForm({
  storeId,
  storeStatus,
  expectedConfigurationVersion,
  settings,
  hasActiveDeliveryZone,
  paymentsHref,
  paymentSummary,
  readOnly = false,
}: StoreSettingsFormProps) {
  const initial = {
    deliveryEnabled: settings?.deliveryEnabled ?? true,
    pickupEnabled: settings?.pickupEnabled ?? true,
    minOrderValue: (settings?.minOrderValue ?? 0) / 100,
    estimatedTimeMinMinutes: settings?.estimatedTimeMinMinutes ?? 30,
    estimatedTimeMaxMinutes: settings?.estimatedTimeMaxMinutes ?? 50,
  };
  const [deliveryEnabled, setDeliveryEnabled] = useState(initial.deliveryEnabled);
  const [pickupEnabled, setPickupEnabled] = useState(initial.pickupEnabled);
  const [minOrderValue, setMinOrderValue] = useState(initial.minOrderValue);
  const [estimatedTimeMinMinutes, setEstimatedTimeMinMinutes] = useState(
    initial.estimatedTimeMinMinutes,
  );
  const [estimatedTimeMaxMinutes, setEstimatedTimeMaxMinutes] = useState(
    initial.estimatedTimeMaxMinutes,
  );
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

  const activePayments = paymentLabels(paymentSummary);
  const noFulfillment = !deliveryEnabled && !pickupEnabled;
  const deliveryNeedsCoverage = deliveryEnabled && !hasActiveDeliveryZone;
  const openStoreWithoutEffectiveFulfillment =
    storeStatus === 'OPEN' && deliveryNeedsCoverage && !pickupEnabled;
  const invalidEstimatedRange =
    estimatedTimeMinMinutes < 1 ||
    estimatedTimeMaxMinutes < 1 ||
    estimatedTimeMinMinutes > 1440 ||
    estimatedTimeMaxMinutes > 1440 ||
    estimatedTimeMaxMinutes < estimatedTimeMinMinutes;
  const estimatedRange = `${estimatedTimeMinMinutes || '—'}–${estimatedTimeMaxMinutes || '—'} min`;
  const fulfillmentLabel = [deliveryEnabled ? 'Entrega' : null, pickupEnabled ? 'Retirada' : null]
    .filter(Boolean)
    .join(' · ');

  async function handleSubmit(formData: FormData) {
    const result = await updateStoreSettingsAction(storeId, configurationVersion, formData);
    handleResult(result, 'Configurações operacionais atualizadas!');
  }

  function handleRestore() {
    restore();
    setDeliveryEnabled(initial.deliveryEnabled);
    setPickupEnabled(initial.pickupEnabled);
    setMinOrderValue(initial.minOrderValue);
    setEstimatedTimeMinMinutes(initial.estimatedTimeMinMinutes);
    setEstimatedTimeMaxMinutes(initial.estimatedTimeMaxMinutes);
  }

  function setDelivery(nextValue: boolean) {
    setDeliveryEnabled(nextValue);
    markDirty();
  }

  function setPickup(nextValue: boolean) {
    setPickupEnabled(nextValue);
    markDirty();
  }

  const summaryContent = (
    <dl className="divide-border divide-y text-sm">
      <div className="flex items-start justify-between gap-4 py-3 first:pt-0">
        <dt className="text-text-secondary">Modalidades</dt>
        <dd className="text-text-primary text-right font-medium">
          {fulfillmentLabel || 'Nenhuma selecionada'}
        </dd>
      </div>
      <div className="flex items-start justify-between gap-4 py-3">
        <dt className="text-text-secondary">Pedido mínimo</dt>
        <dd className="text-text-primary font-mono font-semibold">
          {minOrderValue > 0 ? formatCurrency(Math.round(minOrderValue * 100)) : 'Sem mínimo'}
        </dd>
      </div>
      <div className="flex items-start justify-between gap-4 py-3">
        <dt className="text-text-secondary">Prazo padrão</dt>
        <dd className="text-text-primary font-medium">{estimatedRange}</dd>
      </div>
      <div className="flex items-start justify-between gap-4 py-3 last:pb-0">
        <dt className="text-text-secondary">Pagamentos</dt>
        <dd className="text-text-primary max-w-44 text-right font-medium">
          {activePayments.length > 0 ? activePayments.join(' · ') : 'Nenhum ativo'}
        </dd>
      </div>
    </dl>
  );

  return (
    <form ref={formRef} action={handleSubmit} onChange={markDirty} className="space-y-5">
      <FormMessage message={formError} fieldErrors={fieldErrors} />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <fieldset disabled={readOnly} className="min-w-0 space-y-4">
          <section
            className="border-border bg-surface overflow-hidden rounded-xl border"
            aria-labelledby="fulfillment-settings-heading"
          >
            <header className="border-border bg-surface-secondary/40 flex items-start gap-3 border-b px-4 py-3.5 sm:px-5">
              <span className="bg-brand-50 text-brand-700 flex size-10 shrink-0 items-center justify-center rounded-lg">
                <Truck className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 id="fulfillment-settings-heading" className="text-text-primary font-semibold">
                  Como os pedidos são recebidos
                </h2>
                <p className="text-text-secondary mt-0.5 text-sm">
                  Escolha ao menos uma modalidade disponível no checkout.
                </p>
              </div>
            </header>

            <div className="divide-border divide-y px-4 sm:px-5">
              <div className="flex min-h-20 items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Label htmlFor="deliveryEnabled" className="text-sm font-semibold">
                      Entrega
                    </Label>
                    <Badge variant={deliveryEnabled ? 'success' : 'secondary'}>
                      {deliveryEnabled ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </div>
                  <p className="text-text-secondary mt-0.5 text-sm">
                    Disponível somente nas regiões ativas configuradas.
                  </p>
                </div>
                <input type="hidden" name="deliveryEnabled" value="false" />
                <Switch
                  id="deliveryEnabled"
                  name="deliveryEnabled"
                  checked={deliveryEnabled}
                  onCheckedChange={setDelivery}
                  value="true"
                  aria-invalid={Boolean(fieldErrors.deliveryEnabled) || noFulfillment}
                  aria-describedby={
                    fieldErrors.deliveryEnabled || noFulfillment
                      ? 'deliveryEnabled-error'
                      : undefined
                  }
                />
              </div>
              <div className="flex min-h-20 items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Label htmlFor="pickupEnabled" className="text-sm font-semibold">
                      Retirada na loja
                    </Label>
                    <Badge variant={pickupEnabled ? 'success' : 'secondary'}>
                      {pickupEnabled ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </div>
                  <p className="text-text-secondary mt-0.5 text-sm">
                    O cliente faz o pedido e retira diretamente na unidade.
                  </p>
                </div>
                <input type="hidden" name="pickupEnabled" value="false" />
                <Switch
                  id="pickupEnabled"
                  name="pickupEnabled"
                  checked={pickupEnabled}
                  onCheckedChange={setPickup}
                  value="true"
                />
              </div>
            </div>

            <div className="px-4 pb-4 sm:px-5">
              {noFulfillment ? (
                <div
                  id="deliveryEnabled-error"
                  className="border-error/25 bg-error-light text-error flex items-start gap-2 rounded-lg border px-3 py-2 text-sm"
                  role="alert"
                >
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  Mantenha entrega ou retirada habilitada.
                </div>
              ) : (
                <FieldMessage id="deliveryEnabled-error" errors={fieldErrors.deliveryEnabled} />
              )}

              {deliveryNeedsCoverage ? (
                <div
                  className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                    openStoreWithoutEffectiveFulfillment
                      ? 'border-error/25 bg-error-light text-error'
                      : 'border-warning/30 bg-warning-light text-warning'
                  }`}
                  role={openStoreWithoutEffectiveFulfillment ? 'alert' : 'status'}
                >
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <p>
                    {openStoreWithoutEffectiveFulfillment
                      ? 'A loja está aberta e ficaria sem uma modalidade utilizável. Cadastre uma região ou mantenha a retirada.'
                      : 'A entrega ficará oculta no checkout até existir uma região ativa.'}{' '}
                    <Link
                      href="/dashboard/delivery"
                      className="font-semibold underline underline-offset-2"
                    >
                      Configurar entrega
                    </Link>
                  </p>
                </div>
              ) : deliveryEnabled ? (
                <div className="text-success mt-3 flex items-center gap-2 text-sm font-medium">
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  Cobertura de entrega configurada.
                </div>
              ) : null}
            </div>
          </section>

          <section
            className="border-border bg-surface overflow-hidden rounded-xl border"
            aria-labelledby="order-rules-heading"
          >
            <header className="border-border bg-surface-secondary/40 flex items-start gap-3 border-b px-4 py-3.5 sm:px-5">
              <span className="bg-brand-50 text-brand-700 flex size-10 shrink-0 items-center justify-center rounded-lg">
                <ShoppingBag className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 id="order-rules-heading" className="text-text-primary font-semibold">
                  Regras do pedido
                </h2>
                <p className="text-text-secondary mt-0.5 text-sm">
                  Valores gerais usados no carrinho e no checkout.
                </p>
              </div>
            </header>

            <div className="grid gap-5 p-4 sm:grid-cols-2 sm:p-5">
              <div className="space-y-2">
                <Label htmlFor="minOrderValue">Pedido mínimo geral</Label>
                <PriceInput
                  id="minOrderValue"
                  name="minOrderValue"
                  defaultPrice={initial.minOrderValue}
                  onChange={(event) => setMinOrderValue(Number(event.target.value) || 0)}
                  aria-invalid={Boolean(fieldErrors.minOrderValue)}
                  aria-describedby={
                    fieldErrors.minOrderValue
                      ? 'minOrderValue-error minOrderValue-help'
                      : 'minOrderValue-help'
                  }
                />
                <p id="minOrderValue-help" className="text-text-secondary text-sm">
                  Aplica-se à retirada. Uma região de entrega pode exigir um valor maior.
                </p>
                <FieldMessage id="minOrderValue-error" errors={fieldErrors.minOrderValue} />
              </div>

              <div className="space-y-2">
                <p className="text-text-primary text-sm font-medium">Prazo padrão de preparo</p>
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
                      defaultValue={initial.estimatedTimeMinMinutes}
                      onChange={(event) =>
                        setEstimatedTimeMinMinutes(Number(event.target.value) || 0)
                      }
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
                      defaultValue={initial.estimatedTimeMaxMinutes}
                      onChange={(event) =>
                        setEstimatedTimeMaxMinutes(Number(event.target.value) || 0)
                      }
                      aria-invalid={Boolean(fieldErrors.estimatedTimeMaxMinutes)}
                      aria-describedby={
                        fieldErrors.estimatedTimeMaxMinutes
                          ? 'estimatedTimeMaxMinutes-error estimatedTime-help'
                          : 'estimatedTime-help'
                      }
                    />
                    <FieldMessage
                      id="estimatedTimeMaxMinutes-error"
                      errors={fieldErrors.estimatedTimeMaxMinutes}
                    />
                  </div>
                </div>
                <p id="estimatedTime-help" className="text-text-secondary text-sm">
                  Usado na retirada e como fallback quando a região não possui prazo próprio.
                </p>
                {invalidEstimatedRange ? (
                  <p className="text-error text-sm" role="alert">
                    Informe um intervalo entre 1 e 1440 minutos, com o máximo igual ou maior que o
                    mínimo.
                  </p>
                ) : null}
              </div>
            </div>
          </section>
        </fieldset>

        <div className="space-y-4">
          <details className="group border-border bg-surface rounded-xl border lg:hidden">
            <summary className="focus-visible:ring-brand-500 flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-3 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
              <Store className="text-brand-700 size-5" aria-hidden="true" />
              <span className="text-text-primary flex-1 text-sm font-semibold">
                Como ficará no checkout
              </span>
              {isDirty ? <Badge variant="warning">Prévia</Badge> : null}
              <ChevronDown
                className="text-text-muted size-5 transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <div className="border-border border-t px-4 py-3">{summaryContent}</div>
          </details>

          <aside className="border-border bg-surface sticky top-24 hidden rounded-xl border p-4 lg:block">
            <div className="flex items-center gap-2">
              <Store className="text-brand-700 size-5" aria-hidden="true" />
              <h2 className="text-text-primary font-semibold">Como ficará no checkout</h2>
              {isDirty ? <Badge variant="warning">Prévia</Badge> : null}
            </div>
            <div className="mt-4">{summaryContent}</div>
          </aside>

          <section
            className="border-border bg-surface rounded-xl border p-4"
            aria-labelledby="payment-summary-heading"
          >
            <div className="flex items-start gap-3">
              <WalletCards className="text-brand-700 mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <h2 id="payment-summary-heading" className="text-text-primary font-semibold">
                  Pagamentos
                </h2>
                <p className="text-text-secondary mt-1 text-sm">
                  {activePayments.length > 0
                    ? activePayments.join(' · ')
                    : 'Nenhuma forma de pagamento ativa.'}
                </p>
                {paymentSummary.acceptsPix && !paymentSummary.pixConfigured ? (
                  <p className="text-warning mt-2 flex items-start gap-1.5 text-sm">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />O Pix
                    precisa de uma chave válida.
                  </p>
                ) : null}
                {paymentsHref ? (
                  <Link
                    href={paymentsHref}
                    className="text-brand-700 focus-visible:ring-brand-500 mt-3 inline-flex min-h-11 items-center rounded-md py-2 text-sm font-semibold underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
                  >
                    Gerenciar pagamentos
                  </Link>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      </div>

      {!readOnly ? (
        <FormActions
          isDirty={isDirty}
          onRestore={handleRestore}
          submitLabel="Salvar alterações"
          compactMobile
          submitDisabled={
            noFulfillment || openStoreWithoutEffectiveFulfillment || invalidEstimatedRange
          }
        />
      ) : null}
    </form>
  );
}
