'use client';

import {
  Check,
  CircleCheck,
  Gift,
  LoaderCircle,
  Package,
  Percent,
  RotateCcw,
  WalletCards,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';

import { FieldMessage } from '@/components/shared/form-message';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { saveLoyaltyProgramAction } from '@/features/loyalty/actions';
import { fieldErrorsFromDetails } from '@/lib/form-errors';
import { formatCurrency } from '@/lib/utils';
import {
  loyaltyProgramInputSchema,
  type LoyaltyProgramInput,
  type LoyaltyRewardType,
} from '@/schemas/loyalty';

function centsToInput(value: number | null | undefined) {
  return value == null ? '' : (value / 100).toFixed(2).replace('.', ',');
}

function inputToCents(value: string) {
  const compact = value.trim().replace(/\s/g, '');
  if (!compact) return null;
  const normalized = compact.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(?:\.\d{0,2})?$/u.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? Math.round(number * 100) : null;
}

function inputToPercentage(value: string) {
  const number = Number(value.trim().replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

type Program = {
  version?: number;
  requiredOrders: number;
  rewardType: LoyaltyRewardType;
  rewardValue: number | null;
  percentageBasisPoints: number | null;
  maximumDiscountValue: number | null;
  freeProductId: string | null;
  freeProductNameSnapshot: string | null;
  validityDays: number | null;
  minimumOrderValue: number;
  isActive: boolean;
};

type ProductOption = { id: string; name: string; basePrice: number; isSoldOut: boolean };

type DraftSnapshot = {
  requiredOrders: string;
  rewardType: LoyaltyRewardType;
  rewardValue: string;
  percentage: string;
  maximumDiscount: string;
  freeProductId: string;
  minimumOrderValue: string;
  validityDays: 30 | 60 | 90 | null;
  isActive: boolean;
};

type FieldErrors = Record<string, string[]>;
type TemplateId = 'SIMPLE' | 'HOUSE_TREAT' | 'FREQUENT';

const TYPES = [
  { value: 'FIXED_DISCOUNT', label: 'R$ de desconto', icon: WalletCards },
  { value: 'PERCENT_DISCOUNT', label: '% de desconto', icon: Percent },
  { value: 'FREE_PRODUCT', label: 'Produto grátis', icon: Package },
] as const;

const FIELD_IDS: Record<string, string> = {
  requiredOrders: 'loyalty-required-orders',
  rewardValue: 'loyalty-reward-value',
  percentageBasisPoints: 'loyalty-percentage',
  maximumDiscountValue: 'loyalty-maximum-discount',
  freeProductId: 'loyalty-free-product',
  minimumOrderValue: 'loyalty-minimum-order',
};

function draftFromProgram(initial: Program | null, advancedEnabled: boolean): DraftSnapshot {
  const validity = initial?.validityDays;
  return {
    requiredOrders: String(initial?.requiredOrders ?? 5),
    rewardType: advancedEnabled ? (initial?.rewardType ?? 'FIXED_DISCOUNT') : 'FIXED_DISCOUNT',
    rewardValue: centsToInput(initial?.rewardValue ?? 1000),
    percentage: String((initial?.percentageBasisPoints ?? 1500) / 100),
    maximumDiscount: centsToInput(initial?.maximumDiscountValue),
    freeProductId: initial?.freeProductId ?? '',
    minimumOrderValue: centsToInput(initial?.minimumOrderValue ?? 3000),
    validityDays:
      advancedEnabled &&
      (validity === 30 || validity === 60 || validity === 90 || validity === null)
        ? validity
        : advancedEnabled
          ? 30
          : null,
    isActive: initial?.isActive ?? false,
  };
}

function snapshotKey(snapshot: DraftSnapshot) {
  return JSON.stringify(snapshot);
}

function benefitSummary(
  draft: DraftSnapshot,
  products: ProductOption[],
  fallbackProductName?: string | null,
) {
  if (draft.rewardType === 'FIXED_DISCOUNT') {
    const value = inputToCents(draft.rewardValue);
    return value == null ? 'desconto a definir' : `${formatCurrency(value)} de desconto`;
  }
  if (draft.rewardType === 'PERCENT_DISCOUNT') {
    const percentage = inputToPercentage(draft.percentage);
    const maximum = inputToCents(draft.maximumDiscount);
    return percentage == null
      ? 'percentual a definir'
      : `${percentage}% de desconto${maximum == null ? '' : `, até ${formatCurrency(maximum)}`}`;
  }
  const product = products.find((candidate) => candidate.id === draft.freeProductId);
  return `${product?.name ?? fallbackProductName ?? 'produto a definir'} grátis`;
}

function buildInput(draft: DraftSnapshot, advancedEnabled: boolean): LoyaltyProgramInput {
  const rewardValue = inputToCents(draft.rewardValue);
  const percentage = inputToPercentage(draft.percentage);
  const maximumDiscount = inputToCents(draft.maximumDiscount);
  const minimumOrderValue = inputToCents(draft.minimumOrderValue);
  return {
    requiredOrders: Number(draft.requiredOrders) || 0,
    rewardType: draft.rewardType,
    rewardValue: draft.rewardType === 'FIXED_DISCOUNT' ? (rewardValue ?? -1) : null,
    percentageBasisPoints:
      draft.rewardType === 'PERCENT_DISCOUNT' ? Math.round((percentage ?? 0) * 100) : null,
    maximumDiscountValue:
      draft.rewardType === 'PERCENT_DISCOUNT' && draft.maximumDiscount.trim()
        ? (maximumDiscount ?? -1)
        : null,
    freeProductId: draft.rewardType === 'FREE_PRODUCT' ? draft.freeProductId || null : null,
    validityDays: advancedEnabled ? draft.validityDays : null,
    minimumOrderValue: minimumOrderValue ?? -1,
    isActive: draft.isActive,
  };
}

function validateDraft(draft: DraftSnapshot, advancedEnabled: boolean, products: ProductOption[]) {
  const parsed = loyaltyProgramInputSchema.safeParse(buildInput(draft, advancedEnabled));
  const errors: FieldErrors = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path.join('.');
      if (!field) continue;
      errors[field] = [...(errors[field] ?? []), issue.message];
    }
  }
  if (inputToCents(draft.minimumOrderValue) == null) {
    errors.minimumOrderValue = ['Informe um pedido mínimo válido, usando reais e centavos.'];
  }
  if (draft.rewardType === 'FIXED_DISCOUNT' && inputToCents(draft.rewardValue) == null) {
    errors.rewardValue = ['Informe o valor do desconto usando reais e centavos.'];
  }
  if (draft.rewardType === 'PERCENT_DISCOUNT' && inputToPercentage(draft.percentage) == null) {
    errors.percentageBasisPoints = ['Informe um percentual válido entre 1% e 50%.'];
  }
  if (
    draft.rewardType === 'PERCENT_DISCOUNT' &&
    draft.maximumDiscount.trim() &&
    inputToCents(draft.maximumDiscount) == null
  ) {
    errors.maximumDiscountValue = ['Informe um limite válido usando reais e centavos.'];
  }
  const selectedProduct = products.find((product) => product.id === draft.freeProductId);
  if (draft.rewardType === 'FREE_PRODUCT' && selectedProduct?.isSoldOut) {
    errors.freeProductId = ['Escolha um produto disponível agora.'];
  }
  return errors;
}

export function LoyaltyProgramForm({
  initial,
  canEdit,
  advancedEnabled,
  products,
}: {
  initial: Program | null;
  canEdit: boolean;
  advancedEnabled: boolean;
  products: ProductOption[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const initialDraft = useMemo(
    () => draftFromProgram(initial, advancedEnabled),
    [advancedEnabled, initial],
  );
  const [draft, setDraft] = useState(initialDraft);
  const [publishedDraft, setPublishedDraft] = useState<DraftSnapshot | null>(
    initial ? initialDraft : null,
  );
  const [publishedVersion, setPublishedVersion] = useState(initial?.version ?? null);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();
  const eligibleProducts = products.filter((product) => !product.isSoldOut);
  const selectedProduct = products.find((product) => product.id === draft.freeProductId);
  const isDirty = publishedDraft == null || snapshotKey(draft) !== snapshotKey(publishedDraft);
  const dirtyRef = useRef(isDirty);

  useEffect(() => {
    dirtyRef.current = isDirty;
  }, [isDirty]);

  const preview = useMemo(() => {
    const orders = Number(draft.requiredOrders);
    const minimum = inputToCents(draft.minimumOrderValue);
    return {
      orders: Number.isInteger(orders) && orders > 0 ? orders : null,
      minimum,
      benefit: benefitSummary(draft, products, initial?.freeProductNameSnapshot),
    };
  }, [draft, initial?.freeProductNameSnapshot, products]);

  const templates = useMemo(
    () => [
      {
        id: 'SIMPLE' as const,
        label: 'Simples',
        summary: '5 pedidos · R$ 10 · mínimo de R$ 30 · 30 dias',
      },
      {
        id: 'HOUSE_TREAT' as const,
        label: 'Mimo da casa',
        summary:
          eligibleProducts.length > 0
            ? `5 pedidos · ${eligibleProducts[0]!.name} grátis · mínimo de R$ 30 · 30 dias`
            : 'Disponibilize um produto para usar esta estratégia',
      },
      {
        id: 'FREQUENT' as const,
        label: 'Cliente frequente',
        summary: '8 pedidos · 15% até R$ 20 · mínimo de R$ 40 · 60 dias',
      },
    ],
    [eligibleProducts],
  );

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const followLink = (event: MouseEvent) => {
      if (!dirtyRef.current || event.defaultPrevented || event.button !== 0) return;
      const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(target instanceof HTMLAnchorElement) || target.target === '_blank') return;
      const url = new URL(target.href, window.location.href);
      if (url.origin !== window.location.origin || url.href === window.location.href) return;
      if (window.confirm('Há alterações não salvas na fidelidade. Deseja sair sem publicar?')) {
        dirtyRef.current = false;
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', followLink, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', followLink, true);
    };
  }, []);

  function changeField<K extends keyof DraftSnapshot>(field: K, value: DraftSnapshot[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
    setSelectedTemplate(null);
    setFeedback(null);
    const errorField =
      field === 'percentage'
        ? 'percentageBasisPoints'
        : field === 'maximumDiscount'
          ? 'maximumDiscountValue'
          : field;
    setFieldErrors((current) => {
      if (!current[errorField]) return current;
      const next = { ...current };
      delete next[errorField];
      return next;
    });
  }

  function applyTemplate(template: TemplateId) {
    const base: DraftSnapshot = {
      ...draft,
      rewardValue: '10,00',
      percentage: '15',
      maximumDiscount: '',
      freeProductId: '',
      minimumOrderValue: '30,00',
      validityDays: 30,
    };
    const next =
      template === 'SIMPLE'
        ? { ...base, requiredOrders: '5', rewardType: 'FIXED_DISCOUNT' as const }
        : template === 'HOUSE_TREAT'
          ? {
              ...base,
              requiredOrders: '5',
              rewardType: 'FREE_PRODUCT' as const,
              freeProductId: eligibleProducts[0]?.id ?? '',
            }
          : {
              ...base,
              requiredOrders: '8',
              rewardType: 'PERCENT_DISCOUNT' as const,
              percentage: '15',
              maximumDiscount: '20,00',
              minimumOrderValue: '40,00',
              validityDays: 60 as const,
            };
    setDraft(next);
    setSelectedTemplate(template);
    setFieldErrors({});
    setFeedback(null);
  }

  function restorePublished() {
    if (!publishedDraft) return;
    setDraft(publishedDraft);
    setSelectedTemplate(null);
    setFieldErrors({});
    setFeedback(null);
  }

  function focusFirstInvalidField(errors: FieldErrors) {
    const firstField = Object.keys(errors)[0];
    if (!firstField) return;
    requestAnimationFrame(() => {
      const id = FIELD_IDS[firstField];
      const target = id
        ? document.getElementById(id)
        : formRef.current?.querySelector<HTMLElement>(`[name="${CSS.escape(firstField)}"]`);
      target?.focus();
    });
  }

  function save() {
    setFeedback(null);
    const localErrors = validateDraft(draft, advancedEnabled, products);
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      setFeedback({
        tone: 'error',
        text: 'Revise os campos destacados. Sua configuração ainda não foi publicada.',
      });
      focusFirstInvalidField(localErrors);
      return;
    }
    const input = buildInput(draft, advancedEnabled);
    startTransition(async () => {
      const result = await saveLoyaltyProgramAction(input);
      if (!result.success) {
        const nextErrors = fieldErrorsFromDetails(result.error.details);
        setFieldErrors(nextErrors);
        setFeedback({ tone: 'error', text: result.error.message });
        focusFirstInvalidField(nextErrors);
        return;
      }
      setPublishedDraft(draft);
      setPublishedVersion((current) => (current ?? 0) + 1);
      setFieldErrors({});
      setFeedback({
        tone: 'success',
        text: draft.isActive
          ? 'Nova configuração publicada. A fidelidade está ativa.'
          : 'Nova configuração publicada. A fidelidade está pausada para novos pedidos.',
      });
      dirtyRef.current = false;
      router.refresh();
    });
  }

  const publishedStatus = !publishedDraft
    ? 'Ainda não publicada'
    : publishedDraft.isActive
      ? 'Publicada e ativa'
      : 'Publicada e pausada';

  return (
    <section
      className="border-border bg-surface rounded-xl border p-4 sm:p-6"
      aria-labelledby="loyalty-config-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 id="loyalty-config-title" className="text-lg font-bold">
            Sua regra de fidelidade
          </h2>
          <p className="text-text-secondary mt-1 text-sm">
            Configure a promessa que seus clientes verão. Nada muda na loja até você publicar.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span
            className={`${publishedDraft?.isActive ? 'bg-success-light text-success' : 'bg-surface-secondary text-text-secondary'} rounded-full px-3 py-1.5`}
          >
            {publishedStatus}
          </span>
          {publishedVersion ? (
            <span className="text-text-secondary">Versão {publishedVersion}</span>
          ) : null}
          {isDirty ? (
            <span className="bg-warning-light text-text-primary rounded-full px-3 py-1.5">
              Alterações pendentes
            </span>
          ) : null}
        </div>
      </div>

      <form
        ref={formRef}
        className="mt-6"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        {advancedEnabled ? (
          <section aria-labelledby="loyalty-strategies-title">
            <h3 id="loyalty-strategies-title" className="text-sm font-bold">
              Comece com uma estratégia completa
            </h3>
            <p className="text-text-secondary mt-1 max-w-2xl text-sm">
              Aplicar substitui frequência, benefício, pedido mínimo e validade. A publicação
              continua sob seu controle.
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-3" role="group" aria-label="Estratégias">
              {templates.map((template) => {
                const selected = selectedTemplate === template.id;
                const unavailable = template.id === 'HOUSE_TREAT' && eligibleProducts.length === 0;
                return (
                  <Button
                    key={template.id}
                    type="button"
                    variant="outline"
                    aria-pressed={selected}
                    disabled={!canEdit || pending || unavailable}
                    onClick={() => applyTemplate(template.id)}
                    className={`${selected ? 'border-brand-600 bg-brand-50' : ''} h-auto min-h-20 justify-start px-4 py-3 text-left whitespace-normal`}
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 font-bold">
                        {selected ? <CircleCheck aria-hidden="true" /> : null}
                        {template.label}
                      </span>
                      <span className="text-text-secondary mt-1 block text-xs font-normal">
                        {template.summary}
                      </span>
                    </span>
                  </Button>
                );
              })}
            </div>
          </section>
        ) : null}

        <fieldset disabled={!canEdit || pending} className="mt-7 grid gap-6">
          <legend className="sr-only">Configuração da fidelidade</legend>

          <div className="bg-surface-secondary rounded-xl p-4">
            <div className="flex min-h-11 items-start gap-3 text-sm">
              <input
                id="loyalty-active"
                type="checkbox"
                name="isActive"
                checked={draft.isActive}
                onChange={(event) => changeField('isActive', event.target.checked)}
                aria-describedby="loyalty-active-help"
                className="mt-0.5 h-5 w-5"
              />
              <span>
                <label htmlFor="loyalty-active" className="cursor-pointer font-semibold">
                  Ativar esta configuração ao publicar
                </label>
                <span
                  id="loyalty-active-help"
                  className="text-text-secondary mt-1 block font-normal"
                >
                  Marcar aqui não altera a loja sozinho. A mudança só entra em vigor ao salvar.
                </span>
              </span>
            </div>
          </div>

          <div className="grid gap-2 text-sm font-semibold sm:grid-cols-[minmax(12rem,1fr)_10rem] sm:items-center">
            <label htmlFor={FIELD_IDS.requiredOrders}>A cada quantos pedidos?</label>
            <Input
              id={FIELD_IDS.requiredOrders}
              name="requiredOrders"
              type="number"
              min={2}
              max={20}
              inputMode="numeric"
              value={draft.requiredOrders}
              onChange={(event) => changeField('requiredOrders', event.target.value)}
              aria-invalid={Boolean(fieldErrors.requiredOrders)}
              aria-describedby={
                fieldErrors.requiredOrders
                  ? 'required-orders-help required-orders-error'
                  : 'required-orders-help'
              }
            />
            <span
              id="required-orders-help"
              className="text-text-secondary text-xs font-normal sm:col-span-2"
            >
              Use de 2 a 20. O pedido conta somente quando for concluído.
            </span>
            <span className="sm:col-span-2">
              <FieldMessage id="required-orders-error" errors={fieldErrors.requiredOrders} />
            </span>
          </div>

          {advancedEnabled ? (
            <fieldset>
              <legend className="text-sm font-semibold">Seu cliente ganha</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {TYPES.map((type) => (
                  <label
                    key={type.value}
                    className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm font-semibold ${draft.rewardType === type.value ? 'border-brand-600 bg-brand-50' : 'border-border'}`}
                  >
                    <input
                      type="radio"
                      name="rewardType"
                      value={type.value}
                      checked={draft.rewardType === type.value}
                      onChange={() => changeField('rewardType', type.value)}
                      className="h-5 w-5"
                    />
                    <type.icon className="size-5" aria-hidden="true" />
                    {type.label}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          {draft.rewardType === 'FIXED_DISCOUNT' ? (
            <MoneyField
              id={FIELD_IDS.rewardValue}
              name="rewardValue"
              label="Valor do desconto"
              value={draft.rewardValue}
              onChange={(value) => changeField('rewardValue', value)}
              errors={fieldErrors.rewardValue}
              hint="Use um valor entre R$ 1,00 e R$ 1.000,00."
            />
          ) : draft.rewardType === 'PERCENT_DISCOUNT' ? (
            <>
              <div className="grid gap-2 text-sm font-semibold sm:grid-cols-[minmax(12rem,1fr)_10rem] sm:items-center">
                <label htmlFor={FIELD_IDS.percentageBasisPoints}>Desconto</label>
                <span className="relative">
                  <Input
                    id={FIELD_IDS.percentageBasisPoints}
                    name="percentageBasisPoints"
                    type="number"
                    min={1}
                    max={50}
                    inputMode="decimal"
                    value={draft.percentage}
                    onChange={(event) => changeField('percentage', event.target.value)}
                    aria-invalid={Boolean(fieldErrors.percentageBasisPoints)}
                    aria-describedby={
                      fieldErrors.percentageBasisPoints
                        ? 'loyalty-percentage-help loyalty-percentage-error'
                        : 'loyalty-percentage-help'
                    }
                    className="pr-9 font-mono"
                  />
                  <span className="text-text-secondary pointer-events-none absolute top-3 right-3">
                    %
                  </span>
                </span>
                <span
                  id="loyalty-percentage-help"
                  className="text-text-secondary text-xs font-normal sm:col-span-2"
                >
                  Use um percentual entre 1% e 50%.
                </span>
                <span className="sm:col-span-2">
                  <FieldMessage
                    id="loyalty-percentage-error"
                    errors={fieldErrors.percentageBasisPoints}
                  />
                </span>
              </div>
              <MoneyField
                id={FIELD_IDS.maximumDiscountValue}
                name="maximumDiscountValue"
                label="Limite do desconto"
                optional
                value={draft.maximumDiscount}
                onChange={(value) => changeField('maximumDiscount', value)}
                errors={fieldErrors.maximumDiscountValue}
                hint="Deixe vazio para não limitar. Se informar, use de R$ 1,00 a R$ 1.000,00."
              />
            </>
          ) : (
            <div className="grid gap-2 text-sm font-semibold sm:grid-cols-[minmax(12rem,1fr)_minmax(12rem,20rem)] sm:items-center">
              <label htmlFor={FIELD_IDS.freeProductId}>Produto</label>
              <select
                id={FIELD_IDS.freeProductId}
                name="freeProductId"
                value={draft.freeProductId}
                onChange={(event) => changeField('freeProductId', event.target.value)}
                aria-invalid={Boolean(fieldErrors.freeProductId)}
                aria-describedby={
                  fieldErrors.freeProductId
                    ? 'loyalty-product-help loyalty-product-error'
                    : 'loyalty-product-help'
                }
                className="border-border bg-surface min-h-11 rounded-xl border px-3"
              >
                <option value="">Escolha um produto disponível</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id} disabled={product.isSoldOut}>
                    {product.name}
                    {product.isSoldOut ? ' — esgotado agora' : ''}
                  </option>
                ))}
              </select>
              <span
                id="loyalty-product-help"
                className="text-text-secondary text-xs font-normal sm:col-span-2"
              >
                O benefício cobre uma unidade do produto base. Adicionais continuam pagos.
              </span>
              {selectedProduct?.isSoldOut ? (
                <span className="text-warning text-sm font-medium sm:col-span-2">
                  O produto publicado está esgotado agora. Escolha outro antes de criar a nova
                  versão.
                </span>
              ) : null}
              <span className="sm:col-span-2">
                <FieldMessage id="loyalty-product-error" errors={fieldErrors.freeProductId} />
              </span>
            </div>
          )}

          <MoneyField
            id={FIELD_IDS.minimumOrderValue}
            name="minimumOrderValue"
            label="Pedido mínimo"
            value={draft.minimumOrderValue}
            onChange={(value) => changeField('minimumOrderValue', value)}
            errors={fieldErrors.minimumOrderValue}
            hint="Use R$ 0,00 quando o benefício puder ser aplicado em qualquer pedido."
          />

          {advancedEnabled ? (
            <fieldset>
              <legend className="text-sm font-semibold">O benefício pode ser usado por</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {([30, 60, 90, null] as const).map((days) => (
                  <label
                    key={days ?? 'none'}
                    className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm ${draft.validityDays === days ? 'border-brand-600 bg-brand-50 font-semibold' : 'border-border'}`}
                  >
                    <input
                      type="radio"
                      name="validityDays"
                      checked={draft.validityDays === days}
                      onChange={() => changeField('validityDays', days)}
                    />
                    {days ? `${days} dias` : 'Sem prazo'}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
        </fieldset>

        <section
          className="bg-surface-tertiary mt-7 rounded-xl p-4"
          aria-labelledby="preview-title"
        >
          <div className="flex items-start gap-3">
            <span className="bg-success-light text-success flex size-10 shrink-0 items-center justify-center rounded-full">
              <Gift aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <h3 id="preview-title" className="text-sm font-semibold">
                Prévia para o cliente
              </h3>
              <p className="mt-1 text-base font-bold">
                {preview.orders == null
                  ? 'Defina uma frequência válida para completar a promessa.'
                  : `A cada ${preview.orders} pedidos concluídos, você ganha ${preview.benefit}.`}{' '}
                {preview.minimum == null
                  ? 'Defina um pedido mínimo válido.'
                  : preview.minimum > 0
                    ? `Use em pedidos a partir de ${formatCurrency(preview.minimum)}.`
                    : 'Use no próximo pedido.'}
              </p>
              {advancedEnabled ? (
                <p className="text-text-secondary mt-1 text-sm">
                  {draft.validityDays
                    ? `O benefício fica disponível por ${draft.validityDays} dias.`
                    : 'O benefício não expira.'}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        {canEdit ? (
          <div className="mt-6">
            <div className="bg-info-light text-text-primary rounded-xl p-4 text-sm">
              <p className="font-semibold">
                {publishedDraft
                  ? 'Salvar publica uma nova versão da regra.'
                  : 'Salvar publica a primeira regra de fidelidade.'}
              </p>
              <p className="text-text-secondary mt-1">
                Quem já começou continua com a promessa anterior até concluir o ciclo. Pausar impede
                novos créditos, mas preserva benefícios já conquistados.
              </p>
            </div>
            {feedback ? (
              <p
                role={feedback.tone === 'error' ? 'alert' : 'status'}
                className={`${feedback.tone === 'error' ? 'bg-error-light text-error' : 'bg-success-light text-success'} mt-4 rounded-lg p-3 text-sm`}
              >
                {feedback.text}
              </p>
            ) : null}
            <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              {publishedDraft && isDirty ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={restorePublished}
                >
                  <RotateCcw aria-hidden="true" />
                  Restaurar versão publicada
                </Button>
              ) : null}
              <Button type="submit" disabled={pending || !isDirty}>
                {pending ? (
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                ) : (
                  <Check aria-hidden="true" />
                )}
                {pending
                  ? 'Publicando…'
                  : draft.isActive
                    ? 'Salvar e ativar fidelidade'
                    : 'Salvar como pausada'}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-text-secondary mt-6 text-sm">
            Somente o proprietário pode alterar esta regra.
          </p>
        )}
      </form>
    </section>
  );
}

function MoneyField({
  id,
  name,
  label,
  optional = false,
  value,
  onChange,
  errors,
  hint,
}: {
  id: string;
  name: string;
  label: string;
  optional?: boolean;
  value: string;
  onChange: (value: string) => void;
  errors?: string[];
  hint: string;
}) {
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  return (
    <div className="grid gap-2 text-sm font-semibold sm:grid-cols-[minmax(12rem,1fr)_10rem] sm:items-center">
      <label htmlFor={id}>
        {label}{' '}
        {optional ? <span className="text-text-secondary font-normal">(opcional)</span> : null}
      </label>
      <span className="relative">
        <span className="text-text-secondary pointer-events-none absolute top-3 left-3">R$</span>
        <Input
          id={id}
          name={name}
          className="pl-10 font-mono"
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={Boolean(errors)}
          aria-describedby={errors ? `${helpId} ${errorId}` : helpId}
        />
      </span>
      <span id={helpId} className="text-text-secondary text-xs font-normal sm:col-span-2">
        {hint}
      </span>
      <span className="sm:col-span-2">
        <FieldMessage id={errorId} errors={errors} />
      </span>
    </div>
  );
}
