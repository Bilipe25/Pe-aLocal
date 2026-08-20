import type { OrderOperationalAction } from '@/domain/orders/order-workflow';

interface OrderActionPresentation {
  label: string;
  className: string;
}

export const ORDER_ACTION_PRESENTATION: Record<OrderOperationalAction, OrderActionPresentation> = {
  CONFIRM_ORDER: {
    label: 'Aceitar pedido',
    className: 'bg-brand-600 text-white hover:bg-brand-700',
  },
  START_PREPARATION: {
    label: 'Iniciar preparo',
    className: 'bg-warning text-white hover:bg-warning/90',
  },
  MARK_ORDER_READY: {
    label: 'Marcar como pronto',
    className: 'bg-success text-white hover:bg-success/90',
  },
  DISPATCH_FOR_DELIVERY: {
    label: 'Despachar para entrega',
    className: 'bg-info text-white hover:bg-info/90',
  },
  COMPLETE_PICKUP: {
    label: 'Concluir pedido',
    className: 'bg-success text-white hover:bg-success/90',
  },
  COMPLETE_DINE_IN: {
    label: 'Entregue na mesa',
    className: 'bg-success text-white hover:bg-success/90',
  },
  COMPLETE_DELIVERY: {
    label: 'Concluir pedido',
    className: 'bg-success text-white hover:bg-success/90',
  },
  CONFIRM_PAYMENT: {
    label: 'Confirmar pagamento',
    className: 'bg-info text-white hover:bg-info/90',
  },
};
