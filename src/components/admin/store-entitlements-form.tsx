'use client';

import { CircleAlert, SlidersHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { ChangeScopeBadge } from '@/components/admin/change-scope-badge';
import { updateStoreEntitlementAction } from '@/features/entitlements/actions';
import { STORE_FEATURE_DEFINITIONS } from '@/domain/entitlements/store-features';
import type { MercadoPagoOperationalReadiness } from '@/lib/mercado-pago/config';
import {
  LAYOUT_TEMPLATES,
  VISUAL_PRESETS,
  type LayoutTemplate,
  type VisualPreset,
} from '@/schemas/customization';

export interface AdminStoreEntitlementItem {
  maxAssetCount: number;
  maxAssetStorageBytes: number;
  maxBanners: number;
  allowedLayoutTemplates: LayoutTemplate[];
  allowedVisualPresets: VisualPreset[];
  advancedTypographyEnabled: boolean;
  customDomainEnabled: boolean;
  platformBrandingRemovalEnabled: boolean;
  scheduledBannersEnabled: boolean;
  onlinePaymentsEnabled: boolean;
  operationalSlaEnabled: boolean;
  kdsEnabled: boolean;
  advancedReportsEnabled: boolean;
  orderPrintingEnabled: boolean;
  dineInQrEnabled: boolean;
}

export function StoreEntitlementsForm({
  tenantId,
  storeId,
  initialEntitlement,
  mercadoPagoReadiness,
}: {
  tenantId: string;
  storeId: string;
  initialEntitlement: AdminStoreEntitlementItem;
  mercadoPagoReadiness: MercadoPagoOperationalReadiness;
}) {
  const router = useRouter();
  const [form, setForm] = useState(initialEntitlement);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  function toggleLayout(value: LayoutTemplate) {
    const current = form.allowedLayoutTemplates;
    setForm({
      ...form,
      allowedLayoutTemplates: current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    });
  }

  function togglePreset(value: VisualPreset) {
    const current = form.allowedVisualPresets;
    setForm({
      ...form,
      allowedVisualPresets: current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    });
  }

  function save() {
    startTransition(async () => {
      const result = await updateStoreEntitlementAction(tenantId, storeId, form);
      if (!result.success) {
        setFeedback({ tone: 'error', message: result.error.message });
        return;
      }
      setFeedback({ tone: 'success', message: 'Recursos e limites atualizados com auditoria.' });
      if (form.onlinePaymentsEnabled) {
        setFeedback({
          tone: 'success',
          message:
            mercadoPagoReadiness.rolloutEnabled && mercadoPagoReadiness.configurationReady
              ? 'Capacidade concedida. A loja já pode conectar a conta Mercado Pago.'
              : 'Capacidade concedida. O pagamento online continuará oculto até o rollout global estar pronto.',
        });
      }
      router.refresh();
    });
  }

  return (
    <section className="border-border bg-surface rounded-xl border p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="text-brand-600 h-5 w-5" aria-hidden="true" />
        <h3 className="text-text-primary text-lg font-semibold">Recursos e limites</h3>
      </div>
      <div className="mt-3">
        <ChangeScopeBadge scope="immediate" />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="text-text-secondary grid gap-1 text-sm">
          Máximo de assets
          <input
            type="number"
            min={1}
            max={1000}
            value={form.maxAssetCount}
            onChange={(event) => setForm({ ...form, maxAssetCount: Number(event.target.value) })}
            className="border-border min-h-11 rounded-md border px-3 py-2"
          />
        </label>
        <label className="text-text-secondary grid gap-1 text-sm">
          Armazenamento (MB)
          <input
            type="number"
            min={1}
            max={1024}
            value={Math.round(form.maxAssetStorageBytes / 1024 / 1024)}
            onChange={(event) =>
              setForm({ ...form, maxAssetStorageBytes: Number(event.target.value) * 1024 * 1024 })
            }
            className="border-border min-h-11 rounded-md border px-3 py-2"
          />
        </label>
        <label className="text-text-secondary grid gap-1 text-sm">
          Máximo de banners
          <input
            type="number"
            min={0}
            max={100}
            value={form.maxBanners}
            onChange={(event) => setForm({ ...form, maxBanners: Number(event.target.value) })}
            className="border-border min-h-11 rounded-md border px-3 py-2"
          />
        </label>
      </div>
      <fieldset className="mt-4">
        <legend className="text-text-primary text-sm font-medium">Layouts permitidos</legend>
        <div className="mt-2 flex flex-wrap gap-3">
          {LAYOUT_TEMPLATES.map((layout) => (
            <label
              key={layout}
              className="text-text-secondary flex min-h-11 items-center gap-2 text-xs"
            >
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={form.allowedLayoutTemplates.includes(layout)}
                onChange={() => toggleLayout(layout)}
              />
              {layout}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="mt-4">
        <legend className="text-text-primary text-sm font-medium">Presets permitidos</legend>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {VISUAL_PRESETS.map((preset) => (
            <label
              key={preset}
              className="text-text-secondary flex min-h-11 items-center gap-2 text-xs"
            >
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={form.allowedVisualPresets.includes(preset)}
                onChange={() => togglePreset(preset)}
              />
              {preset}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {(
          [
            ['advancedTypographyEnabled', 'Tipografia avançada'],
            ['customDomainEnabled', 'Domínio personalizado'],
            ['platformBrandingRemovalEnabled', 'Remoção da marca PedidoLocal'],
            ['scheduledBannersEnabled', 'Banners agendados'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="text-text-secondary flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={form[key]}
              onChange={(event) => setForm({ ...form, [key]: event.target.checked })}
            />
            {label}
          </label>
        ))}
      </div>
      <fieldset className="border-border mt-5 border-t pt-5">
        <legend className="text-text-primary px-1 text-sm font-semibold">
          Recursos do estabelecimento
        </legend>
        <p className="text-text-secondary mt-1 max-w-3xl text-sm">
          Estes controles concedem capacidade à loja. Recursos marcados como “Em breve” ainda não
          aparecem no painel do estabelecimento.
        </p>
        <div className="divide-border mt-3 divide-y">
          {Object.values(STORE_FEATURE_DEFINITIONS).map((feature) => {
            const field = feature.entitlementField;
            const available = feature.implementationStatus === 'AVAILABLE';
            const isOnlinePayment = feature.key === 'onlinePayments';
            return (
              <label key={feature.key} className="flex min-h-16 items-start gap-3 py-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 shrink-0"
                  checked={form[field]}
                  onChange={(event) => setForm({ ...form, [field]: event.target.checked })}
                />
                <span className="min-w-0">
                  <span className="text-text-primary flex flex-wrap items-center gap-2 text-sm font-medium">
                    {feature.label}
                    <span
                      className={
                        available
                          ? 'bg-success-light text-success rounded-full px-2 py-0.5 text-xs'
                          : 'bg-surface-secondary text-text-secondary rounded-full px-2 py-0.5 text-xs'
                      }
                    >
                      {available ? 'Implementado' : 'Em breve'}
                    </span>
                    {isOnlinePayment ? (
                      <span
                        className={`${mercadoPagoReadiness.rolloutEnabled && mercadoPagoReadiness.configurationReady ? 'bg-success-light text-success' : 'bg-warning-light text-warning'} rounded-full px-2 py-0.5 text-xs`}
                      >
                        {mercadoPagoReadiness.rolloutEnabled &&
                        mercadoPagoReadiness.configurationReady
                          ? 'Rollout ativo'
                          : 'Rollout indisponível'}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-text-secondary mt-0.5 block text-sm">
                    {feature.description}
                  </span>
                  {isOnlinePayment ? (
                    <span className="text-text-secondary mt-2 flex max-w-2xl items-start gap-2 text-xs">
                      <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                      <span>
                        {mercadoPagoReadiness.configurationReady
                          ? mercadoPagoReadiness.rolloutEnabled
                            ? `Configuração operacional pronta em ${mercadoPagoReadiness.environment === 'production' ? 'produção' : 'sandbox'}. Ao salvar, a opção aparecerá para o proprietário.`
                            : 'A capacidade pode ser concedida, mas a loja só verá a opção depois que o rollout global for ligado.'
                          : `Configuração incompleta no Worker (${mercadoPagoReadiness.configuredBindings} de ${mercadoPagoReadiness.requiredBindings} bindings presentes). A loja não verá a opção online.`}
                      </span>
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <button
        type="button"
        disabled={isPending}
        onClick={save}
        className="bg-brand-600 hover:bg-brand-700 mt-5 min-h-11 rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Salvar recursos
      </button>
      {feedback && (
        <p
          role={feedback.tone === 'error' ? 'alert' : 'status'}
          className={`${feedback.tone === 'error' ? 'bg-error-light text-error' : 'bg-info-light text-info'} mt-3 rounded-md p-3 text-sm`}
        >
          {feedback.message}
        </p>
      )}
    </section>
  );
}
