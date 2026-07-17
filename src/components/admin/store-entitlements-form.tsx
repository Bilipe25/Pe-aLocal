'use client';

import { SlidersHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { updateStoreEntitlementAction } from '@/features/entitlements/actions';
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
}

export function StoreEntitlementsForm({
  tenantId,
  storeId,
  initialEntitlement,
}: {
  tenantId: string;
  storeId: string;
  initialEntitlement: AdminStoreEntitlementItem;
}) {
  const router = useRouter();
  const [form, setForm] = useState(initialEntitlement);
  const [feedback, setFeedback] = useState<string | null>(null);
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
        setFeedback(result.error.message);
        return;
      }
      setFeedback('Recursos e limites atualizados com auditoria.');
      router.refresh();
    });
  }

  return (
    <section className="border-border bg-surface rounded-xl border p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="text-brand-500 h-5 w-5" />
        <h2 className="text-text-primary text-lg font-semibold">8. Recursos e limites</h2>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="text-text-secondary grid gap-1 text-sm">
          Máximo de assets
          <input
            type="number"
            min={1}
            max={1000}
            value={form.maxAssetCount}
            onChange={(event) => setForm({ ...form, maxAssetCount: Number(event.target.value) })}
            className="border-border rounded-md border px-3 py-2"
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
            className="border-border rounded-md border px-3 py-2"
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
            className="border-border rounded-md border px-3 py-2"
          />
        </label>
      </div>
      <fieldset className="mt-4">
        <legend className="text-text-primary text-sm font-medium">Layouts permitidos</legend>
        <div className="mt-2 flex flex-wrap gap-3">
          {LAYOUT_TEMPLATES.map((layout) => (
            <label key={layout} className="text-text-secondary flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
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
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {VISUAL_PRESETS.map((preset) => (
            <label key={preset} className="text-text-secondary flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={form.allowedVisualPresets.includes(preset)}
                onChange={() => togglePreset(preset)}
              />
              {preset}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {(
          [
            ['advancedTypographyEnabled', 'Tipografia avançada'],
            ['customDomainEnabled', 'Domínio personalizado'],
            ['platformBrandingRemovalEnabled', 'Remoção da marca PedidoLocal'],
            ['scheduledBannersEnabled', 'Banners agendados'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="text-text-secondary flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form[key]}
              onChange={(event) => setForm({ ...form, [key]: event.target.checked })}
            />
            {label}
          </label>
        ))}
      </div>
      <button
        type="button"
        disabled={isPending}
        onClick={save}
        className="bg-brand-500 mt-5 rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Salvar recursos
      </button>
      {feedback && (
        <p className="bg-info-light text-info mt-3 rounded-md p-3 text-sm">{feedback}</p>
      )}
    </section>
  );
}
