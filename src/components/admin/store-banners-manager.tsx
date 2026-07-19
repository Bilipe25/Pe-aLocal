'use client';

import { Megaphone, Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import type { AdminStoreAssetItem } from '@/components/admin/store-assets-manager';
import { deleteStoreBannerAction, saveStoreBannerAction } from '@/features/banners/actions';
import { BANNER_DESTINATION_TYPES, type BannerDestinationTypeValue } from '@/schemas/store-banner';

export interface AdminStoreBannerItem {
  id: string;
  assetId: string | null;
  title: string;
  subtitle: string | null;
  buttonText: string | null;
  destinationType: BannerDestinationTypeValue;
  destinationValue: string | null;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  priority: number;
  imageUrl: string | null;
}

interface DestinationOptions {
  categories: { id: string; name: string }[];
  products: { id: string; name: string }[];
  coupons: { id: string; code: string }[];
}

const EMPTY_FORM = {
  id: undefined as string | undefined,
  assetId: '',
  title: '',
  subtitle: '',
  buttonText: '',
  destinationType: 'NONE' as BannerDestinationTypeValue,
  destinationValue: '',
  startsAt: '',
  endsAt: '',
  isActive: false,
  priority: 0,
};

function localDate(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function StoreBannersManager({
  tenantId,
  storeId,
  initialBanners,
  assets,
  destinations,
  maxBanners,
  scheduledEnabled,
}: {
  tenantId: string;
  storeId: string;
  initialBanners: AdminStoreBannerItem[];
  assets: AdminStoreAssetItem[];
  destinations: DestinationOptions;
  maxBanners: number;
  scheduledEnabled: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY_FORM);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const bannerAssets = assets.filter((asset) => asset.assetType === 'BANNER');
  const destinationOptions =
    form.destinationType === 'CATEGORY'
      ? destinations.categories.map((item) => ({ value: item.id, label: item.name }))
      : form.destinationType === 'PRODUCT'
        ? destinations.products.map((item) => ({ value: item.id, label: item.name }))
        : form.destinationType === 'COUPON'
          ? destinations.coupons.map((item) => ({ value: item.id, label: item.code }))
          : [];

  function edit(banner: AdminStoreBannerItem) {
    setForm({
      id: banner.id,
      assetId: banner.assetId ?? '',
      title: banner.title,
      subtitle: banner.subtitle ?? '',
      buttonText: banner.buttonText ?? '',
      destinationType: banner.destinationType,
      destinationValue: banner.destinationValue ?? '',
      startsAt: localDate(banner.startsAt),
      endsAt: localDate(banner.endsAt),
      isActive: banner.isActive,
      priority: banner.priority,
    });
    setFeedback(null);
  }

  function save() {
    startTransition(async () => {
      const result = await saveStoreBannerAction(tenantId, storeId, {
        id: form.id,
        assetId: form.assetId || null,
        title: form.title,
        subtitle: form.subtitle || null,
        buttonText: form.buttonText || null,
        destinationType: form.destinationType,
        destinationValue: form.destinationValue || null,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
        isActive: form.isActive,
        priority: form.priority,
      });
      if (!result.success) {
        setFeedback(result.error.message);
        return;
      }
      setForm(EMPTY_FORM);
      setFeedback('Banner salvo e cache público invalidado.');
      router.refresh();
    });
  }

  function remove(bannerId: string) {
    if (!window.confirm('Excluir este banner? A ação será auditada.')) return;
    startTransition(async () => {
      const result = await deleteStoreBannerAction(tenantId, storeId, bannerId);
      if (!result.success) {
        setFeedback(result.error.message);
        return;
      }
      setForm(EMPTY_FORM);
      setFeedback('Banner excluído.');
      router.refresh();
    });
  }

  return (
    <section className="border-border bg-surface rounded-xl border p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Megaphone className="text-brand-600 h-5 w-5" aria-hidden="true" />
        <h3 className="text-text-primary text-lg font-semibold">Banners</h3>
      </div>
      <p className="text-text-secondary mt-1 text-sm">
        Até {maxBanners} cadastrados e no máximo três ativos no mesmo período.
      </p>

      <div className="border-border mt-5 grid grid-cols-1 gap-3 rounded-lg border p-4 sm:grid-cols-2">
        <label className="text-text-secondary grid gap-1 text-sm sm:col-span-2">
          Título
          <input
            value={form.title}
            maxLength={120}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            className="border-border min-h-11 rounded-md border px-3 py-2"
          />
        </label>
        <label className="text-text-secondary grid gap-1 text-sm sm:col-span-2">
          Subtítulo
          <input
            value={form.subtitle}
            maxLength={240}
            onChange={(event) => setForm({ ...form, subtitle: event.target.value })}
            className="border-border min-h-11 rounded-md border px-3 py-2"
          />
        </label>
        <label className="text-text-secondary grid gap-1 text-sm">
          Imagem
          <select
            value={form.assetId}
            onChange={(event) => setForm({ ...form, assetId: event.target.value })}
            className="border-border min-h-11 rounded-md border px-3 py-2"
          >
            <option value="">Sem imagem</option>
            {bannerAssets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.altText || asset.id}
              </option>
            ))}
          </select>
        </label>
        <label className="text-text-secondary grid gap-1 text-sm">
          Prioridade
          <input
            type="number"
            min={0}
            max={1000}
            value={form.priority}
            onChange={(event) => setForm({ ...form, priority: Number(event.target.value) })}
            className="border-border min-h-11 rounded-md border px-3 py-2"
          />
        </label>
        <label className="text-text-secondary grid gap-1 text-sm">
          Destino
          <select
            value={form.destinationType}
            onChange={(event) => {
              const destinationType = event.target.value as BannerDestinationTypeValue;
              setForm({
                ...form,
                destinationType,
                destinationValue: '',
                buttonText: destinationType === 'NONE' ? '' : form.buttonText,
              });
            }}
            className="border-border min-h-11 rounded-md border px-3 py-2"
          >
            {BANNER_DESTINATION_TYPES.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </label>
        <label className="text-text-secondary grid gap-1 text-sm">
          Texto do botão
          <input
            value={form.buttonText}
            disabled={form.destinationType === 'NONE'}
            maxLength={80}
            onChange={(event) => setForm({ ...form, buttonText: event.target.value })}
            className="border-border min-h-11 rounded-md border px-3 py-2 disabled:opacity-50"
          />
        </label>
        {form.destinationType !== 'NONE' && form.destinationType !== 'INTERNAL_PATH' && (
          <label className="text-text-secondary grid gap-1 text-sm sm:col-span-2">
            Item de destino
            <select
              value={form.destinationValue}
              onChange={(event) => setForm({ ...form, destinationValue: event.target.value })}
              className="border-border min-h-11 rounded-md border px-3 py-2"
            >
              <option value="">Selecione</option>
              {destinationOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {form.destinationType === 'INTERNAL_PATH' && (
          <label className="text-text-secondary grid gap-1 text-sm sm:col-span-2">
            Caminho interno
            <input
              value={form.destinationValue}
              placeholder="/slug-da-loja"
              onChange={(event) => setForm({ ...form, destinationValue: event.target.value })}
              className="border-border min-h-11 rounded-md border px-3 py-2"
            />
          </label>
        )}
        <label className="text-text-secondary grid gap-1 text-sm">
          Início
          <input
            type="datetime-local"
            value={form.startsAt}
            disabled={!scheduledEnabled}
            onChange={(event) => setForm({ ...form, startsAt: event.target.value })}
            className="border-border min-h-11 rounded-md border px-3 py-2 disabled:opacity-50"
          />
        </label>
        <label className="text-text-secondary grid gap-1 text-sm">
          Fim
          <input
            type="datetime-local"
            value={form.endsAt}
            disabled={!scheduledEnabled}
            onChange={(event) => setForm({ ...form, endsAt: event.target.value })}
            className="border-border min-h-11 rounded-md border px-3 py-2 disabled:opacity-50"
          />
        </label>
        <label className="text-text-secondary flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={form.isActive}
            onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
          />
          Banner ativo
        </label>
        <div className="flex gap-2 sm:col-span-2">
          <button
            type="button"
            disabled={isPending}
            onClick={save}
            className="bg-brand-600 hover:bg-brand-700 min-h-11 rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {form.id ? 'Atualizar banner' : 'Criar banner'}
          </button>
          {form.id && (
            <button type="button" onClick={() => setForm(EMPTY_FORM)} className="px-3 text-sm">
              Cancelar
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <p className="bg-info-light text-info mt-3 rounded-md p-3 text-sm">{feedback}</p>
      )}
      <div className="mt-4 space-y-3">
        {initialBanners.map((banner) => (
          <article key={banner.id} className="border-border flex gap-3 rounded-lg border p-3">
            {banner.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={banner.imageUrl} alt="" className="h-16 w-24 rounded object-cover" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-text-primary font-medium">{banner.title}</p>
              <p className="text-text-muted text-xs">
                {banner.isActive ? 'Ativo' : 'Inativo'} · prioridade {banner.priority}
              </p>
            </div>
            <button type="button" onClick={() => edit(banner)} aria-label="Editar banner">
              <Pencil className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => remove(banner.id)} aria-label="Excluir banner">
              <Trash2 className="text-error h-4 w-4" />
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
