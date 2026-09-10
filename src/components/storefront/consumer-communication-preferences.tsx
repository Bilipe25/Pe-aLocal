'use client';

import { BellRing, Gift, Store } from 'lucide-react';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { updateConsumerCommunicationPreferenceAction } from '@/features/consumer-account/actions';
import type { ConsumerCommunicationPreferenceInput } from '@/schemas/customer-relationship';

const choices = [
  {
    key: 'benefitEarnedEnabled',
    title: 'Benefícios conquistados',
    description: 'Avisar quando um novo benefício ficar disponível.',
    icon: Gift,
  },
  {
    key: 'benefitExpiringEnabled',
    title: 'Benefício perto de vencer',
    description: 'Lembrar antes que um benefício termine.',
    icon: BellRing,
  },
  {
    key: 'storeOffersEnabled',
    title: 'Ofertas da loja',
    description: 'Permitir incentivos e novidades para você voltar.',
    icon: Store,
  },
] as const;

export function ConsumerCommunicationPreferences({
  storeSlug,
  initialPreference,
}: {
  storeSlug: string;
  initialPreference: ConsumerCommunicationPreferenceInput;
}) {
  const [preference, setPreference] = useState(initialPreference);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  function save() {
    setFeedback(null);
    startTransition(async () => {
      const result = await updateConsumerCommunicationPreferenceAction(storeSlug, preference);
      setFeedback(
        result.success
          ? { tone: 'success', message: 'Suas escolhas foram salvas.' }
          : { tone: 'error', message: result.error.message },
      );
    });
  }

  return (
    <section aria-labelledby="communication-title">
      <h1 id="communication-title" className="text-2xl font-bold">
        Comunicações
      </h1>
      <p className="text-text-secondary mt-1 max-w-prose text-sm">
        Escolha o que esta loja pode avisar. Você pode mudar de ideia quando quiser.
      </p>
      <fieldset className="border-border bg-surface mt-6 divide-y rounded-xl border">
        <legend className="sr-only">Tipos de comunicação</legend>
        {choices.map((choice) => {
          const Icon = choice.icon;
          return (
            <label key={choice.key} className="flex min-h-20 cursor-pointer items-start gap-3 p-4">
              <Icon className="text-brand-600 mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{choice.title}</span>
                <span className="text-text-secondary mt-0.5 block text-sm">
                  {choice.description}
                </span>
              </span>
              <input
                type="checkbox"
                className="accent-brand-600 mt-1 size-5 shrink-0"
                checked={preference[choice.key]}
                onChange={(event) =>
                  setPreference({ ...preference, [choice.key]: event.target.checked })
                }
              />
            </label>
          );
        })}
      </fieldset>
      <p className="text-text-secondary mt-3 text-xs">
        Mensagens de ofertas só são permitidas quando “Ofertas da loja” estiver ligado. Dados de
        pedido, telefone e endereço não aparecem nas notificações.
      </p>
      <Button type="button" className="mt-5 w-full sm:w-auto" disabled={isPending} onClick={save}>
        {isPending ? 'Salvando…' : 'Salvar escolhas'}
      </Button>
      {feedback ? (
        <p
          className={`mt-3 rounded-lg p-3 text-sm ${
            feedback.tone === 'success'
              ? 'bg-success-light text-success'
              : 'bg-error-light text-error'
          }`}
          role={feedback.tone === 'error' ? 'alert' : 'status'}
        >
          {feedback.message}
        </p>
      ) : null}
    </section>
  );
}
