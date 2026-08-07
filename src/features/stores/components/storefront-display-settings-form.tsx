'use client';

import { useState } from 'react';
import {
  Banknote,
  CalendarDays,
  Clock,
  Eye,
  EyeOff,
  History,
  MapPin,
  PackageCheck,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';

import { FormActions } from '@/components/shared/form-actions';
import { FormMessage } from '@/components/shared/form-message';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { updateStorefrontDisplaySettingsAction } from '@/features/stores/actions';
import { useStoreForm } from '@/features/stores/use-store-form';
import { formatCurrency } from '@/lib/utils';

interface DisplaySettings {
  showEstimatedTimeInHero: boolean;
  showFulfillmentInHero: boolean;
  showMinOrderValueInHero: boolean;
  showOpeningHoursInHero: boolean;
  showFullAddressInStoreInfo: boolean;
  showRecentPurchasesSection: boolean;
  showFeaturedProductsSection: boolean;
}

interface StorefrontDisplaySettingsFormProps {
  storeId: string;
  expectedConfigurationVersion: number;
  readOnly?: boolean;
  settings: DisplaySettings;
  preview: {
    estimatedTime: string;
    minOrderValue: number;
    fulfillment: string | null;
    hasOpeningHours: boolean;
    fullAddress: string | null;
  };
}

const HERO_OPTIONS = [
  {
    key: 'showEstimatedTimeInHero',
    label: 'Prazo estimado',
    description: 'Exibe o intervalo de preparo diretamente na capa.',
    icon: Clock,
  },
  {
    key: 'showFulfillmentInHero',
    label: 'Entrega e retirada',
    description: 'Exibe as modalidades habilitadas diretamente na capa.',
    icon: PackageCheck,
  },
  {
    key: 'showMinOrderValueInHero',
    label: 'Pedido mínimo',
    description: 'Exibe o valor mínimo necessário para concluir o pedido.',
    icon: Banknote,
  },
  {
    key: 'showOpeningHoursInHero',
    label: 'Horários',
    description: 'Exibe o acesso aos horários semanais diretamente na capa.',
    icon: CalendarDays,
  },
] as const;

export function StorefrontDisplaySettingsForm({
  storeId,
  expectedConfigurationVersion,
  readOnly = false,
  settings: initialSettings,
  preview,
}: StorefrontDisplaySettingsFormProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [savedSettings, setSavedSettings] = useState(initialSettings);
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

  function updateSetting(key: keyof DisplaySettings, checked: boolean) {
    setSettings((current) => ({ ...current, [key]: checked }));
    markDirty();
  }

  function restoreValues() {
    setSettings(savedSettings);
    restore();
  }

  async function handleSubmit(formData: FormData) {
    const result = await updateStorefrontDisplaySettingsAction(
      storeId,
      configurationVersion,
      formData,
    );
    if (handleResult(result, 'Exibição do cardápio atualizada!')) {
      setSavedSettings(settings);
    }
  }

  const previewItems = [
    settings.showEstimatedTimeInHero
      ? { key: 'time', icon: Clock, label: preview.estimatedTime }
      : null,
    settings.showFulfillmentInHero && preview.fulfillment
      ? { key: 'fulfillment', icon: PackageCheck, label: preview.fulfillment }
      : null,
    settings.showMinOrderValueInHero
      ? {
          key: 'minimum',
          icon: Banknote,
          label: `Mín. ${formatCurrency(preview.minOrderValue)}`,
        }
      : null,
    settings.showOpeningHoursInHero && preview.hasOpeningHours
      ? { key: 'hours', icon: CalendarDays, label: 'Ver horários' }
      : null,
  ].filter((item) => item !== null);

  return (
    <form ref={formRef} action={handleSubmit} className="space-y-6">
      <FormMessage message={formError} fieldErrors={fieldErrors} />

      <fieldset disabled={readOnly} className="space-y-6">
        <section aria-labelledby="commercial-display-heading">
          <div className="mb-4">
            <h2 id="commercial-display-heading" className="text-text-primary font-semibold">
              Vitrines comerciais
            </h2>
            <p className="text-text-secondary mt-1 text-sm">
              Escolha quais seleções de produtos aparecem antes do catálogo completo.
            </p>
          </div>

          <div className="divide-border border-border divide-y overflow-hidden rounded-xl border">
            <div className="flex min-h-24 items-center gap-3 px-4 py-3 sm:px-5">
              <span className="bg-brand-50 text-brand-700 rounded-lg p-2">
                <History className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <Label htmlFor="showRecentPurchasesSection">
                  Mostrar seção &quot;Peça de novo&quot;
                </Label>
                <p className="text-text-secondary mt-0.5 text-sm">
                  Exibe os pedidos anteriores do consumidor para facilitar novas compras.
                </p>
              </div>
              <input type="hidden" name="showRecentPurchasesSection" value="false" />
              <Switch
                id="showRecentPurchasesSection"
                name="showRecentPurchasesSection"
                value="true"
                checked={settings.showRecentPurchasesSection}
                onCheckedChange={(value) => updateSetting('showRecentPurchasesSection', value)}
              />
            </div>

            <div className="flex min-h-24 items-center gap-3 px-4 py-3 sm:px-5">
              <span className="bg-brand-50 text-brand-700 rounded-lg p-2">
                <Sparkles className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <Label htmlFor="showFeaturedProductsSection">Mostrar produtos em destaque</Label>
                <p className="text-text-secondary mt-0.5 text-sm">
                  Exibe no topo os produtos marcados como destaque no catálogo.
                </p>
                <p className="text-text-secondary mt-1 text-xs">
                  Os produtos continuam disponíveis em suas categorias quando esta vitrine estiver
                  desativada.
                </p>
              </div>
              <input type="hidden" name="showFeaturedProductsSection" value="false" />
              <Switch
                id="showFeaturedProductsSection"
                name="showFeaturedProductsSection"
                value="true"
                checked={settings.showFeaturedProductsSection}
                onCheckedChange={(value) => updateSetting('showFeaturedProductsSection', value)}
              />
            </div>
          </div>

          <div
            className="border-border bg-surface-secondary mt-4 rounded-xl border p-4"
            aria-label="Prévia ilustrativa das vitrines comerciais"
          >
            <p className="text-text-secondary text-xs font-medium">Prévia ilustrativa</p>
            <div className="mt-3 space-y-4">
              {settings.showRecentPurchasesSection ? (
                <div>
                  <p className="text-text-primary flex items-center gap-2 text-sm font-semibold">
                    <History className="text-brand-700 h-4 w-4" aria-hidden="true" />
                    Peça de novo
                  </p>
                  <div className="mt-2 flex gap-2" aria-hidden="true">
                    <span className="bg-surface border-border h-12 flex-1 rounded-lg border" />
                    <span className="bg-surface border-border h-12 flex-1 rounded-lg border" />
                  </div>
                </div>
              ) : null}
              {settings.showFeaturedProductsSection ? (
                <div>
                  <p className="text-text-primary flex items-center gap-2 text-sm font-semibold">
                    <Sparkles className="text-brand-700 h-4 w-4" aria-hidden="true" />
                    Destaques
                  </p>
                  <div className="mt-2 flex gap-2" aria-hidden="true">
                    <span className="bg-surface border-border h-12 flex-1 rounded-lg border" />
                    <span className="bg-surface border-border h-12 flex-1 rounded-lg border" />
                  </div>
                </div>
              ) : null}
              {!settings.showRecentPurchasesSection && !settings.showFeaturedProductsSection ? (
                <p className="text-text-secondary flex items-center gap-2 text-sm">
                  <EyeOff className="h-4 w-4" aria-hidden="true" />O catálogo começará diretamente
                  pelas categorias.
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <section aria-labelledby="hero-display-heading">
          <div className="mb-4">
            <h2 id="hero-display-heading" className="text-text-primary font-semibold">
              Informações na capa
            </h2>
            <p className="text-text-secondary mt-1 text-sm">
              Escolha o que aparece antes da busca. Os itens ocultos continuam disponíveis em “Sobre
              a loja”.
            </p>
          </div>

          <div className="divide-border border-border divide-y overflow-hidden rounded-xl border">
            {HERO_OPTIONS.map((option) => {
              const Icon = option.icon;
              const checked = settings[option.key];
              return (
                <div
                  key={option.key}
                  className="flex min-h-20 items-center gap-3 px-4 py-3 sm:px-5"
                >
                  <span className="bg-brand-50 text-brand-700 rounded-lg p-2">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Label htmlFor={option.key}>{option.label}</Label>
                    <p className="text-text-secondary mt-0.5 text-sm">{option.description}</p>
                  </div>
                  <input type="hidden" name={option.key} value="false" />
                  <Switch
                    id={option.key}
                    name={option.key}
                    value="true"
                    checked={checked}
                    onCheckedChange={(value) => updateSetting(option.key, value)}
                  />
                </div>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="address-privacy-heading">
          <div className="mb-4">
            <h2 id="address-privacy-heading" className="text-text-primary font-semibold">
              Privacidade do endereço
            </h2>
            <p className="text-text-secondary mt-1 text-sm">
              O endereço completo nunca é publicado sem sua autorização.
            </p>
          </div>

          <div className="border-border rounded-xl border p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="bg-warning-light text-warning rounded-lg p-2">
                <ShieldAlert className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <Label htmlFor="showFullAddressInStoreInfo">
                  Publicar endereço completo em “Sobre a loja”
                </Label>
                <p className="text-text-secondary mt-1 text-sm">
                  Ao ativar, rua, número, complemento, bairro, cidade, estado e CEP poderão ficar
                  visíveis para qualquer visitante do cardápio.
                </p>
                {settings.showFullAddressInStoreInfo && preview.fullAddress ? (
                  <p className="text-text-primary mt-3 flex items-start gap-2 text-sm">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{preview.fullAddress}</span>
                  </p>
                ) : null}
              </div>
              <input type="hidden" name="showFullAddressInStoreInfo" value="false" />
              <Switch
                id="showFullAddressInStoreInfo"
                name="showFullAddressInStoreInfo"
                value="true"
                checked={settings.showFullAddressInStoreInfo}
                onCheckedChange={(value) => updateSetting('showFullAddressInStoreInfo', value)}
              />
            </div>
          </div>
        </section>
      </fieldset>

      <section
        className="border-border bg-surface-secondary rounded-xl border p-4 sm:p-5"
        aria-labelledby="hero-preview-heading"
      >
        <div className="flex items-center gap-2">
          <Eye className="text-brand-700 h-5 w-5" aria-hidden="true" />
          <h2 id="hero-preview-heading" className="text-text-primary font-semibold">
            Prévia compacta da capa
          </h2>
        </div>
        <div className="bg-surface border-border mt-4 rounded-xl border p-4">
          <p className="text-text-primary font-bold">Sua loja</p>
          {previewItems.length > 0 ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {previewItems.map((item) => {
                const Icon = item.icon;
                return (
                  <span
                    key={item.key}
                    className="border-border text-text-primary flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm"
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{item.label}</span>
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="text-text-secondary mt-3 flex items-center gap-2 text-sm">
              <EyeOff className="h-4 w-4" aria-hidden="true" />
              Nenhum detalhe operacional será exibido na capa.
            </p>
          )}
        </div>
      </section>

      {!readOnly && (
        <FormActions isDirty={isDirty} onRestore={restoreValues} submitLabel="Salvar exibição" />
      )}
    </form>
  );
}
