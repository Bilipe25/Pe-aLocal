import Link from 'next/link';
import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { OffersManager, type OfferListItem } from '@/features/offers/components/offers-manager';
import { formatCurrency } from '@/lib/utils';
import { hasTenantPermission, Permission } from '@/server/permissions';
import {
  getOfferPerformanceAndOpportunities,
  listOffersForActiveStore,
} from '@/server/services/offer.service';

export const metadata = { title: 'Ofertas', description: 'Combos e promoções da loja.' };

function dateOnly(value: Date | null) {
  return value?.toISOString().slice(0, 10) ?? null;
}

export default async function OffersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; kind?: string; status?: string; period?: string }>;
}) {
  const query = await searchParams;
  const [data, insights] = await Promise.all([
    listOffersForActiveStore(query),
    getOfferPerformanceAndOpportunities(query.period),
  ]);
  if (data.page > data.totalPages) redirect(`/dashboard/offers?page=${data.totalPages}`);
  const canEdit = hasTenantPermission(data.session.tenantRole, Permission.MANAGE_OFFERS);
  const performanceByOfferId = new Map(
    insights.offerMetrics.map((metrics) => [metrics.offerId, metrics]),
  );
  const offers: OfferListItem[] = data.offers.map((entry) => {
    const schedule = {
      startsOn: dateOnly(entry.offer.startsOn),
      endsOnExclusive: dateOnly(entry.offer.endsOnExclusive),
      weekdays: entry.offer.weekdays,
      startMinute: entry.offer.startMinute,
      endMinuteExclusive: entry.offer.endMinuteExclusive,
    };
    const typeLabel =
      entry.offer.kind === 'COMBO_FIXED'
        ? 'Combo'
        : entry.offer.kind === 'COMBO_FLEXIBLE'
          ? 'Combo flexível'
          : entry.offer.kind === 'PRODUCT_FIXED_PRICE'
            ? 'Preço promocional'
            : entry.offer.kind === 'QUANTITY_FIXED_PRICE'
              ? 'Preço por quantidade'
              : entry.offer.kind === 'BOGO'
                ? 'Compre e ganhe'
                : entry.offer.kind === 'CART_FIXED_DISCOUNT'
                  ? 'Desconto no carrinho'
                  : 'Entrega grátis';
    const benefitLabel = entry.offer.quantityPrice
      ? `${entry.offer.quantityPrice.requiredQuantity} itens por ${formatCurrency(entry.offer.quantityPrice.groupFixedPrice)}`
      : entry.offer.bogo
        ? `Compre ${entry.offer.bogo.buyQuantity} e ganhe ${entry.offer.bogo.getQuantity}`
        : entry.offer.cartDiscount
          ? `${formatCurrency(entry.offer.cartDiscount.value)} de desconto${entry.offer.cartDiscount.minSubtotal > 0 ? ` acima de ${formatCurrency(entry.offer.cartDiscount.minSubtotal)}` : ''}`
          : entry.offer.freeDelivery
            ? `Entrega grátis${entry.offer.freeDelivery.minSubtotal > 0 ? ` acima de ${formatCurrency(entry.offer.freeDelivery.minSubtotal)}` : ''}`
            : entry.offer.combo
              ? `${entry.offer.combo.groups.reduce((total, group) => total + group.quantity, 0)} itens por ${formatCurrency(entry.offer.combo.fixedPrice)}`
              : entry.offer.productPrice
                ? `Preço especial de ${formatCurrency(entry.offer.productPrice.fixedPrice)}`
                : 'Benefício automático';
    return {
      kind: entry.kind,
      id: entry.offer.id,
      version: entry.offer.version,
      name: entry.offer.name,
      isActive: entry.offer.isActive,
      archivedAt: entry.offer.archivedAt?.toISOString() ?? null,
      activeNow: data.isActiveNow(entry),
      technicalKind: entry.offer.kind,
      legacyKind:
        entry.offer.kind === 'COMBO_FIXED'
          ? ('COMBO' as const)
          : entry.offer.kind === 'PRODUCT_FIXED_PRICE'
            ? ('PRODUCT_PROMOTION' as const)
            : null,
      typeLabel,
      benefitLabel,
      schedule,
      performance: performanceByOfferId.get(entry.offer.id),
    };
  });
  return (
    <div className="space-y-7">
      <PageHeader
        title="Ofertas"
        description="Combos e preços promocionais com economia verificável no checkout."
      />
      <section aria-labelledby="offer-performance-title" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="offer-performance-title" className="text-text-primary text-lg font-semibold">
              Desempenho {insights.periodDays === 1 ? 'de hoje' : `em ${insights.periodDays} dias`}
            </h2>
            <p className="text-text-secondary text-sm">
              Somente pedidos entregues e pagos que usaram uma oferta.
            </p>
          </div>
          <nav
            aria-label="Período do desempenho"
            className="border-border bg-surface flex rounded-lg border p-1"
          >
            {(
              [
                [1, 'Hoje'],
                [7, '7 dias'],
                [30, '30 dias'],
              ] as const
            ).map(([days, label]) => (
              <Button
                key={days}
                asChild
                size="sm"
                variant={insights.periodDays === days ? 'secondary' : 'ghost'}
              >
                <Link
                  href={`/dashboard/offers?period=${days}`}
                  aria-current={insights.periodDays === days ? 'page' : undefined}
                >
                  {label}
                </Link>
              </Button>
            ))}
          </nav>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Pedidos', String(insights.metrics.orderCount)],
            ['Receita bruta', formatCurrency(insights.metrics.grossRevenue)],
            ['Descontos concedidos', formatCurrency(insights.metrics.discountAmount)],
            ['Ticket médio', formatCurrency(insights.metrics.averageTicket)],
          ].map(([label, value]) => (
            <div key={label} className="border-border bg-surface min-w-0 rounded-xl border p-4">
              <dt className="text-text-secondary text-sm">{label}</dt>
              <dd className="text-text-primary mt-2 truncate text-xl font-bold">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      {insights.opportunities.length > 0 && (
        <section
          aria-labelledby="offer-opportunities-title"
          className="border-border bg-surface rounded-xl border p-4 sm:p-6"
        >
          <h2 id="offer-opportunities-title" className="text-text-primary text-lg font-semibold">
            Oportunidades encontradas
          </h2>
          <p className="text-text-secondary mt-1 text-sm">
            Pares comprados juntos nos últimos 90 dias; o preço continua sendo sua decisão.
          </p>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {insights.opportunities.map((opportunity) => (
              <article
                key={`${opportunity.firstProductId}:${opportunity.secondProductId}`}
                className="border-border min-w-0 rounded-lg border p-4"
              >
                <h3 className="text-text-primary font-semibold break-words">
                  {opportunity.firstProductName} + {opportunity.secondProductName}
                </h3>
                <p className="text-text-secondary mt-1 text-sm">
                  {opportunity.pairOrders} pedidos ·{' '}
                  {new Intl.NumberFormat('pt-BR', {
                    style: 'percent',
                    maximumFractionDigits: 0,
                  }).format(opportunity.share)}{' '}
                  de afinidade
                </p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link
                    href={`/dashboard/offers/new/combo?products=${encodeURIComponent(`${opportunity.firstProductId},${opportunity.secondProductId}`)}`}
                  >
                    Usar como ponto de partida
                  </Link>
                </Button>
              </article>
            ))}
          </div>
        </section>
      )}
      <OffersManager
        offers={offers}
        canEdit={canEdit}
        page={data.page}
        totalPages={data.totalPages}
        total={data.total}
      />
    </div>
  );
}
