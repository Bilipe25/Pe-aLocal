import { Check, Gift, Sparkles } from 'lucide-react';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { StorePurchaseHeader } from '@/components/storefront/store-purchase-header';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { AuthenticationError, NotFoundError } from '@/server/errors';
import { getPublicStoreShellBySlug } from '@/server/queries/public-store';
import {
  CONSUMER_SESSION_COOKIE,
  requireConsumerForStore,
} from '@/server/services/consumer-auth.service';
import { getConsumerLoyaltyState } from '@/server/services/loyalty.service';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Fidelidade',
  robots: { index: false, follow: false, noarchive: true, nocache: true },
};

function benefitLabel(benefit: {
  rewardType: 'FIXED_DISCOUNT' | 'PERCENT_DISCOUNT' | 'FREE_PRODUCT';
  rewardValue?: number | null;
  value?: number | null;
  percentageBasisPoints: number | null;
  maximumDiscountValue: number | null;
  freeProductNameSnapshot: string | null;
}) {
  if (benefit.rewardType === 'FIXED_DISCOUNT') {
    return `${formatCurrency(benefit.value ?? benefit.rewardValue ?? 0)} de desconto`;
  }
  if (benefit.rewardType === 'PERCENT_DISCOUNT') {
    const percentage = (benefit.percentageBasisPoints ?? 0) / 100;
    return `${percentage}% de desconto${benefit.maximumDiscountValue ? `, até ${formatCurrency(benefit.maximumDiscountValue)}` : ''}`;
  }
  return `${benefit.freeProductNameSnapshot ?? 'Produto'} grátis`;
}

