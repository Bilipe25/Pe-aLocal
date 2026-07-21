'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CirclePause, LockKeyhole, Store } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toggleStoreStatusAction } from '@/features/stores/actions';

type StoreStatus = 'OPEN' | 'CLOSED' | 'PAUSED';

export function StoreStatusControl({
  storeId,
  status,
  expectedConfigurationVersion,
}: {
  storeId: string;
  status: StoreStatus;
  expectedConfigurationVersion: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [configurationVersion, setConfigurationVersion] = useState(expectedConfigurationVersion);

  async function changeStatus(nextStatus: StoreStatus) {
    const result = await toggleStoreStatusAction(storeId, configurationVersion, nextStatus);
    if (!result.success) {
      toast.error(result.error.message);
      return false;
    }

    setConfigurationVersion(result.data.configurationVersion);

    toast.success(
      nextStatus === 'OPEN'
        ? 'Loja aberta para novos pedidos.'
        : nextStatus === 'PAUSED'
          ? 'Pedidos pausados temporariamente.'
          : 'Loja fechada para novos pedidos.',
    );
    router.refresh();
    return true;
  }

  function openStore() {
    startTransition(async () => {
      await changeStatus('OPEN');
    });
  }

  return (
    <div>
      <h2 className="text-text-primary text-sm font-semibold">Recebimento de pedidos</h2>
      <p className="text-text-secondary mt-1 text-sm">
        Ao abrir, a loja aceita pedidos somente dentro dos horários configurados e quando estiver
        operacionalmente pronta.
      </p>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Status da loja">
        <Button
          type="button"
          variant={status === 'OPEN' ? 'default' : 'outline'}
          disabled={pending || status === 'OPEN'}
          onClick={openStore}
        >
          <Store aria-hidden="true" /> {status === 'OPEN' ? 'Loja aberta' : 'Abrir loja'}
        </Button>

        <ConfirmDialog
          title="Pausar novos pedidos?"
          description="O cardápio continuará disponível para consulta, mas os clientes não poderão adicionar produtos enquanto a loja estiver pausada."
          confirmLabel="Pausar pedidos"
          onConfirm={() => changeStatus('PAUSED')}
          trigger={
            <Button
              type="button"
              variant={status === 'PAUSED' ? 'secondary' : 'outline'}
              disabled={status === 'PAUSED'}
            >
              <CirclePause aria-hidden="true" />{' '}
              {status === 'PAUSED' ? 'Pedidos pausados' : 'Pausar'}
            </Button>
          }
        />

        <ConfirmDialog
          title="Fechar a loja agora?"
          description="Novos pedidos serão bloqueados. Os pedidos já recebidos continuam disponíveis no painel."
          confirmLabel="Fechar loja"
          onConfirm={() => changeStatus('CLOSED')}
          trigger={
            <Button
              type="button"
              variant={status === 'CLOSED' ? 'secondary' : 'outline'}
              disabled={status === 'CLOSED'}
            >
              <LockKeyhole aria-hidden="true" /> {status === 'CLOSED' ? 'Loja fechada' : 'Fechar'}
            </Button>
          }
        />
      </div>
    </div>
  );
}
