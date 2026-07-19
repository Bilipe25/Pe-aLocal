'use client';

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, ChevronDown, History, RotateCcw, Save, Send } from 'lucide-react';
import {
  StoreAssetsManager,
  type AdminStoreAssetItem,
} from '@/components/admin/store-assets-manager';
import {
  StoreCategoryImagesManager,
  type AdminStoreCategoryItem,
} from '@/components/admin/store-category-images-manager';
import {
  StoreBannersManager,
  type AdminStoreBannerItem,
} from '@/components/admin/store-banners-manager';
import {
  StoreDomainsManager,
  type AdminStoreDomainItem,
} from '@/components/admin/store-domains-manager';
import {
  StoreEntitlementsForm,
  type AdminStoreEntitlementItem,
} from '@/components/admin/store-entitlements-form';
import { StorefrontPreview } from '@/components/admin/storefront-preview';
import { cn } from '@/lib/utils';

import {
  discardCustomizationDraftAction,
  publishCustomizationAction,
  restoreCustomizationRevisionAction,
  restoreDefaultCustomizationAction,
  saveCustomizationDraftAction,
} from '@/features/customization/actions';
import { evaluateCustomizationContrast } from '@/features/customization/domain/contrast';
import { applyVisualPreset } from '@/features/customization/domain/presets';
import {
  LAYOUT_TEMPLATES,
  VISUAL_PRESETS,
  type StoreCustomizationConfig,
  type VisualPreset,
} from '@/schemas/customization';

interface RevisionItem {
  id: string;
  version: number;
  reason: string;
  origin: string;
  publishedAt: string;
  actor: { name: string; email: string } | null;
}

interface CustomizationEditorProps {
  tenantId: string;
  storeId: string;
  initialConfig: StoreCustomizationConfig;
  initialPublishedConfig: StoreCustomizationConfig;
  initialDraftVersion: number;
  initialPublishedVersion: number;
  initialHasDraft: boolean;
  publishedAt: string | null;
  revisions: RevisionItem[];
  initialAssets: AdminStoreAssetItem[];
  initialBanners: AdminStoreBannerItem[];
  initialDomains: AdminStoreDomainItem[];
  initialEntitlement: AdminStoreEntitlementItem;
  destinations: {
    categories: AdminStoreCategoryItem[];
    products: { id: string; name: string }[];
    coupons: { id: string; code: string }[];
  };
  storeSlug: string;
  storeName: string;
  storeStatus: 'OPEN' | 'CLOSED' | 'PAUSED';
}

type Feedback = { tone: 'success' | 'error'; message: string } | null;

function CustomizationGroup({
  title,
  description,
  children,
  defaultOpen = false,
}: {
  title: string;
  description: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <details
      className="group border-border border-b pb-6"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="focus-visible:ring-brand-500 flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-md py-2 focus-visible:ring-2 focus-visible:outline-none">
        <span className="min-w-0">
          <h2 className="text-text-primary text-lg font-semibold text-balance">{title}</h2>
          <span className="text-text-secondary mt-0.5 block text-sm text-pretty">
            {description}
          </span>
        </span>
        <ChevronDown
          className="text-text-muted h-5 w-5 shrink-0 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="mt-4 space-y-6">{children}</div>
    </details>
  );
}

const PALETTE_LABELS: Record<keyof StoreCustomizationConfig['palette'], string> = {
  primary: 'Primária',
  secondary: 'Secundária',
  accent: 'Destaque',
  background: 'Fundo',
  surface: 'Cartões',
  text: 'Texto',
  mutedText: 'Texto secundário',
  border: 'Bordas',
  buttonBackground: 'Fundo do botão',
  buttonText: 'Texto do botão',
};

const LAYOUT_LABELS: Record<(typeof LAYOUT_TEMPLATES)[number], string> = {
  CLASSIC_LIST: 'Lista clássica',
  MODERN_GRID: 'Grade moderna',
  EDITORIAL_HERO: 'Capa editorial',
};

