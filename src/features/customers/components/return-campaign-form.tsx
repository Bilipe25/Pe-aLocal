'use client';

import { Gift, Percent, RotateCcw, Tag } from 'lucide-react';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createCustomerReturnCampaignAction } from '@/features/customers/actions';
import { formatCurrency } from '@/lib/utils';
import {
  customerReturnCampaignInputSchema,
  type CustomerReturnCampaignInput,
} from '@/schemas/customer-relationship';

type RewardType = CustomerReturnCampaignInput['rewardType'];

function reaisToCents(value: string) {
  const amount = Number(value.replace(',', '.'));
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

export function ReturnCampaignForm({
  audience,
  advancedEnabled,
  products,
}: {
  audience: { cooling: number; inactive: number; total: number };
  advancedEnabled: boolean;
  products: Array<{ id: string; name: string; basePrice: number }>;
}) {
  const [target, setTarget] = useState<CustomerReturnCampaignInput['target']>(
    audience.cooling > 0 && audience.inactive > 0
      ? 'COOLING_AND_INACTIVE'
      : audience.cooling > 0
        ? 'COOLING'
        : 'INACTIVE',
  );
  const [rewardType, setRewardType] = useState<RewardType>('FIXED_DISCOUNT');
  const [fixedValue, setFixedValue] = useState('5');
  const [percentage, setPercentage] = useState('10');
  const [freeProductId, setFreeProductId] = useState(products[0]?.id ?? '');
  const [minimumOrderValue, setMinimumOrderValue] = useState('35');
  const [validityDays, setValidityDays] = useState<7 | 14 | 30>(7);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(
    null,
  );
  const [reviewing, setReviewing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const selectedCount =
    target === 'COOLING'
      ? audience.cooling
      : target === 'INACTIVE'
        ? audience.inactive
        : audience.total;

  function campaignInput(): CustomerReturnCampaignInput {
    return {
      target,
      rewardType,
      rewardValue: rewardType === 'FIXED_DISCOUNT' ? reaisToCents(fixedValue) : null,
      percentageBasisPoints:
        rewardType === 'PERCENT_DISCOUNT' ? Math.round(Number(percentage) * 100) : null,
      maximumDiscountValue: null,
      freeProductId: rewardType === 'FREE_PRODUCT' ? freeProductId || null : null,
      minimumOrderValue: reaisToCents(minimumOrderValue),
      validityDays,
    };
  }

  function review() {
    setFeedback(null);
    const parsed = customerReturnCampaignInputSchema.safeParse(campaignInput());
    if (!parsed.success) {
      setFeedback({
        tone: 'error',
        message: parsed.error.issues[0]?.message ?? 'Revise os valores antes de continuar.',
      });
      return;
    }
    setReviewing(true);
  }

  function activate() {
    setFeedback(null);
    const input = campaignInput();
    startTransition(async () => {
      const result = await createCustomerReturnCampaignAction(input);
      if (!result.success) {
        setFeedback({ tone: 'error', message: result.error.message });
        return;
      }
      setFeedback({
        tone: 'success',
        message: `Campanha ativada para ${result.data.recipients} ${result.data.recipients === 1 ? 'cliente' : 'clientes'}.`,
      });
      setReviewing(false);
    });
  }

  const rewardLabel =
    rewardType === 'FIXED_DISCOUNT'
      ? `${formatCurrency(reaisToCents(fixedValue))} de desconto`
      : rewardType === 'PERCENT_DISCOUNT'
        ? `${Number(percentage) || 0}% de desconto`
        : `${products.find((product) => product.id === freeProductId)?.name ?? 'Produto'} grátis`;

  const rewardOptions = [
    { type: 'FIXED_DISCOUNT' as const, label: 'R$ de desconto', icon: Tag },
    ...(advancedEnabled
      ? [
          { type: 'PERCENT_DISCOUNT' as const, label: '% de desconto', icon: Percent },
          { type: 'FREE_PRODUCT' as const, label: 'Produto grátis', icon: Gift },
        ]
      : []),
  ];

  return (
    <section
      className="border-border bg-surface rounded-xl border p-4 sm:p-5"
      aria-labelledby="return-title"
    >
      <div className="flex items-start gap-3">
        <RotateCcw className="text-brand-600 mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          <h2 id="return-title" className="text-lg font-bold">
            Volta pra cá
          </h2>
          <p className="text-text-secondary mt-1 text-sm">
            Escolha quem precisa de atenção e ofereça um benefício simples.
          </p>
        </div>
      </div>

      {!reviewing ? (
        <>
          <fieldset className="mt-6">
            <legend className="font-semibold">Quem receberá</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {[
                { value: 'COOLING' as const, label: 'Estão sumindo', count: audience.cooling },
                {
                  value: 'INACTIVE' as const,
                  label: 'Não pedem há tempo',
                  count: audience.inactive,
                },
                {
                  value: 'COOLING_AND_INACTIVE' as const,
                  label: 'Os dois grupos',
                  count: audience.total,
                },
              ].map((option) => (
                <label
                  key={option.value}
                  className={`flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 ${
                    target === option.value
                      ? 'border-brand-500 bg-surface-tertiary'
                      : 'border-border hover:bg-surface-secondary'
                  }`}
                >
                  <span className="text-sm font-medium">{option.label}</span>
                  <span className="flex items-center gap-2">
                    <strong className="font-mono">{option.count}</strong>
                    <input
                      type="radio"
                      name="target"
                      value={option.value}
                      checked={target === option.value}
                      onChange={() => setTarget(option.value)}
                      disabled={option.count === 0}
                      className="accent-brand-600 size-5"
                    />
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-6">
            <legend className="font-semibold">O que oferecer</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {rewardOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <label
                    key={option.type}
                    className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
                      rewardType === option.type
                        ? 'border-brand-500 bg-surface-tertiary'
                        : 'border-border hover:bg-surface-secondary'
                    }`}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {option.label}
                    <input
                      type="radio"
                      name="rewardType"
                      value={option.type}
                      className="sr-only"
                      checked={rewardType === option.type}
                      onChange={() => setRewardType(option.type)}
                    />
                  </label>
                );
              })}
            </div>
            <div className="mt-4 max-w-sm">
              {rewardType === 'FIXED_DISCOUNT' ? (
                <label className="grid gap-1 text-sm font-medium">
                  Valor do desconto
                  <span className="relative">
                    <span className="text-text-secondary pointer-events-none absolute top-3 left-3">
                      R$
                    </span>
                    <Input
                      inputMode="decimal"
                      value={fixedValue}
                      onChange={(event) => setFixedValue(event.target.value)}
                      className="pl-10"
                      aria-label="Valor do desconto em reais"
                    />
                  </span>
                </label>
              ) : rewardType === 'PERCENT_DISCOUNT' ? (
                <label className="grid gap-1 text-sm font-medium">
                  Percentual
                  <span className="relative">
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={percentage}
                      onChange={(event) => setPercentage(event.target.value)}
                      className="pr-10"
                      aria-label="Percentual de desconto"
                    />
                    <span className="text-text-secondary pointer-events-none absolute top-3 right-3">
                      %
                    </span>
                  </span>
                </label>
              ) : (
                <label className="grid gap-1 text-sm font-medium">
                  Produto grátis
                  <select
                    value={freeProductId}
                    onChange={(event) => setFreeProductId(event.target.value)}
                    className="border-border bg-surface focus-visible:ring-brand-500 h-11 rounded-lg border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
                  >
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </fieldset>

          <div className="mt-6 grid max-w-2xl gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium">
              Pedido mínimo
              <span className="relative">
                <span className="text-text-secondary pointer-events-none absolute top-3 left-3">
                  R$
                </span>
                <Input
                  inputMode="decimal"
                  value={minimumOrderValue}
                  onChange={(event) => setMinimumOrderValue(event.target.value)}
                  className="pl-10"
                  aria-label="Pedido mínimo em reais"
                />
              </span>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Validade
              <select
                value={validityDays}
                onChange={(event) => setValidityDays(Number(event.target.value) as 7 | 14 | 30)}
                className="border-border bg-surface focus-visible:ring-brand-500 h-11 rounded-lg border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
              >
                <option value={7}>7 dias</option>
                <option value={14}>14 dias</option>
                <option value={30}>30 dias</option>
              </select>
            </label>
          </div>

          <div className="bg-info-light text-info mt-5 rounded-lg p-3 text-sm">
            Não repetiremos este incentivo para a mesma pessoa por 30 dias. O benefício aparece no
            app; mensagens promocionais só podem ser enviadas com autorização e um canal disponível.
          </div>
        </>
      ) : (
        <section
          className="border-border bg-surface-secondary mt-6 rounded-xl border p-4"
          aria-labelledby="campaign-review-title"
        >
          <h3 id="campaign-review-title" className="font-bold">
            Confira antes de ativar
          </h3>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-text-secondary">Quem recebe</dt>
              <dd className="mt-0.5 font-semibold">
                {selectedCount} {selectedCount === 1 ? 'cliente' : 'clientes'}
              </dd>
            </div>
            <div>
              <dt className="text-text-secondary">Benefício</dt>
              <dd className="mt-0.5 font-semibold">{rewardLabel}</dd>
            </div>
            <div>
              <dt className="text-text-secondary">Pedido mínimo</dt>
              <dd className="mt-0.5 font-semibold">
                {formatCurrency(reaisToCents(minimumOrderValue))}
              </dd>
            </div>
            <div>
              <dt className="text-text-secondary">Validade</dt>
              <dd className="mt-0.5 font-semibold">{validityDays} dias</dd>
            </div>
          </dl>
          <p className="text-text-secondary mt-4 text-sm">
            Cada pessoa recebe um benefício privado. Só enviaremos uma mensagem promocional quando
            houver autorização e um canal disponível; o incentivo não será repetido por 30 dias.
          </p>
        </section>
      )}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        {reviewing ? (
          <>
            <Button type="button" disabled={isPending} onClick={activate}>
              {isPending ? 'Ativando…' : 'Confirmar e ativar'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => {
                setFeedback(null);
                setReviewing(false);
              }}
            >
              Voltar e ajustar
            </Button>
          </>
        ) : (
          <Button type="button" disabled={isPending || selectedCount === 0} onClick={review}>
            Revisar ação
          </Button>
        )}
        <span className="text-text-secondary text-xs">A ação não altera pedidos em andamento.</span>
      </div>
      {feedback ? (
        <p
          role={feedback.tone === 'error' ? 'alert' : 'status'}
          className={`mt-3 rounded-lg p-3 text-sm ${
            feedback.tone === 'success'
              ? 'bg-success-light text-success'
              : 'bg-error-light text-error'
          }`}
        >
          {feedback.message}
        </p>
      ) : null}
    </section>
  );
}
