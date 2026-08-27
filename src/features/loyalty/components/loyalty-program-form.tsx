'use client';

import { Check, Gift, LoaderCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { saveLoyaltyProgramAction } from '@/features/loyalty/actions';
import { formatCurrency } from '@/lib/utils';

function centsToInput(value: number) {
  return (value / 100).toFixed(2).replace('.', ',');
}

function inputToCents(value: string) {
  const normalized = value.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const number = Number(normalized);
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
}

export function LoyaltyProgramForm({
  initial,
  canEdit,
}: {
  initial: {
    requiredOrders: number;
    rewardValue: number;
    minimumOrderValue: number;
    isActive: boolean;
  } | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [requiredOrders, setRequiredOrders] = useState(String(initial?.requiredOrders ?? 5));
  const [rewardValue, setRewardValue] = useState(centsToInput(initial?.rewardValue ?? 1000));
  const [minimumOrderValue, setMinimumOrderValue] = useState(
    centsToInput(initial?.minimumOrderValue ?? 3000),
  );
  const [isActive, setIsActive] = useState(initial?.isActive ?? false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();
  const preview = useMemo(
    () => ({
      orders: Math.max(0, Number(requiredOrders) || 0),
      reward: inputToCents(rewardValue),
      minimum: inputToCents(minimumOrderValue),
    }),
    [minimumOrderValue, requiredOrders, rewardValue],
  );

  function save() {
    setFeedback(null);
    startTransition(async () => {
      const result = await saveLoyaltyProgramAction({
        requiredOrders: preview.orders,
        rewardValue: preview.reward,
        minimumOrderValue: preview.minimum,
        isActive,
      });
      if (!result.success) {
        setFeedback({ tone: 'error', text: result.error.message });
        return;
      }
      setFeedback({
        tone: 'success',
        text: isActive ? 'Fidelidade salva e ativa.' : 'Configuração salva como inativa.',
      });
      router.refresh();
    });
  }

  return (
    <section
      className="border-border bg-surface rounded-xl border p-4 sm:p-6"
      aria-labelledby="loyalty-config-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="loyalty-config-title" className="text-lg font-bold">
            Configure em menos de 1 minuto
          </h2>
          <p className="text-text-secondary mt-1 text-sm">
            Uma regra simples, válida apenas nesta loja.
          </p>
        </div>
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={isActive}
            disabled={!canEdit || pending}
            onChange={(event) => setIsActive(event.target.checked)}
            className="h-5 w-5"
          />
          {isActive ? 'Ativa' : 'Inativa'}
        </label>
      </div>

      <fieldset disabled={!canEdit || pending} className="mt-6 grid gap-5">
        <label className="grid gap-2 text-sm font-semibold sm:grid-cols-[minmax(12rem,1fr)_10rem] sm:items-center">
          <span>A cada quantos pedidos?</span>
          <Input
            type="number"
            min={2}
            max={20}
            inputMode="numeric"
            value={requiredOrders}
            onChange={(event) => setRequiredOrders(event.target.value)}
            aria-describedby="required-orders-help"
            className="min-h-11"
          />
          <span
            id="required-orders-help"
            className="text-text-secondary text-xs font-normal sm:col-span-2"
          >
            Conta somente quando o pedido for concluído.
          </span>
        </label>
        <label className="grid gap-2 text-sm font-semibold sm:grid-cols-[minmax(12rem,1fr)_10rem] sm:items-center">
          <span>Quanto o cliente ganha?</span>
          <span className="relative">
            <span className="text-text-secondary pointer-events-none absolute top-3 left-3">
              R$
            </span>
            <Input
              className="min-h-11 pl-10 font-mono"
              inputMode="decimal"
              value={rewardValue}
              onChange={(event) => setRewardValue(event.target.value)}
            />
          </span>
        </label>
        <label className="grid gap-2 text-sm font-semibold sm:grid-cols-[minmax(12rem,1fr)_10rem] sm:items-center">
          <span>Qual o pedido mínimo?</span>
          <span className="relative">
            <span className="text-text-secondary pointer-events-none absolute top-3 left-3">
              R$
            </span>
            <Input
              className="min-h-11 pl-10 font-mono"
              inputMode="decimal"
              value={minimumOrderValue}
              onChange={(event) => setMinimumOrderValue(event.target.value)}
            />
          </span>
        </label>
      </fieldset>

      <div className="bg-surface-tertiary mt-6 rounded-xl p-4" aria-live="polite">
        <div className="flex items-start gap-3">
          <span className="bg-success-light text-success flex size-10 shrink-0 items-center justify-center rounded-full">
            <Gift aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Seu cliente verá</p>
            <p className="mt-1 text-base font-bold">
              A cada {preview.orders} pedidos, ganhe {formatCurrency(preview.reward)} para usar{' '}
              {preview.minimum > 0
                ? `em pedidos acima de ${formatCurrency(preview.minimum)}.`
                : 'no próximo pedido.'}
            </p>
          </div>
        </div>
      </div>

      {canEdit ? (
        <div className="mt-6 flex justify-end">
          <Button
            type="button"
            className="min-h-11 w-full sm:w-auto"
            disabled={pending}
            onClick={save}
          >
            {pending ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : (
              <Check aria-hidden="true" />
            )}
            {pending ? 'Salvando…' : 'Salvar configuração'}
          </Button>
        </div>
      ) : (
        <p className="text-text-secondary mt-5 text-sm">
          Somente o proprietário pode alterar esta regra.
        </p>
      )}
      {feedback ? (
        <p
          role={feedback.tone === 'error' ? 'alert' : 'status'}
          className={`${feedback.tone === 'error' ? 'bg-error-light text-error' : 'bg-success-light text-success'} mt-4 rounded-lg p-3 text-sm`}
        >
          {feedback.text}
        </p>
      ) : null}
    </section>
  );
}
