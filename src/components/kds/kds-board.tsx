'use client';

/*
 * KDS-RAIL-V1
 * THESIS: uma passagem de comandas legível sob pressão, sem kanban genérico ou estado paralelo.
 * OWN-WORLD: Papel/Tinta com Kraft, Azulejo e Erva por etapa; Pimenta somente para ação.
 * STORY: ver o mais antigo, ler restrições, avançar uma etapa e confiar na sincronização.
 * FIRST VIEWPORT: cabeçalho compacto e três trilhos; número, tempo, itens e uma ação por ticket.
 * FORM: pass-through de cozinha aprovado no protótipo 1440/1024/390.
 * FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
 */

import { useEffect, useEffectEvent, useRef, useState, type KeyboardEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  CheckCircle2,
  ChefHat,
  ClipboardList,
  Expand,
  RefreshCw,
  TriangleAlert,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { toast } from 'sonner';

import { KdsOrderCard } from '@/components/kds/kds-order-card';
import {
  KDS_LANES,
  applyConfirmedKdsTransition,
  getKdsElapsedSeconds,
  getKdsUrgency,
} from '@/domain/orders/kds';
import {
  markOrderReadyAction,
  startOrderPreparationAction,
  undoLastOrderTransitionAction,
} from '@/features/orders/admin-actions';
import { useKdsOrders, kdsQueryKeys } from '@/hooks/use-kds-orders';
import { useOrderNotificationSound } from '@/hooks/use-order-notification-sound';
import { useOrderRealtime, type OrderRealtimeState } from '@/hooks/use-order-realtime';
import { orderQueryKeys } from '@/hooks/use-orders';
import { cn } from '@/lib/utils';
import type { KdsLaneKey, KdsOrderDTO, KdsSnapshotDTO } from '@/types/kds';

const LANE_META: Record<
  KdsLaneKey,
  { title: string; description: string; icon: typeof ClipboardList }
> = {
  TODO: { title: 'A fazer', description: 'Pedidos confirmados', icon: ClipboardList },
  MAKING: { title: 'Em preparo', description: 'Mais antigos primeiro', icon: ChefHat },
  READY: { title: 'Prontos', description: 'Aguardando retirada ou saída', icon: CheckCircle2 },
};

const REALTIME_PRESENTATION: Record<OrderRealtimeState, { label: string; tone: string }> = {
  unavailable: { label: 'Atualização automática', tone: 'info' },
  connecting: { label: 'Conectando…', tone: 'warning' },
  connected: { label: 'Em tempo real', tone: 'success' },
  degraded: { label: 'Conexão degradada', tone: 'warning' },
};

function laneAlertCount(items: KdsOrderDTO[], nowMs: number) {
  return items.filter(
    (order) =>
      getKdsUrgency(
        getKdsElapsedSeconds(order.stageStartedAt, nowMs),
        order.stageAlertThresholdMinutes,
      ) !== 'NORMAL',
  ).length;
}

export function KdsBoard({
  storeId,
  storeName,
  authorizationScope,
  initialSnapshot,
}: {
  storeId: string;
  storeName: string;
  authorizationScope: string;
  initialSnapshot: KdsSnapshotDTO;
}) {
  const queryClient = useQueryClient();
  const [activeLane, setActiveLane] = useState<KdsLaneKey>('TODO');
  const [nowMs, setNowMs] = useState(() => new Date(initialSnapshot.updatedAt).getTime());
  const [pendingOrderIds, setPendingOrderIds] = useState<Set<string>>(() => new Set());
  const [fullscreen, setFullscreen] = useState(false);
  const previousStatusesRef = useRef<Map<string, KdsOrderDTO['status']> | null>(null);
  const realtimeState = useOrderRealtime(storeId, {
    onNewOrder: () => {
      void queryClient.invalidateQueries({ queryKey: kdsQueryKeys.store(storeId) });
    },
    onOrderUpdated: () => {
      void queryClient.invalidateQueries({ queryKey: kdsQueryKeys.store(storeId) });
    },
    onPaymentUpdated: () => {
      void queryClient.invalidateQueries({ queryKey: kdsQueryKeys.store(storeId) });
    },
  });
  const orders = useKdsOrders(storeId, authorizationScope, initialSnapshot, realtimeState);
  const sound = useOrderNotificationSound(`kds:${storeId}`);
  const playSound = useEffectEvent(sound.play);
  const snapshot = orders.data;
  const realtime = REALTIME_PRESENTATION[realtimeState];

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    const current = new Map<string, KdsOrderDTO['status']>();
    for (const lane of KDS_LANES) {
      for (const order of snapshot.lanes[lane].items) current.set(order.id, order.status);
    }
    const previous = previousStatusesRef.current;
    previousStatusesRef.current = current;
    if (!previous) return;
    const enteredTodo = [...current].some(
      ([orderId, status]) => status === 'CONFIRMED' && previous.get(orderId) !== 'CONFIRMED',
    );
    if (enteredTodo) void playSound();
  }, [snapshot]);

  async function refreshAll(orderId?: string) {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: kdsQueryKeys.store(storeId) }),
      queryClient.invalidateQueries({ queryKey: orderQueryKeys.boardStore(storeId) }),
      queryClient.invalidateQueries({ queryKey: orderQueryKeys.queueStore(storeId) }),
      queryClient.invalidateQueries({ queryKey: orderQueryKeys.metricsStore(storeId) }),
      orderId
        ? queryClient.invalidateQueries({
            queryKey: orderQueryKeys.details(storeId, authorizationScope, orderId),
          })
        : Promise.resolve(),
    ]);
  }

  function applyServerTransition(input: {
    orderId: string;
    status: string;
    version: number;
    statusChangedAt: string;
  }) {
    queryClient.setQueryData<KdsSnapshotDTO>(
      kdsQueryKeys.snapshot(storeId, authorizationScope),
      (current) => (current ? applyConfirmedKdsTransition(current, input) : current),
    );
  }

  async function undo(orderId: string, expectedVersion: number) {
    const result = await undoLastOrderTransitionAction({ orderId, expectedVersion });
    if (!result.success) {
      toast.error(
        result.error.code === 'CONFLICT'
          ? 'Este pedido já foi atualizado em outro dispositivo.'
          : result.error.message,
      );
      await refreshAll(orderId);
      return;
    }
    applyServerTransition(result.data);
    void refreshAll(orderId);
    toast.success('Alteração desfeita.');
  }

  async function advance(order: KdsOrderDTO) {
    if (pendingOrderIds.has(order.id)) return;
    setPendingOrderIds((current) => new Set(current).add(order.id));
    try {
      const result =
        order.status === 'CONFIRMED'
          ? await startOrderPreparationAction({
              orderId: order.id,
              expectedVersion: order.version,
            })
          : await markOrderReadyAction({
              orderId: order.id,
              expectedVersion: order.version,
            });
      if (!result.success) {
        toast.error(
          result.error.code === 'CONFLICT'
            ? 'Este pedido já foi atualizado em outro dispositivo.'
            : result.error.message,
        );
        await refreshAll(order.id);
        return;
      }
      applyServerTransition(result.data);
      void refreshAll(order.id);
      if (result.data.notificationPending) {
        toast.warning('Pedido atualizado. A sincronização em tempo real está sendo repetida.');
      }
      toast.success(
        order.status === 'CONFIRMED'
          ? `Pedido #${order.orderNumber} em preparo.`
          : `Pedido #${order.orderNumber} pronto.`,
        {
          duration: 10_000,
          action: {
            label: 'Desfazer',
            onClick: () => void undo(order.id, result.data.version),
          },
        },
      );
    } catch {
      toast.error('Não foi possível atualizar o pedido. Verifique a conexão e tente novamente.');
    } finally {
      setPendingOrderIds((current) => {
        const next = new Set(current);
        next.delete(order.id);
        return next;
      });
    }
  }

  function selectLane(lane: KdsLaneKey, focus = false) {
    setActiveLane(lane);
    if (focus) requestAnimationFrame(() => document.getElementById(`kds-tab-${lane}`)?.focus());
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, lane: KdsLaneKey) {
    const index = KDS_LANES.indexOf(lane);
    const target =
      event.key === 'ArrowRight'
        ? KDS_LANES[(index + 1) % KDS_LANES.length]
        : event.key === 'ArrowLeft'
          ? KDS_LANES[(index - 1 + KDS_LANES.length) % KDS_LANES.length]
          : event.key === 'Home'
            ? KDS_LANES[0]
            : event.key === 'End'
              ? KDS_LANES.at(-1)
              : null;
    if (!target) return;
    event.preventDefault();
    selectLane(target, true);
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      toast.error('O navegador não permitiu abrir a tela cheia.');
    }
  }

  return (
    <div className="kds-workspace">
      <header className="kds-topbar">
        <Link href="/dashboard" className="kds-brand" aria-label="PedidoLocal — voltar ao painel">
          <Image src="/pwa/pedidolocal-icon-v1-192.png" alt="" width={40} height={40} priority />
          <span>
            <strong>PedidoLocal</strong>
            <span>Tela da cozinha</span>
          </span>
        </Link>

        <p className="kds-store-name">
          <span>Cozinha de</span> {storeName}
        </p>

        <div className="kds-global-actions">
          <div className="kds-connection" role="status" aria-label={realtime.label}>
            <span data-tone={realtime.tone} aria-hidden="true" />
            <strong>{realtime.label}</strong>
          </div>
          <button
            type="button"
            className="kds-icon-action"
            onClick={() => void sound.toggle()}
            disabled={sound.isActivating}
            aria-pressed={sound.enabled}
            aria-label={sound.enabled ? 'Desativar som da cozinha' : 'Ativar som da cozinha'}
          >
            {sound.enabled ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
            <span>
              {sound.isActivating ? 'Ativando…' : sound.enabled ? 'Som ativo' : 'Ativar som'}
            </span>
          </button>
          <button
            type="button"
            className="kds-icon-action kds-fullscreen-action"
            onClick={() => void toggleFullscreen()}
            aria-label={fullscreen ? 'Sair da tela cheia' : 'Entrar em tela cheia'}
          >
            <Expand aria-hidden="true" />
            <span>{fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}</span>
          </button>
        </div>
      </header>

      <nav className="kds-mobile-tabs" aria-label="Etapas da cozinha" role="tablist">
        {KDS_LANES.map((lane) => {
          const meta = LANE_META[lane];
          const alertCount = laneAlertCount(snapshot.lanes[lane].items, nowMs);
          return (
            <button
              key={lane}
              id={`kds-tab-${lane}`}
              type="button"
              role="tab"
              aria-selected={activeLane === lane}
              aria-controls={`kds-lane-${lane}`}
              tabIndex={activeLane === lane ? 0 : -1}
              data-has-alerts={alertCount > 0}
              onClick={() => selectLane(lane)}
              onKeyDown={(event) => onTabKeyDown(event, lane)}
            >
              <span>
                {meta.title} {snapshot.lanes[lane].total}
              </span>
              <small>
                {alertCount > 0
                  ? `${alertCount} ${lane === 'READY' ? 'aguardando' : alertCount === 1 ? 'atrasado' : 'atrasados'}`
                  : 'Sem alertas'}
              </small>
            </button>
          );
        })}
      </nav>

      {realtimeState === 'degraded' || realtimeState === 'unavailable' ? (
        <div className="kds-system-banner" role="status">
          <TriangleAlert aria-hidden="true" />
          <span>
            A conexão em tempo real está indisponível. A tela continua atualizando automaticamente.
          </span>
          <button type="button" onClick={() => void orders.refetch()} disabled={orders.isFetching}>
            <RefreshCw
              className={orders.isFetching ? 'animate-spin' : undefined}
              aria-hidden="true"
            />
            Atualizar agora
          </button>
        </div>
      ) : null}

      {sound.error ? (
        <div className="kds-system-banner" role="alert">
          <TriangleAlert aria-hidden="true" />
          <span>{sound.error}</span>
        </div>
      ) : null}

      {orders.isError ? (
        <div className="kds-system-banner kds-system-banner-error" role="alert">
          <TriangleAlert aria-hidden="true" />
          <span>Não foi possível sincronizar a cozinha. Confira a conexão e tente novamente.</span>
          <button type="button" onClick={() => void orders.refetch()} disabled={orders.isFetching}>
            Tentar novamente
          </button>
        </div>
      ) : null}

      {snapshot.truncated ? (
        <div className="kds-system-banner" role="status">
          <TriangleAlert aria-hidden="true" />
          <span>
            Há mais de 200 pedidos ativos. Os mais antigos estão visíveis; conclua a fila para
            carregar os demais.
          </span>
        </div>
      ) : null}

      <main className="kds-board" aria-label="Pedidos da cozinha" aria-busy={orders.isFetching}>
        {KDS_LANES.map((lane) => {
          const meta = LANE_META[lane];
          const LaneIcon = meta.icon;
          const laneData = snapshot.lanes[lane];
          return (
            <section
              key={lane}
              id={`kds-lane-${lane}`}
              role="tabpanel"
              aria-labelledby={`kds-tab-${lane}`}
              className={cn('kds-lane', activeLane === lane && 'kds-lane-mobile-active')}
              data-lane={lane}
            >
              <header className="kds-lane-header">
                <div>
                  <LaneIcon aria-hidden="true" />
                  <span>
                    <h2>{meta.title}</h2>
                    <p>{meta.description}</p>
                  </span>
                </div>
                <strong aria-label={`${laneData.total} pedidos`}>{laneData.total}</strong>
              </header>

              <div className="kds-lane-scroll">
                {laneData.items.length > 0 ? (
                  <div className="kds-ticket-list">
                    {laneData.items.map((order) => (
                      <KdsOrderCard
                        key={order.id}
                        order={order}
                        nowMs={nowMs}
                        pending={pendingOrderIds.has(order.id)}
                        onAdvance={(current) => void advance(current)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="kds-empty-state">
                    <Archive aria-hidden="true" />
                    <h3>Nenhum pedido aqui</h3>
                    <p>A etapa será atualizada automaticamente quando um pedido mudar.</p>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}