function errorMessage(result: { error: { message: string; details?: Record<string, unknown>[] } }) {
  const detail = result.error.details?.[0]?.message;
  return typeof detail === 'string' ? `${result.error.message} ${detail}` : result.error.message;
}

export function CustomizationEditor({
  tenantId,
  storeId,
  initialConfig,
  initialPublishedConfig,
  initialDraftVersion,
  initialPublishedVersion,
  initialHasDraft,
  publishedAt,
  revisions,
  initialAssets,
  initialBanners,
  initialDomains,
  initialEntitlement,
  destinations,
  storeSlug,
  storeName,
  storeStatus,
}: CustomizationEditorProps) {
  const router = useRouter();
  const [config, setConfig] = useState(initialConfig);
  const [assets, setAssets] = useState(initialAssets);
  const [publishedConfig, setPublishedConfig] = useState(initialPublishedConfig);
  const [draftVersion, setDraftVersion] = useState(initialDraftVersion);
  const [publishedVersion, setPublishedVersion] = useState(initialPublishedVersion);
  const [hasDraft, setHasDraft] = useState(initialHasDraft);
  const [reason, setReason] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<VisualPreset>(
    initialConfig.theme.visualPreset,
  );
  const [dirty, setDirty] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isPending, startTransition] = useTransition();
  const deferredConfig = useDeferredValue(config);
  const contrastIssues = useMemo(() => evaluateCustomizationContrast(config), [config]);
  const criticalContrast = contrastIssues.filter((item) => item.severity === 'error');
  const logoUrl =
    assets.find((asset) => asset.id === deferredConfig.identity.logoAssetId)?.previewUrl ?? null;
  const coverUrl =
    assets.find((asset) => asset.id === deferredConfig.identity.coverAssetId)?.url ?? null;

  useEffect(() => {
    const preventExit = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', preventExit);
    return () => window.removeEventListener('beforeunload', preventExit);
  }, [dirty]);

  function change(next: StoreCustomizationConfig) {
    setConfig(next);
    setDirty(true);
    setFeedback(null);
  }

  function updateSection<K extends keyof StoreCustomizationConfig>(
    section: K,
    value: StoreCustomizationConfig[K],
  ) {
    change({ ...config, [section]: value });
  }

  function addAsset(asset: AdminStoreAssetItem) {
    setAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)]);
  }

  function removeAsset(assetId: string) {
    setAssets((current) => current.filter((item) => item.id !== assetId));
    const identity = { ...config.identity };
    let referenced = false;
    for (const field of [
      'logoAssetId',
      'logoDarkAssetId',
      'coverAssetId',
      'faviconAssetId',
      'socialImageAssetId',
    ] as const) {
      if (identity[field] === assetId) {
        identity[field] = null;
        referenced = true;
      }
    }
    const categoryImages = config.categoryImages.filter((item) => item.assetId !== assetId);
    if (categoryImages.length !== config.categoryImages.length) referenced = true;
    if (referenced) change({ ...config, identity, categoryImages });
  }

  function requireReason(): boolean {
    if (reason.trim().length >= 3) return true;
    setFeedback({ tone: 'error', message: 'Informe um motivo com pelo menos 3 caracteres.' });
    return false;
  }

  function saveDraft() {
    startTransition(async () => {
      const result = await saveCustomizationDraftAction(tenantId, storeId, {
        config,
        expectedDraftVersion: draftVersion,
      });
      if (!result.success) {
        setFeedback({ tone: 'error', message: errorMessage(result) });
        return;
      }
      setDraftVersion(result.data.draftVersion);
      setHasDraft(true);
      setDirty(false);
      setFeedback({ tone: 'success', message: 'Rascunho salvo com segurança.' });
      router.refresh();
    });
  }

  function discardDraft() {
    if (!window.confirm('Descartar o rascunho e voltar para a versão publicada?')) return;
    startTransition(async () => {
      const result = await discardCustomizationDraftAction(tenantId, storeId, draftVersion);
      if (!result.success) {
        setFeedback({ tone: 'error', message: errorMessage(result) });
        return;
      }
      setConfig(structuredClone(publishedConfig));
      setDraftVersion(result.data.draftVersion);
      setHasDraft(false);
      setDirty(false);
      setFeedback({ tone: 'success', message: 'Rascunho descartado.' });
      router.refresh();
    });
  }

  function publish() {
    if (!requireReason()) return;
    startTransition(async () => {
      const result = await publishCustomizationAction(tenantId, storeId, {
        expectedDraftVersion: draftVersion,
        reason,
      });
      if (!result.success) {
        setFeedback({ tone: 'error', message: errorMessage(result) });
        return;
      }
      setDraftVersion(result.data.draftVersion);
      setPublishedVersion(result.data.publishedVersion);
      setPublishedConfig(structuredClone(config));
      setHasDraft(false);
      setDirty(false);
      setReason('');
      setFeedback({ tone: 'success', message: 'Personalização publicada.' });
      router.refresh();
    });
  }

  function restoreDefault() {
    if (!requireReason()) return;
    if (!window.confirm('Criar um novo rascunho com a configuração padrão?')) return;
    startTransition(async () => {
      const result = await restoreDefaultCustomizationAction(tenantId, storeId, {
        expectedDraftVersion: draftVersion,
        reason,
      });
      if (!result.success) {
        setFeedback({ tone: 'error', message: errorMessage(result) });
        return;
      }
      setDraftVersion(result.data.draftVersion);
      setHasDraft(true);
      setDirty(false);
      setFeedback({
        tone: 'success',
        message: 'Padrão restaurado como rascunho. Recarregando o editor…',
      });
      router.refresh();
    });
  }

  function restoreRevision(revision: RevisionItem) {
    if (!requireReason()) return;
    if (!window.confirm(`Restaurar a versão ${revision.version} como novo rascunho?`)) return;
    startTransition(async () => {
      const result = await restoreCustomizationRevisionAction(tenantId, storeId, revision.id, {
        expectedDraftVersion: draftVersion,
        reason,
      });
      if (!result.success) {
        setFeedback({ tone: 'error', message: errorMessage(result) });
        return;
      }
      setDraftVersion(result.data.draftVersion);
      setHasDraft(true);
      setDirty(false);
      setFeedback({
        tone: 'success',
        message: `Versão ${revision.version} restaurada como rascunho.`,
      });
      router.refresh();
    });
  }

  function applyPresetProposal() {
    const replacePalette = window.confirm(
      'Aplicar também as cores sugeridas? Cancelar preserva a paleta atual e aplica layout e tipografia.',
    );
    change(applyVisualPreset(config, selectedPreset, replacePalette));
  }

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 pb-24 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)] xl:pb-0">
      <div className="order-2 min-w-0 space-y-6 xl:order-1">
        <section className="border-border bg-surface rounded-xl border p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-text-primary font-semibold">Estado da personalização</h2>
              <p className="text-text-secondary mt-1 text-sm">
                Versão publicada {publishedVersion} · draft {draftVersion}
                {publishedAt
                  ? ` · publicada em ${new Date(publishedAt).toLocaleString('pt-BR')}`
                  : ''}
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                dirty
                  ? 'bg-warning-light text-warning'
                  : hasDraft
                    ? 'bg-info-light text-info'
                    : 'bg-success-light text-success'
              }`}
            >
              {dirty ? 'Alterações não salvas' : hasDraft ? 'Rascunho salvo' : 'Publicado'}
            </span>
          </div>
          {feedback && (
            <p
              role="status"
              className={`mt-4 rounded-lg p-3 text-sm ${
                feedback.tone === 'success'
                  ? 'bg-success-light text-success'
                  : 'bg-error-light text-error'
              }`}
            >
              {feedback.message}
            </p>
          )}
        </section>

        <section className="border-border bg-surface rounded-xl border p-5">
          <h2 className="text-text-primary font-semibold">Publicação e recuperação</h2>
          <p className="text-text-secondary mt-1 text-sm">
            Registre o motivo antes de publicar ou restaurar uma versão. O histórico ficará
            disponível para auditoria.
          </p>
          <label className="text-text-secondary mt-4 grid gap-1.5 text-sm">
            Motivo da alteração
            <textarea
              value={reason}
              maxLength={500}
              rows={3}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Ex.: atualização da campanha de inverno"
              className="border-border bg-surface text-text-primary placeholder:text-text-muted min-h-24 rounded-md border px-3 py-2.5"
            />
          </label>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              disabled={isPending || !hasDraft}
              onClick={discardDraft}
              className="border-border text-text-secondary hover:bg-surface-secondary inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-4 text-sm disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" /> Descartar rascunho
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={restoreDefault}
              className="border-border text-text-secondary hover:bg-surface-secondary inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-4 text-sm disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" /> Restaurar configuração padrão
            </button>
          </div>
        </section>

        <CustomizationGroup
          title="Identidade e aparência"
          description="Defina textos, cores, tipografia e a estrutura visual do cardápio."
          defaultOpen
        >
          <section className="border-border bg-surface rounded-xl border p-5 shadow-sm">
            <h3 className="text-text-primary text-lg font-semibold">Identidade</h3>
            <p className="text-text-secondary mt-1 text-sm">
              O nome oficial continua vindo da loja.
            </p>
            <div className="mt-5 grid gap-4">
              <label className="text-text-secondary grid min-w-0 gap-1.5 text-sm">
                Slogan
                <input
                  value={config.identity.slogan}
                  maxLength={120}
                  onChange={(event) =>
                    updateSection('identity', { ...config.identity, slogan: event.target.value })
                  }
                  className="border-border bg-surface text-text-primary min-h-11 w-full min-w-0 rounded-md border px-3 py-2"
                />
              </label>
              <label className="text-text-secondary grid min-w-0 gap-1.5 text-sm">
                Descrição curta
                <textarea
                  value={config.identity.shortDescription}
                  maxLength={240}
                  rows={2}
                  onChange={(event) =>
                    updateSection('identity', {
                      ...config.identity,
                      shortDescription: event.target.value,
                    })
                  }
                  className="border-border bg-surface text-text-primary w-full min-w-0 rounded-md border px-3 py-2"
                />
              </label>
              <label className="text-text-secondary grid min-w-0 gap-1.5 text-sm">
                Sobre a loja
                <textarea
                  value={config.identity.aboutText}
                  maxLength={2000}
                  rows={5}
                  onChange={(event) =>
                    updateSection('identity', { ...config.identity, aboutText: event.target.value })
                  }
                  className="border-border bg-surface text-text-primary w-full min-w-0 rounded-md border px-3 py-2"
                />
              </label>
            </div>
          </section>

          <section className="border-border bg-surface rounded-xl border p-5 shadow-sm">
            <h3 className="text-text-primary text-lg font-semibold">Cores</h3>
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {(Object.keys(PALETTE_LABELS) as (keyof typeof PALETTE_LABELS)[]).map((key) => (
                <label key={key} className="text-text-secondary grid gap-1.5 text-sm">
                  {PALETTE_LABELS[key]}
                  <span className="flex gap-2">
                    <input
                      type="color"
                      value={config.palette[key]}
                      onChange={(event) =>
                        updateSection('palette', { ...config.palette, [key]: event.target.value })
                      }
                      className="border-border h-11 w-12 rounded-md border p-1"
                    />
                    <input
                      value={config.palette[key]}
                      maxLength={7}
                      onChange={(event) =>
                        updateSection('palette', { ...config.palette, [key]: event.target.value })
                      }
                      className="border-border bg-surface text-text-primary min-h-11 min-w-0 flex-1 rounded-md border px-3 py-2 font-mono uppercase"
                    />
                  </span>
                </label>
              ))}
            </div>
            {contrastIssues.length > 0 && (
              <div className="bg-warning-light text-warning mt-5 rounded-lg p-4 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4" /> Revisão de contraste
                </div>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {contrastIssues.map((item) => (
                    <li key={item.pair}>{item.message}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="border-border bg-surface rounded-xl border p-5 shadow-sm">
            <h3 className="text-text-primary text-lg font-semibold">Tipografia, tema e layout</h3>
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="text-text-secondary grid gap-1.5 text-sm">
                Fonte dos títulos
                <select
                  disabled={!initialEntitlement.advancedTypographyEnabled}
                  value={config.typography.headingFontKey}
                  onChange={(event) =>
                    updateSection('typography', {
                      ...config.typography,
                      headingFontKey: event.target.value as 'inter' | 'bricolage',
                    })
                  }
                  className="border-border bg-surface text-text-primary min-h-11 rounded-md border px-3 py-2"
                >
                  <option value="bricolage">Bricolage Grotesque</option>
                  <option value="inter">Inter</option>
                </select>
              </label>
              <label className="text-text-secondary grid gap-1.5 text-sm">
                Fonte do texto
                <select
                  disabled={!initialEntitlement.advancedTypographyEnabled}
                  value={config.typography.bodyFontKey}
                  onChange={(event) =>
                    updateSection('typography', {
                      ...config.typography,
                      bodyFontKey: event.target.value as 'inter' | 'bricolage',
                    })
                  }
                  className="border-border bg-surface text-text-primary min-h-11 rounded-md border px-3 py-2"
                >
                  <option value="inter">Inter</option>
                  <option value="bricolage">Bricolage Grotesque</option>
                </select>
              </label>
              <label className="text-text-secondary grid gap-1.5 text-sm">
                Estrutura
                <select
                  value={config.theme.layoutTemplate}
                  onChange={(event) =>
                    updateSection('theme', {
                      ...config.theme,
                      layoutTemplate: event.target
                        .value as StoreCustomizationConfig['theme']['layoutTemplate'],
                    })
                  }
                  className="border-border bg-surface text-text-primary min-h-11 rounded-md border px-3 py-2"
                >
                  {LAYOUT_TEMPLATES.filter((layout) =>
                    initialEntitlement.allowedLayoutTemplates.includes(layout),
                  ).map((layout) => (
                    <option key={layout} value={layout}>
                      {LAYOUT_LABELS[layout]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid min-w-0 gap-1.5">
                <label htmlFor="visual-preset" className="text-text-secondary text-sm">
                  Preset visual
                </label>
                <div className="flex min-w-0 gap-2">
                  <select
                    id="visual-preset"
                    value={selectedPreset}
                    onChange={(event) => setSelectedPreset(event.target.value as VisualPreset)}
                    className="border-border bg-surface text-text-primary min-h-11 min-w-0 flex-1 rounded-md border px-3 py-2"
                  >
                    {VISUAL_PRESETS.filter((preset) =>
                      initialEntitlement.allowedVisualPresets.includes(preset),
                    ).map((preset) => (
                      <option key={preset}>{preset}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={applyPresetProposal}
                    className="border-border hover:bg-surface-secondary min-h-11 rounded-md border px-3 text-sm"
                  >
                    Aplicar
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(
                [
                  ['showCover', 'Exibir capa'],
                  ['showSlogan', 'Exibir slogan'],
                  ['showSearch', 'Exibir busca'],
                  ['showFeaturedProducts', 'Exibir destaques'],
                  ['showCategoryDescription', 'Exibir descrição das categorias'],
                  ['showProductImages', 'Exibir imagens dos produtos'],
                  ['showProductBadges', 'Exibir indicadores dos produtos'],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="text-text-secondary flex min-h-11 items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={config.layout[key]}
                    onChange={(event) =>
                      updateSection('layout', { ...config.layout, [key]: event.target.checked })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </section>
        </CustomizationGroup>

        <CustomizationGroup
          title="Conteúdo visual"
          description="Organize imagens da marca, categorias e banners promocionais."
          defaultOpen
        >
          <StoreAssetsManager
            tenantId={tenantId}
            storeId={storeId}
            identity={config.identity}
            assets={assets}
            onAssetUploaded={addAsset}
            onAssetDeleted={removeAsset}
            onAssign={(field, assetId) =>
              updateSection('identity', { ...config.identity, [field]: assetId })
            }
          />

          <StoreCategoryImagesManager
            tenantId={tenantId}
            storeId={storeId}
            categories={destinations.categories}
            assets={assets}
            showImages={config.layout.showCategoryImages}
            associations={config.categoryImages}
            onShowImagesChange={(showCategoryImages) =>
              updateSection('layout', { ...config.layout, showCategoryImages })
            }
            onAssociationsChange={(categoryImages) => change({ ...config, categoryImages })}
            onAssetUploaded={addAsset}
          />

          <StoreBannersManager
            tenantId={tenantId}
            storeId={storeId}
            initialBanners={initialBanners}
            assets={assets}
            destinations={destinations}
            maxBanners={initialEntitlement.maxBanners}
            scheduledEnabled={initialEntitlement.scheduledBannersEnabled}
          />
        </CustomizationGroup>

        <CustomizationGroup
          title="Endereço e descoberta"
          description="Configure como a loja aparece em buscadores e quais endereços públicos utiliza."
        >
          <section className="border-border bg-surface rounded-xl border p-5 shadow-sm">
            <h3 className="text-text-primary text-lg font-semibold">Busca e marca</h3>
            <div className="mt-5 grid gap-4">
              <label className="text-text-secondary grid gap-1.5 text-sm">
                Título SEO
                <input
                  value={config.seo.title}
                  maxLength={70}
                  onChange={(event) =>
                    updateSection('seo', { ...config.seo, title: event.target.value })
                  }
                  className="border-border bg-surface text-text-primary min-h-11 rounded-md border px-3 py-2"
                />
              </label>
              <label className="text-text-secondary grid gap-1.5 text-sm">
                Descrição SEO
                <textarea
                  value={config.seo.description}
                  maxLength={160}
                  rows={3}
                  onChange={(event) =>
                    updateSection('seo', { ...config.seo, description: event.target.value })
                  }
                  className="border-border bg-surface text-text-primary min-h-11 rounded-md border px-3 py-2"
                />
              </label>
              <label className="text-text-secondary grid gap-1.5 text-sm">
                URL canônica
                <input
                  type="url"
                  value={config.seo.canonicalUrl ?? ''}
                  onChange={(event) =>
                    updateSection('seo', {
                      ...config.seo,
                      canonicalUrl: event.target.value || null,
                    })
                  }
                  placeholder="https://exemplo.com/cardapio"
                  className="border-border bg-surface text-text-primary min-h-11 rounded-md border px-3 py-2"
                />
              </label>
              <label className="text-text-secondary flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={config.seo.indexable}
                  onChange={(event) =>
                    updateSection('seo', { ...config.seo, indexable: event.target.checked })
                  }
                />
                Permitir indexação por buscadores
              </label>
              <label className="text-text-secondary flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={config.platformBranding.showPedidoLocalBranding}
                  disabled={!initialEntitlement.platformBrandingRemovalEnabled}
                  onChange={(event) =>
                    updateSection('platformBranding', {
                      showPedidoLocalBranding: event.target.checked,
                    })
                  }
                />
                Exibir “Tecnologia por PedidoLocal”
              </label>
              <p className="text-text-muted text-xs">
                A remoção só é aceita pelo servidor quando o entitlement estiver habilitado.
              </p>
            </div>
          </section>

          <StoreDomainsManager
            tenantId={tenantId}
            storeId={storeId}
            storeSlug={storeSlug}
            initialDomains={initialDomains}
            customDomainEnabled={initialEntitlement.customDomainEnabled}
          />
        </CustomizationGroup>

        <CustomizationGroup
          title="Plano, recursos e histórico"
          description="Consulte limites, libere recursos e recupere versões publicadas."
        >
          <StoreEntitlementsForm
            tenantId={tenantId}
            storeId={storeId}
            initialEntitlement={initialEntitlement}
          />

          <section className="border-border bg-surface rounded-xl border p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <History className="text-brand-600 h-5 w-5" aria-hidden="true" />
              <h3 className="text-text-primary text-lg font-semibold">Histórico publicado</h3>
            </div>
            <ul className="divide-border mt-4 divide-y">
              {revisions.map((revision) => (
                <li
                  key={revision.id}
                  className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center"
                >
                  <div>
                    <p className="text-text-primary text-sm font-medium">
                      Versão {revision.version} · {revision.origin}
                    </p>
                    <p className="text-text-secondary mt-1 text-sm">{revision.reason}</p>
                    <p className="text-text-muted mt-1 text-xs">
                      {new Date(revision.publishedAt).toLocaleString('pt-BR')} ·{' '}
                      {revision.actor?.email ?? 'Sistema'}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => restoreRevision(revision)}
                    className="border-border text-text-secondary hover:bg-surface-secondary min-h-11 rounded-md border px-3 py-2 text-sm disabled:opacity-50"
                  >
                    Restaurar como rascunho
                  </button>
                </li>
              ))}
              {revisions.length === 0 && (
                <li className="text-text-muted py-6 text-sm">Nenhuma publicação registrada.</li>
              )}
            </ul>
          </section>
        </CustomizationGroup>
      </div>

      <aside className="order-1 min-w-0 space-y-5 xl:sticky xl:top-6 xl:order-2 xl:self-start">
        <StorefrontPreview
          config={deferredConfig}
          storeName={storeName}
          storeStatus={storeStatus}
          logoUrl={logoUrl}
          coverUrl={coverUrl}
          categories={destinations.categories}
          assets={assets}
        />

        <section className="border-border bg-surface rounded-xl border p-5 shadow-sm">
          <h2 className="text-text-primary font-semibold">Aplicar alterações</h2>
          <p className="text-text-secondary mt-1 text-sm">
            Salve o rascunho antes de publicar a nova versão.
          </p>
          <div className="mt-4 grid gap-2">
            <button
              type="button"
              disabled={isPending || !dirty}
              onClick={saveDraft}
              className={cn(
                'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-4 text-sm font-medium disabled:opacity-50',
                dirty
                  ? 'border-brand-600 bg-brand-600 hover:bg-brand-700 text-white'
                  : 'border-border text-text-secondary',
              )}
            >
              <Save className="h-4 w-4" /> Salvar rascunho
            </button>
            <button
              type="button"
              disabled={isPending || dirty || !hasDraft || criticalContrast.length > 0}
              onClick={publish}
              className={cn(
                'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-4 text-sm font-medium disabled:opacity-50',
                hasDraft && !dirty && criticalContrast.length === 0
                  ? 'border-brand-600 bg-brand-600 hover:bg-brand-700 text-white'
                  : 'border-border text-text-secondary',
              )}
            >
              <Send className="h-4 w-4" /> Publicar
            </button>
          </div>
          {criticalContrast.length === 0 ? (
            <p className="text-success mt-3 flex items-center gap-1.5 text-xs">
              <Check className="h-3.5 w-3.5" /> Sem contraste crítico.
            </p>
          ) : (
            <p className="text-error mt-3 text-xs">
              A publicação está bloqueada por contraste crítico.
            </p>
          )}
        </section>
      </aside>

      <div className="border-border bg-surface fixed inset-x-0 bottom-0 z-30 border-t px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_8px_rgba(0,0,0,0.08)] xl:hidden">
        <div className="mx-auto grid max-w-xl grid-cols-2 gap-2">
          <button
            type="button"
            disabled={isPending || !dirty}
            onClick={saveDraft}
            className={cn(
              'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium disabled:opacity-50',
              dirty
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-border text-text-secondary',
            )}
          >
            <Save className="h-4 w-4" /> Salvar
          </button>
          <button
            type="button"
            disabled={isPending || dirty || !hasDraft || criticalContrast.length > 0}
            onClick={publish}
            className={cn(
              'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium disabled:opacity-50',
              hasDraft && !dirty && criticalContrast.length === 0
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-border text-text-secondary',
            )}
          >
            <Send className="h-4 w-4" /> Publicar
          </button>
        </div>
      </div>
    </div>
  );
}
