'use client';

import type { TenantStatus } from '@prisma/client';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { changeTenantStatusAction } from '@/features/admin/actions';

export function TenantStatusAction({
  tenantId,
  tenantName,
  status,
  compact = false,
}: {
  tenantId: string;
  tenantName: string;
  status: TenantStatus;
  compact?: boolean;
}) {
  const router = useRouter();
  const suspend = status === 'ACTIVE';
  const nextStatus = suspend ? 'SUSPENDED' : 'ACTIVE';

  async function changeStatus() {
    try {
      await changeTenantStatusAction(tenantId, nextStatus);
      toast.success(
        suspend
          ? `${tenantName} foi suspenso e a alteração foi auditada.`
          : `${tenantName} foi ativado e a alteração foi auditada.`,
      );
      router.refresh();
      return true;
    } catch {
      toast.error('Não foi possível alterar o status do estabelecimento. Tente novamente.');
      return false;
    }
  }

  return (
    <ConfirmDialog
      title={suspend ? `Suspender ${tenantName}?` : `Ativar ${tenantName}?`}
      description={
        suspend
          ? 'O estabelecimento perderá o acesso operacional até ser reativado. Esta ação será registrada nos logs de auditoria.'
          : 'O estabelecimento voltará a ter acesso operacional. Esta ação será registrada nos logs de auditoria.'
      }
      confirmLabel={suspend ? 'Suspender estabelecimento' : 'Ativar estabelecimento'}
      destructive={suspend}
      onConfirm={changeStatus}
      trigger={
        <Button
          type="button"
          variant={suspend ? 'destructive' : 'outline'}
          size="sm"
          className={compact ? 'w-full sm:w-auto' : undefined}
        >
          {suspend ? 'Suspender' : 'Ativar'}
        </Button>
      }
    />
  );
}
