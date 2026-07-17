'use server';

import type { TenantStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';

import { changeTenantStatus } from '@/server/services/admin.service';

export async function changeTenantStatusAction(
  tenantId: string,
  nextStatus: Extract<TenantStatus, 'ACTIVE' | 'SUSPENDED'>,
): Promise<void> {
  await changeTenantStatus(tenantId, nextStatus);
  revalidatePath('/admin');
  revalidatePath(`/admin/tenants/${tenantId}`);
}
