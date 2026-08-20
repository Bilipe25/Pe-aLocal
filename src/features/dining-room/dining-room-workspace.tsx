'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  Bell,
  Check,
  Clock3,
  Loader2,
  ReceiptText,
  RefreshCw,
  Store,
  Utensils,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  closeDiningSessionAction,
  resolveDiningServiceRequestAction,
  transferDiningSessionAction,
} from '@/features/dining-room/actions';
import {
  diningRoomQueryKeys,
  useDiningRoom,
  useDiningSessionDetail,
} from '@/hooks/use-dining-room';
import { useOrderRealtime } from '@/hooks/use-order-realtime';
import { formatCurrency } from '@/lib/utils';
import type { DiningRoomSnapshotDto, DiningRoomTableDto } from '@/types/dining-room';

type RoomFilter = 'ALL' | 'OPEN' | 'ATTENTION';

const orderStatusLabels: Record<string, string> = {
  PENDING: 'Novo',
  AWAITING_PAYMENT: 'Aguardando Pix',
  CONFIRMED: 'Confirmado',
  PREPARING: 'Em preparo',
  READY: 'Pronto',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelado',
};

function elapsedLabel(start: string | null, nowMs: number) {
  if (!start) return null;
  const minutes = Math.max(0, Math.floor((nowMs - new Date(start).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}min` : `${hours}h`;
}

function statePresentation(table: DiningRoomTableDto) {
  if (!table.isActive && table.state === 'FREE') {
    return { label: 'Desativada', variant: 'secondary' as const, icon: Store };
  }
  if (table.state === 'ASSISTANCE') {
    return { label: 'Precisa de atendimento', variant: 'warning' as const, icon: Bell };
  }
  if (table.state === 'BILL') {
    return { label: 'Conta solicitada', variant: 'default' as const, icon: ReceiptText };
  }
  if (table.state === 'OPEN') {
    return { label: 'Em atendimento', variant: 'success' as const, icon: Utensils };
  }
  return { label: 'Livre', variant: 'secondary' as const, icon: Check };
}

function RoomTableCard({
  table,
  nowMs,
  busy,
  onOpen,
  onResolve,
}: {
  table: DiningRoomTableDto;
  nowMs: number;
  busy: boolean;
  onOpen: () => void;
  onResolve: () => void;
}) {
  const presentation = statePresentation(table);
  const Icon = presentation.icon;
  const elapsed = elapsedLabel(table.openedAt, nowMs);
  return (
    <article className="border-border bg-surface rounded-xl border p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-text-primary text-lg font-bold break-words">{table.label}</h3>
          <Badge variant={presentation.variant} className="mt-2 gap-1.5 whitespace-normal">
            <Icon aria-hidden="true" className="h-3.5 w-3.5" />
            {presentation.label}
          </Badge>
        </div>
        {elapsed ? (
          <span className="text-text-secondary flex shrink-0 items-center gap-1 text-sm">
            <Clock3 aria-hidden="true" className="h-4 w-4" /> {elapsed}
          </span>
        ) : null}
      </div>
      <dl className="border-border mt-4 grid grid-cols-2 gap-3 border-t pt-3 text-sm">
        <div>
          <dt className="text-text-muted">Pedidos</dt>
          <dd className="text-text-primary font-mono font-bold">{table.orderCount}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Total considerado</dt>
          <dd className="text-text-primary font-mono font-bold">
            {formatCurrency(table.totalConsideredCents)}
          </dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        {table.openRequest ? (
          <Button
            type="button"
            disabled={busy}
            aria-label={`${table.openRequest.type === 'ASSISTANCE' ? 'Atender chamado' : 'Preparar conta'} de ${table.label}`}
            onClick={onResolve}
          >
            {busy ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Check aria-hidden="true" />
            )}
            {table.openRequest.type === 'ASSISTANCE' ? 'Atender chamado' : 'Preparar conta'}
          </Button>
        ) : null}
        <Button
          type="button"
          variant={table.openRequest ? 'outline' : 'default'}
          aria-label={`Abrir ${table.label}`}
          onClick={onOpen}
        >
          Abrir mesa
        </Button>
      </div>
    </article>
  );
}

export function DiningRoomWorkspace({
  storeId,
  authorizationScope,
  initialSnapshot,
}: {
  storeId: string;
  authorizationScope: string;
  initialSnapshot: DiningRoomSnapshotDto;
}) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<RoomFilter>('ALL');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.parse(initialSnapshot.generatedAt));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [destinationTableId, setDestinationTableId] = useState('');
  const [confirmingTransfer, setConfirmingTransfer] = useState(false);

  const invalidateRoom = () => {
    void queryClient.invalidateQueries({ queryKey: diningRoomQueryKeys.store(storeId) });
    void queryClient.invalidateQueries({ queryKey: ['order-board', storeId] });
    void queryClient.invalidateQueries({ queryKey: ['kds-orders', storeId] });
    if (selectedSessionId) {
      void queryClient.invalidateQueries({
        queryKey: diningRoomQueryKeys.detail(storeId, authorizationScope, selectedSessionId),
      });
    }
  };
  const realtimeState = useOrderRealtime(storeId, {
    onNewOrder: invalidateRoom,
    onOrderUpdated: invalidateRoom,
    onPaymentUpdated: invalidateRoom,
    onDiningRoomUpdated: invalidateRoom,
  });
  const room = useDiningRoom(storeId, authorizationScope, initialSnapshot, realtimeState);
  const detail = useDiningSessionDetail(storeId, authorizationScope, selectedSessionId);
  const snapshot = room.data;

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const attention = useMemo(
    () => snapshot.tables.filter((table) => table.state === 'ASSISTANCE' || table.state === 'BILL'),
    [snapshot.tables],
  );
  const open = useMemo(
    () => snapshot.tables.filter((table) => table.state === 'OPEN'),
    [snapshot.tables],
  );
  const free = useMemo(
    () => snapshot.tables.filter((table) => table.state === 'FREE'),
    [snapshot.tables],
  );

  async function resolveRequest(table: DiningRoomTableDto) {
    if (!table.openRequest) return;
    setBusyId(table.openRequest.id);
    const result = await resolveDiningServiceRequestAction(storeId, {
      requestId: table.openRequest.id,
      expectedVersion: table.openRequest.version,
    });
    setBusyId(null);
    if (!result.success) {
      toast.error(result.error.message);
      invalidateRoom();
      return;
    }
    toast.success(
      table.openRequest.type === 'ASSISTANCE'
        ? 'Chamado atendido.'
        : 'Pedido de conta reconhecido.',
    );
    invalidateRoom();
  }

  async function closeSession() {
    if (!detail.data) return;
    setBusyId(`close:${detail.data.sessionId}`);
    const result = await closeDiningSessionAction(storeId, {
      sessionId: detail.data.sessionId,
      expectedVersion: detail.data.version,
    });
    setBusyId(null);
    if (!result.success) {
      toast.error(result.error.message);
      invalidateRoom();
      return;
    }
    toast.success('Mesa fechada e disponível para um novo atendimento.');
    setSelectedSessionId(null);
    invalidateRoom();
  }

  async function transferSession() {
    if (!detail.data || !destinationTableId) return;
    setBusyId(`transfer:${detail.data.sessionId}`);
    const result = await transferDiningSessionAction(storeId, {
      sessionId: detail.data.sessionId,
      destinationTableId,
      expectedVersion: detail.data.version,
    });
    setBusyId(null);
    if (!result.success) {
      toast.error(result.error.message);
      setConfirmingTransfer(false);
      invalidateRoom();
      return;
    }
    toast.success(`Atendimento transferido para ${result.data.tableLabel}.`);
    setConfirmingTransfer(false);
    invalidateRoom();
  }

  const showAttention = filter === 'ALL' || filter === 'ATTENTION';
  const showOpen = filter === 'ALL' || filter === 'OPEN';
  const showFree = filter === 'ALL';

  function selectSession(sessionId: string | null) {
    setDestinationTableId('');
    setConfirmingTransfer(false);
    setSelectedSessionId(sessionId);
  }

  return (
    <div className="mx-auto w-full max-w-[92rem] space-y-7 px-4 py-6 sm:px-6 lg:px-8">
      <header className="border-border flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-text-primary text-3xl font-bold tracking-[-0.025em]">
            Salão
          </h1>
          <p className="text-text-secondary mt-2 max-w-[65ch]">
            {snapshot.totals.open} de {snapshot.totals.tables} mesas em atendimento ·{' '}
            {snapshot.totals.assistance + snapshot.totals.bill} precisam de atenção
          </p>
        </div>
        <div className="text-text-secondary flex items-center gap-2 text-sm">
          <span className="flex items-center gap-2" role="status">
            <span
              className={`h-2.5 w-2.5 rounded-full ${realtimeState === 'connected' ? 'bg-success' : 'bg-warning'}`}
              aria-hidden="true"
            />
            {realtimeState === 'connected'
              ? 'Atualização em tempo real'
              : 'Atualização automática ativa'}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Atualizar salão"
            onClick={() => void room.refetch()}
            disabled={room.isFetching}
          >
            <RefreshCw className={room.isFetching ? 'animate-spin' : ''} aria-hidden="true" />
          </Button>
        </div>
      </header>

      {!snapshot.enabledForNewOrders ? (
        <div className="bg-warning-light text-text-primary rounded-xl p-4 text-sm" role="status">
          Novos pedidos por QR estão desativados. Atendimentos existentes continuam disponíveis para
          conclusão.
        </div>
      ) : null}

      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtrar mesas">
        {(
          [
            ['ALL', 'Todas'],
            ['OPEN', 'Em atendimento'],
            ['ATTENTION', 'Atenção'],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            type="button"
            variant={filter === value ? 'default' : 'outline'}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {room.isError ? (
        <section className="border-error/30 bg-error-light rounded-xl border p-5" role="alert">
          <h2 className="text-text-primary font-bold">Não foi possível atualizar o salão</h2>
          <p className="text-text-secondary mt-1 text-sm">
            A última visão segura continua na tela. Tente novamente.
          </p>
          <Button type="button" className="mt-4" onClick={() => void room.refetch()}>
            Tentar novamente
          </Button>
        </section>
      ) : null}

      {snapshot.totals.tables === 0 ? (
        <section className="border-border bg-surface rounded-xl border p-5">
          <h2 className="text-text-primary font-bold">Nenhuma mesa configurada</h2>
          <p className="text-text-secondary mt-1 text-sm">
            Um proprietário ou gerente pode cadastrar mesas em Minha loja → Mesas e QR Code.
          </p>
        </section>
      ) : null}

      {showAttention ? (
        <section aria-labelledby="room-attention-title">
          <div className="mb-3 flex items-center gap-2">
            <Bell className="text-warning h-5 w-5" aria-hidden="true" />
            <h2 id="room-attention-title" className="text-text-primary text-xl font-bold">
              Precisa de você agora
            </h2>
            <Badge variant="warning">{attention.length}</Badge>
          </div>
          {attention.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {attention.map((table) => (
                <RoomTableCard
                  key={table.tableId}
                  table={table}
                  nowMs={nowMs}
                  busy={busyId === table.openRequest?.id}
                  onOpen={() => selectSession(table.sessionId)}
                  onResolve={() => void resolveRequest(table)}
                />
              ))}
            </div>
          ) : (
            <p className="bg-success-light text-text-primary rounded-xl p-4 text-sm">
              Nenhuma mesa pediu atenção agora.
            </p>
          )}
        </section>
      ) : null}

      {showOpen ? (
        <section aria-labelledby="room-open-title">
          <div className="mb-3 flex items-center gap-2">
            <Utensils className="text-success h-5 w-5" aria-hidden="true" />
            <h2 id="room-open-title" className="text-text-primary text-xl font-bold">
              Em atendimento
            </h2>
            <Badge variant="success">{open.length}</Badge>
          </div>
          {open.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {open.map((table) => (
                <RoomTableCard
                  key={table.tableId}
                  table={table}
                  nowMs={nowMs}
                  busy={false}
                  onOpen={() => selectSession(table.sessionId)}
                  onResolve={() => undefined}
                />
              ))}
            </div>
          ) : (
            <p className="bg-surface-secondary text-text-secondary rounded-xl p-4 text-sm">
              Nenhuma outra mesa está em atendimento.
            </p>
          )}
        </section>
      ) : null}

      {showFree ? (
        <section aria-labelledby="room-free-title">
          <div className="mb-3 flex items-center gap-2">
            <Check className="text-text-muted h-5 w-5" aria-hidden="true" />
            <h2 id="room-free-title" className="text-text-primary text-xl font-bold">
              Livres
            </h2>
            <Badge variant="secondary">{free.length}</Badge>
          </div>
          {free.length ? (
            <ul className="divide-border border-border bg-surface divide-y overflow-hidden rounded-xl border">
              {free.map((table) => (
                <li
                  key={table.tableId}
                  className="flex min-h-14 items-center justify-between gap-4 px-4 py-2.5"
                >
                  <span className="text-text-primary min-w-0 font-semibold break-words">
                    {table.label}
                  </span>
                  <span className="text-text-muted shrink-0 text-sm">
                    {table.isActive ? 'Livre' : 'Desativada'}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <Dialog.Root
        open={Boolean(selectedSessionId)}
        onOpenChange={(openState) => {
          if (!openState) selectSession(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="bg-tinta/55 fixed inset-0 z-50" />
          <Dialog.Content className="bg-surface fixed inset-y-0 right-0 z-50 w-full max-w-[38rem] overflow-y-auto p-5 shadow-xl focus:outline-none sm:p-7">
            <div className="border-border flex items-start justify-between gap-4 border-b pb-5">
              <div className="min-w-0">
                <Dialog.Title className="font-display text-text-primary text-2xl font-bold break-words">
                  {detail.data?.table.label ?? 'Carregando mesa…'}
                </Dialog.Title>
                <Dialog.Description className="text-text-secondary mt-1 text-sm">
                  {detail.data
                    ? `Em atendimento há ${elapsedLabel(detail.data.openedAt, nowMs)}`
                    : 'Buscando o atendimento atual.'}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Fechar detalhe da mesa"
                >
                  <X aria-hidden="true" />
                </Button>
              </Dialog.Close>
            </div>

            {detail.isLoading ? (
              <div className="space-y-3 py-6" role="status" aria-label="Carregando detalhe da mesa">
                <div className="bg-surface-secondary h-20 animate-pulse rounded-xl" />
                <div className="bg-surface-secondary h-32 animate-pulse rounded-xl" />
                <div className="bg-surface-secondary h-20 animate-pulse rounded-xl" />
              </div>
            ) : detail.isError || !detail.data ? (
              <div className="py-8" role="alert">
                <p className="text-text-primary font-semibold">Não foi possível abrir esta mesa.</p>
                <Button type="button" className="mt-4" onClick={() => void detail.refetch()}>
                  Tentar novamente
                </Button>
              </div>
            ) : (
              <div className="divide-border divide-y">
                <section className="py-6" aria-labelledby="session-orders-title">
                  <h2 id="session-orders-title" className="text-text-primary text-lg font-bold">
                    Pedidos
                  </h2>
                  <ul className="divide-border mt-3 divide-y">
                    {detail.data.orders.map((order) => (
                      <li key={order.id} className="flex items-center justify-between gap-4 py-3">
                        <div>
                          <Link
                            href={`/dashboard/orders?query=${encodeURIComponent(`#${order.orderNumber}`)}`}
                            className="text-brand-600 focus-visible:ring-brand-500 font-mono font-bold underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
                          >
                            #{order.orderNumber}
                          </Link>
                          <p className="text-text-secondary mt-1 text-sm">
                            {orderStatusLabels[order.status] ?? order.status} · origem{' '}
                            {order.originalTableLabel}
                          </p>
                        </div>
                        <strong className="text-text-primary shrink-0 font-mono">
                          {formatCurrency(order.total)}
                        </strong>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="py-6" aria-labelledby="session-summary-title">
                  <h2 id="session-summary-title" className="text-text-primary text-lg font-bold">
                    Resumo
                  </h2>
                  <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-4">
                    <div>
                      <dt className="text-text-muted text-sm">Pedidos</dt>
                      <dd className="text-text-primary font-mono font-bold">
                        {detail.data.financialSummary.orderCount}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-text-muted text-sm">Total considerado</dt>
                      <dd className="text-text-primary font-mono font-bold">
                        {formatCurrency(detail.data.financialSummary.totalConsideredCents)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-text-muted text-sm">Pago</dt>
                      <dd className="text-success font-mono font-bold">
                        {formatCurrency(detail.data.financialSummary.paidCents)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-text-muted text-sm">Pendente</dt>
                      <dd className="text-warning font-mono font-bold">
                        {formatCurrency(detail.data.financialSummary.pendingCents)}
                      </dd>
                    </div>
                  </dl>
                  {detail.data.financialSummary.paymentsRequiringAction > 0 ? (
                    <Button asChild variant="outline" className="mt-4">
                      <Link href="/dashboard/orders">Resolver pagamentos na Central</Link>
                    </Button>
                  ) : null}
                </section>

                <section className="py-6" aria-labelledby="session-transfer-title">
                  <h2 id="session-transfer-title" className="text-text-primary text-lg font-bold">
                    Transferir mesa
                  </h2>
                  <p className="text-text-secondary mt-1 text-sm">
                    O histórico preserva a mesa original; Central e KDS passam a mostrar a nova
                    mesa.
                  </p>
                  {detail.data.transferDestinations.length ? (
                    <div className="mt-4 space-y-3">
                      <label
                        className="text-text-primary block text-sm font-medium"
                        htmlFor="destination-table"
                      >
                        Mesa de destino
                      </label>
                      <select
                        id="destination-table"
                        value={destinationTableId}
                        onChange={(event) => {
                          setDestinationTableId(event.target.value);
                          setConfirmingTransfer(false);
                        }}
                        className="border-border bg-surface text-text-primary focus-visible:ring-brand-500 min-h-11 w-full rounded-lg border px-3 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                      >
                        <option value="">Selecione uma mesa livre</option>
                        {detail.data.transferDestinations.map((table) => (
                          <option key={table.id} value={table.id}>
                            {table.label}
                          </option>
                        ))}
                      </select>
                      {!confirmingTransfer ? (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={!destinationTableId}
                          onClick={() => setConfirmingTransfer(true)}
                        >
                          <ArrowRightLeft aria-hidden="true" /> Transferir mesa
                        </Button>
                      ) : (
                        <div
                          className="bg-warning-light rounded-xl p-4"
                          role="group"
                          aria-labelledby="transfer-confirm-title"
                        >
                          <strong id="transfer-confirm-title" className="text-text-primary">
                            Confirmar transferência?
                          </strong>
                          <p className="text-text-secondary mt-1 text-sm">
                            A equipe verá a mesa de destino imediatamente.
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              disabled={busyId === `transfer:${detail.data.sessionId}`}
                              onClick={() => void transferSession()}
                            >
                              {busyId === `transfer:${detail.data.sessionId}` ? (
                                <Loader2 className="animate-spin" aria-hidden="true" />
                              ) : (
                                <ArrowRightLeft aria-hidden="true" />
                              )}{' '}
                              Confirmar transferência
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => setConfirmingTransfer(false)}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-text-muted mt-3 text-sm">
                      Não há outra mesa ativa e livre agora.
                    </p>
                  )}
                </section>

                <section className="py-6" aria-labelledby="session-close-title">
                  <h2 id="session-close-title" className="text-text-primary text-lg font-bold">
                    Encerrar atendimento
                  </h2>
                  <p className="text-text-secondary mt-1 text-sm">
                    Feche a mesa somente depois de concluir pedidos, pagamentos e solicitações.
                  </p>
                  {!detail.data.closeEvaluation.canClose ? (
                    <p
                      className="bg-warning-light text-text-primary mt-3 rounded-lg p-3 text-sm"
                      role="status"
                    >
                      {detail.data.closeEvaluation.message}
                    </p>
                  ) : null}
                  <Button
                    type="button"
                    className="mt-4"
                    disabled={
                      !detail.data.closeEvaluation.canClose ||
                      busyId === `close:${detail.data.sessionId}`
                    }
                    onClick={() => void closeSession()}
                  >
                    {busyId === `close:${detail.data.sessionId}` ? (
                      <Loader2 className="animate-spin" aria-hidden="true" />
                    ) : (
                      <Check aria-hidden="true" />
                    )}{' '}
                    Fechar mesa
                  </Button>
                </section>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