export default async function ConsumerLoyaltyPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const store = await getPublicStoreShellBySlug(storeSlug);
  if (!store) notFound();
  if (store.slug !== storeSlug) redirect(`/${store.slug}/loyalty`);
  const sessionToken = (await cookies()).get(CONSUMER_SESSION_COOKIE)?.value;
  let identityId: string | null = null;
  if (sessionToken) {
    try {
      const result = await requireConsumerForStore({ storeSlug: store.slug, sessionToken });
      identityId = result.consumer.identityId;
    } catch (error) {
      if (!(error instanceof AuthenticationError) && !(error instanceof NotFoundError)) throw error;
    }
  }
  const state = await getConsumerLoyaltyState({
    tenantId: store.tenantId,
    storeId: store.id,
    consumerIdentityId: identityId,
  });
  if (!state) notFound();
  const progress = state.cycle?.progress ?? 0;
  const required = state.cycle?.requiredOrders ?? state.program.requiredOrders;
  const promisedBenefit = state.cycle ?? state.program;
  const minimum = state.cycle?.minimumOrderValue ?? state.program.minimumOrderValue;
  const missing = Math.max(0, required - progress);

  return (
    <div className="storefront-page-bottom-safe">
      <StorePurchaseHeader
        backHref={`/${store.slug}/mais`}
        backLabel="Voltar para Mais"
        title="Fidelidade"
        storeName={store.name}
        logoImageUrl={store.customization.assets.logo?.url ?? store.logoUrl}
        logoImageAssetId={store.customization.assets.logo?.id ?? null}
      />
      <main className="mx-auto w-full max-w-xl px-4 pt-6 pb-10">
        {!identityId ? (
          <section className="rounded-2xl border border-[var(--store-border)] bg-[var(--store-surface)] p-5">
            <Gift className="storefront-action-text size-7" aria-hidden="true" />
            <h2 className="mt-4 text-2xl font-bold text-[var(--store-text)]">
              Compre, volte e ganhe
            </h2>
            <p className="mt-2 text-[var(--store-muted-text)]">
              A cada {required} pedidos concluídos, você ganha {benefitLabel(promisedBenefit)} para{' '}
              {minimum > 0
                ? `usar em pedidos a partir de ${formatCurrency(minimum)}.`
                : 'usar no próximo pedido.'}
            </p>
            <p className="mt-4 text-sm text-[var(--store-muted-text)]">
              Confirme seu acesso para guardar o progresso. Você continua podendo comprar sem
              entrar.
            </p>
            <Button asChild className="storefront-primary-bg mt-5 min-h-11 w-full text-white">
              <Link href={`/${store.slug}/orders`}>Confirmar meu acesso</Link>
            </Button>
          </section>
        ) : (
          <>
            {state.rewards.length > 0 ? (
              <section
                className="rounded-2xl border border-[var(--store-border)] bg-[color-mix(in_srgb,var(--store-button-background)_10%,var(--store-surface))] p-5"
                aria-labelledby="available-benefit-title"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="storefront-action-text size-5" aria-hidden="true" />
                  <h2
                    id="available-benefit-title"
                    className="text-xl font-bold text-[var(--store-text)]"
                  >
                    Você ganhou!
                  </h2>
                </div>
                <p className="mt-2 text-[var(--store-muted-text)]">
                  Você tem{' '}
                  {state.rewards.length === 1
                    ? '1 benefício disponível'
                    : `${state.rewards.length} benefícios disponíveis`}
                  . Use um por pedido.
                </p>
                <ul className="mt-4 grid gap-3">
                  {state.rewards.map((reward) => (
                    <li
                      key={reward.id}
                      className="rounded-xl border border-[var(--store-border)] bg-[var(--store-surface)] p-4"
                    >
                      <p className="font-bold text-[var(--store-text)]">{benefitLabel(reward)}</p>
                      <p className="mt-1 text-sm text-[var(--store-muted-text)]">
                        {reward.minimumOrderValue > 0
                          ? `Use em pedidos a partir de ${formatCurrency(reward.minimumOrderValue)}.`
                          : 'Use no próximo pedido.'}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-[var(--store-text)]">
                        {reward.expiresAt
                          ? `Use até ${new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', timeZone: store.timeZone }).format(reward.expiresAt)}.`
                          : 'Sem prazo.'}
                      </p>
                    </li>
                  ))}
                </ul>
                <Button asChild className="storefront-primary-bg mt-5 min-h-11 w-full text-white">
                  <Link href={`/${store.slug}`}>Ver cardápio</Link>
                </Button>
              </section>
            ) : null}

            {state.programActive ? (
              <section
                className={`${state.rewards.length > 0 ? 'mt-5' : ''} rounded-2xl border border-[var(--store-border)] bg-[var(--store-surface)] p-5`}
                aria-labelledby="loyalty-progress-title"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2
                      id="loyalty-progress-title"
                      className="text-xl font-bold text-[var(--store-text)]"
                    >
                      Seu progresso
                    </h2>
                    <p className="mt-1 text-[var(--store-muted-text)]">em {store.name}</p>
                  </div>
                  <span className="storefront-action-text flex size-11 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--store-button-background)_12%,var(--store-surface))]">
                    <Gift aria-hidden="true" className="size-5" />
                  </span>
                </div>
                {required > 10 ? (
                  <p className="mt-2 text-xs text-[var(--store-muted-text)]">
                    Cada círculo representa um pedido; a contagem continua na linha seguinte.
                  </p>
                ) : null}
                <div
                  className="mt-6 grid max-w-full gap-1.5"
                  style={{
                    gridTemplateColumns: `repeat(${Math.min(required, 10)}, minmax(0, 2rem))`,
                  }}
                  aria-hidden="true"
                >
                  {Array.from({ length: required }, (_, index) => (
                    <span
                      key={index}
                      className={`${index < progress ? 'storefront-primary-bg border-transparent' : 'border-[var(--store-border)] bg-[var(--store-surface)]'} aspect-square w-full rounded-full border`}
                    />
                  ))}
                </div>
                <p
                  className="mt-4 font-mono text-lg font-bold text-[var(--store-text)]"
                  aria-label={`${progress} de ${required} pedidos concluídos`}
                >
                  {progress} de {required} pedidos
                </p>
                <p className="mt-2 text-[var(--store-muted-text)]">
                  {missing === 1 ? 'Falta só 1 pedido' : `Faltam ${missing} pedidos`} para você
                  ganhar {benefitLabel(promisedBenefit)}.
                </p>
              </section>
            ) : null}

            {!state.programActive && state.rewards.length > 0 ? (
              <p
                className="mt-5 rounded-xl border border-[var(--store-border)] bg-[var(--store-surface)] p-4 text-sm text-[var(--store-muted-text)]"
                role="status"
              >
                A loja pausou novos pontos. Seus benefícios disponíveis continuam guardados e podem
                ser usados normalmente.
              </p>
            ) : null}

            <section className="mt-7" aria-labelledby="how-loyalty-works">
              <h2 id="how-loyalty-works" className="text-lg font-bold text-[var(--store-text)]">
                Como funciona
              </h2>
              <ul className="mt-3 grid gap-3 text-sm text-[var(--store-muted-text)]">
                <li className="flex gap-3">
                  <Check
                    className="storefront-action-text mt-0.5 size-4 shrink-0"
                    aria-hidden="true"
                  />
                  Faça seus pedidos normalmente.
                </li>
                <li className="flex gap-3">
                  <Check
                    className="storefront-action-text mt-0.5 size-4 shrink-0"
                    aria-hidden="true"
                  />
                  O pedido conta quando for concluído.
                </li>
                <li className="flex gap-3">
                  <Check
                    className="storefront-action-text mt-0.5 size-4 shrink-0"
                    aria-hidden="true"
                  />
                  Use no máximo um benefício por pedido.
                </li>
              </ul>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
