import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/shared/page-header';
import { CouponsManager } from '@/features/coupons/components/coupons-manager';
import { hasTenantPermission, Permission } from '@/server/permissions';
import { listCouponsForActiveStore } from '@/server/services/coupon.service';

export const metadata = {
  title: 'Cupons',
  description: 'Promoções exclusivas da loja.',
};

export default async function CouponsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const query = await searchParams;
  const data = await listCouponsForActiveStore({ page: query.page });
  if (data.page > data.totalPages) {
    redirect(`/dashboard/coupons?page=${data.totalPages}`);
  }
  const canEdit = hasTenantPermission(data.session.tenantRole, Permission.MANAGE_COUPONS);
  const coupons = data.coupons.map((coupon) => ({
    ...coupon,
    startsAt: coupon.startsAt?.toISOString() ?? null,
    expiresAt: coupon.expiresAt?.toISOString() ?? null,
    createdAt: coupon.createdAt.toISOString(),
    updatedAt: coupon.updatedAt.toISOString(),
  }));

  return (
    <div>
      <PageHeader
        title="Cupons"
        description="Crie descontos por loja com validade, limites e rastreabilidade."
      />
      <CouponsManager
        coupons={coupons}
        canEdit={canEdit}
        page={data.page}
        totalPages={data.totalPages}
        total={data.total}
        referenceTime={data.referenceTime}
      />
    </div>
  );
}
