'use client';

import {
  AlertTriangle,
  Bike,
  CheckCircle2,
  Clock3,
  Loader2,
  MapPin,
  ShoppingBag,
} from 'lucide-react';

import { getKdsElapsedSeconds, getKdsUrgency, getKdsUrgencyLabel } from '@/domain/orders/kds';
import { cn } from '@/lib/utils';
import type { KdsOrderDTO } from '@/types/kds';
import { KdsStageTimer } from './kds-stage-timer';

function itemOptions(order: KdsOrderDTO['items'][number]) {
  return order.options
    .map((option) => (option.groupName ? `${option.groupName}: ${option.name}` : option.name))
    .join(' · ');
}

export function KdsOrderCard({
  order,
  nowMs,
  pending,
  onAdvance,
}: {
  order: KdsOrderDTO;
  nowMs: number;
  pending: boolean;
  onAdvance: (order: KdsOrderDTO) => void;
}) {
  const elapsedSeconds = getKdsElapsedSeconds(order.stageStartedAt, nowMs);
  const urgency = getKdsUrgency(elapsedSeconds, order.stageAlertThresholdMinutes);
  const urgencyLabel = getKdsUrgencyLabel(order.status, urgency);
  const actionable = order.status === 'CONFIRMED' || order.status === 'PREPARING';
  const actionLabel = order.status === 'CONFIRMED' ? 'Iniciar preparo' : 'Marcar como pronto';
  const ModeIcon =
    order.modality === 'DELIVERY' ? Bike : order.modality === 'DINE_IN' ? MapPin : ShoppingBag;
  const serviceLabel =
    order.modality === 'DELIVERY'
      ? 'Entrega'
      : order.modality === 'DINE_IN'
        ? (order.diningTableLabel ?? 'Salão')
        : order.origin === 'POS'
          ? 'Balcão'
          : 'Retirada';

  return (
    <article
      className={cn(
        'kds-ticket',
        urgency === 'WARNING' && 'kds-ticket-warning',
        urgency === 'CRITICAL' && 'kds-ticket-critical',
      )}
      aria-labelledby={`kds-order-${order.id}`}
      data-order-id={order.id}
      data-order-status={order.status}
      data-urgency={urgency}
    >
      <div className="kds-ticket-content">
        <div className="kds-ticket-meta">
          <span className="kds-service-mode">
            <ModeIcon aria-hidden="true" />
            {serviceLabel}
          </span>
          {urgencyLabel ? (
            <span className="kds-urgency-label">
              {urgency === 'CRITICAL' ? (
                <AlertTriangle aria-hidden="true" />
              ) : (
                <Clock3 aria-hidden="true" />
              )}
              {urgencyLabel}
            </span>
          ) : null}
        </div>

        <div className="kds-ticket-heading">
          <h3 id={`kds-order-${order.id}`}>
            {order.modality === 'DINE_IN' ? serviceLabel : `#${order.orderNumber}`}
          </h3>
          {order.modality === 'DINE_IN' ? (
            <span className="kds-order-number">Pedido #{order.orderNumber}</span>
          ) : null}
          <KdsStageTimer order={order} nowMs={nowMs} />
        </div>

        <ul className="kds-ticket-items" aria-label={`Itens do pedido #${order.orderNumber}`}>
          {order.items.map((item) => {
            const options = itemOptions(item);
            return (
              <li key={item.id} className="kds-ticket-item">
                <span className="kds-item-quantity">{item.quantity}×</span>
                <div className="kds-item-copy">
                  <p className="kds-item-name">{item.productName}</p>
                  {item.offerGroup ? (
                    <p className="kds-item-options">Combo: {item.offerGroup.name}</p>
                  ) : null}
                  {options ? <p className="kds-item-options">{options}</p> : null}
                  {item.notes ? (
                    <p className="kds-item-note">
                      <AlertTriangle aria-hidden="true" />
                      {item.notes}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>

        {order.notes ? (
          <p className="kds-order-note">
            <AlertTriangle aria-hidden="true" />
            <span>{order.notes}</span>
          </p>
        ) : null}
      </div>

      {actionable ? (
        <button
          type="button"
          className="kds-ticket-action"
          disabled={pending}
          aria-busy={pending}
          aria-label={`${actionLabel} do pedido #${order.orderNumber}`}
          onClick={() => onAdvance(order)}
        >
          {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {pending ? 'Atualizando…' : actionLabel}
        </button>
      ) : (
        <div className="kds-ready-footer">
          <CheckCircle2 aria-hidden="true" />
          {order.modality === 'DINE_IN'
            ? 'Entrega e pagamento são concluídos na Central'
            : 'Pronto para entregar'}
        </div>
      )}
    </article>
  );
}
