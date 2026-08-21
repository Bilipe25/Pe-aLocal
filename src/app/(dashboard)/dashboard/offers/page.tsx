import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/shared/page-header';
import { OffersManager, type OfferListItem } from '@/features/offers/components/offers-manager';
import { hasTenantPermission, Permission } from '@/server/permissions';
import { listOffersForActiveStore } from '@/server/services/offer.service';

export const metadata = { title: 'Ofertas', description: 'Combos e promoções da loja.' };

function dateOnly(value: Date | null) {
  return value?.toISOString().slice(0, 10) ?? null;
}

export default async function OffersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; kind?: string; status?: string }>;
}) {
  const query = await searchParams;
  const data = await listOffersForActiveStore(query);
  if (data.page > data.totalPages) redirect(`/dashboard/offers?page=${data.totalPages}`);
  const canEdit = hasTenantPermission(data.session.tenantRole, Permission.MANAGE_OFFERS);
  const offers: OfferListItem[] = data.offers.map((entry) => {
    const schedule = {
      startsOn: dateOnly(entry.offer.startsOn),
      endsOnExclusive: dateOnly(entry.offer.endsOnExclusive),
      weekdays: entry.offer.weekdays,
      startMinute: entry.offer.startMinute,
      endMinuteExclusive: entry.offer.endMinuteExclusive,
    };
    if (entry.kind === 'COMBO') {
      return {
        kind: entry.kind,
        id: entry.offer.id,
        version: entry.offer.version,
        name: entry.offer.name,
        isActive: entry.offer.isActive,
        archivedAt: entry.offer.archivedAt?.toISOString() ?? null,
        activeNow: data.isActiveNow(entry),
        regularPrice: entry.offer.items.reduce(
          (total, item) => total + item.product.basePrice * item.quantity,
          0,
        ),
        offerPrice: entry.offer.specialPrice,
        componentCount: entry.offer.items.reduce((total, item) => total + item.quantity, 0),
        schedule,
      };
    }
    return {
      kind: entry.kind,
      id: entry.offer.id,
      version: entry.offer.version,
      name: entry.offer.product.name,
      isActive: entry.offer.isActive,
      archivedAt: entry.offer.archivedAt?.toISOString() ?? null,
      activeNow: data.isActiveNow(entry),
      regularPrice: entry.offer.product.basePrice,
      offerPrice: entry.offer.promotionalPrice,
      schedule,
    };
  });
  return (
    <div>
      <PageHeader title="Ofertas" description="Combos e preços promocionais com economia verificável no checkout." />
      <OffersManager offers={offers} canEdit={canEdit} page={data.page} totalPages={data.totalPages} total={data.total} />
    </div>
  );
}
