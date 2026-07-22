import { describe, expect, it } from 'vitest';

import {
  assertOrderTransition,
  canTransitionOrder,
  getAllowedOrderTransitions,
  getNextOperationalAction,
  getOrderWorkflowLabel,
  type OrderOperationalAction,
  type OrderWorkflowContext,
} from '@/domain/orders/order-workflow';
import { BusinessRuleError } from '@/server/errors';
import type { OrderStatus } from '@/types';

const ALL_STATUSES: readonly OrderStatus[] = [
  'PENDING',
  'AWAITING_PAYMENT',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
];

function context(overrides: Partial<OrderWorkflowContext> = {}): OrderWorkflowContext {
  return {
    status: 'PENDING',
    modality: 'PICKUP',
    paymentMethod: 'PIX',
    paymentStatus: 'PAID',
    ...overrides,
  };
}

describe('máquina de estados de pedidos', () => {
  describe('transições permitidas', () => {
    const cases: ReadonlyArray<{
      status: OrderStatus;
      modality: OrderWorkflowContext['modality'];
      expected: readonly OrderStatus[];
    }> = [
      { status: 'PENDING', modality: 'PICKUP', expected: ['CONFIRMED', 'CANCELLED'] },
      { status: 'CONFIRMED', modality: 'PICKUP', expected: ['PREPARING', 'CANCELLED'] },
      { status: 'PREPARING', modality: 'PICKUP', expected: ['READY', 'CANCELLED'] },
      { status: 'PREPARING', modality: 'DELIVERY', expected: ['READY', 'CANCELLED'] },
      { status: 'READY', modality: 'PICKUP', expected: ['DELIVERED', 'CANCELLED'] },
      {
        status: 'READY',
        modality: 'DELIVERY',
        expected: ['OUT_FOR_DELIVERY', 'CANCELLED'],
      },
      {
        status: 'OUT_FOR_DELIVERY',
        modality: 'DELIVERY',
        expected: ['DELIVERED', 'CANCELLED'],
      },
      { status: 'DELIVERED', modality: 'PICKUP', expected: [] },
      { status: 'CANCELLED', modality: 'DELIVERY', expected: [] },
    ];

    for (const testCase of cases) {
      it(`${testCase.status} (${testCase.modality}) permite somente ${testCase.expected.join(', ') || 'nenhuma transição'}`, () => {
        const current = context({ status: testCase.status, modality: testCase.modality });

        expect(getAllowedOrderTransitions(current)).toEqual(testCase.expected);

        for (const candidate of ALL_STATUSES) {
          const isAllowed = testCase.expected.includes(candidate);
          expect(canTransitionOrder(current, candidate)).toBe(isAllowed);

          if (isAllowed) {
            expect(() => assertOrderTransition(current, candidate)).not.toThrow();
          } else {
            expect(() => assertOrderTransition(current, candidate)).toThrow(BusinessRuleError);
          }
        }
      });
    }

    it('assert aceita todas as transições válidas sem efeitos colaterais', () => {
      const current = context({ status: 'PENDING' });
      const snapshot = { ...current };

      expect(() => assertOrderTransition(current, 'CONFIRMED')).not.toThrow();
      expect(() => assertOrderTransition(current, 'CANCELLED')).not.toThrow();
      expect(current).toEqual(snapshot);
    });

    it('assert rejeita saltos, regressões e repetição do estado', () => {
      const invalidCases: ReadonlyArray<readonly [OrderStatus, OrderStatus]> = [
        ['PENDING', 'PREPARING'],
        ['CONFIRMED', 'PENDING'],
        ['PREPARING', 'OUT_FOR_DELIVERY'],
        ['READY', 'CONFIRMED'],
        ['OUT_FOR_DELIVERY', 'READY'],
        ['DELIVERED', 'DELIVERED'],
        ['DELIVERED', 'CANCELLED'],
        ['CANCELLED', 'PENDING'],
      ];

      for (const [status, nextStatus] of invalidCases) {
        expect(() => assertOrderTransition(context({ status }), nextStatus)).toThrow(
          BusinessRuleError,
        );
      }
    });
  });

  describe('modalidade', () => {
    it('retirada pronta conclui diretamente e não pode sair para entrega', () => {
      const pickup = context({ status: 'READY', modality: 'PICKUP' });

      expect(canTransitionOrder(pickup, 'DELIVERED')).toBe(true);
      expect(canTransitionOrder(pickup, 'OUT_FOR_DELIVERY')).toBe(false);
      expect(getNextOperationalAction(pickup)).toBe('COMPLETE_PICKUP');
    });

    it('delivery pronto deve sair para entrega antes de concluir', () => {
      const delivery = context({ status: 'READY', modality: 'DELIVERY' });

      expect(canTransitionOrder(delivery, 'OUT_FOR_DELIVERY')).toBe(true);
      expect(canTransitionOrder(delivery, 'DELIVERED')).toBe(false);
      expect(getNextOperationalAction(delivery)).toBe('DISPATCH_FOR_DELIVERY');
    });
  });

  describe('pagamento na conclusão', () => {
    it('exige PIX pago para concluir retirada ou entrega', () => {
      for (const status of ['READY', 'OUT_FOR_DELIVERY'] as const) {
        const unpaidPix = context({
          status,
          modality: status === 'READY' ? 'PICKUP' : 'DELIVERY',
          paymentMethod: 'PIX',
          paymentStatus: 'PENDING',
        });

        expect(getAllowedOrderTransitions(unpaidPix)).toEqual(['CANCELLED']);
        expect(canTransitionOrder(unpaidPix, 'DELIVERED')).toBe(false);
        expect(getNextOperationalAction(unpaidPix)).toBe('CONFIRM_PAYMENT');
        expect(() => assertOrderTransition(unpaidPix, 'DELIVERED')).toThrow(BusinessRuleError);
        expect(() => assertOrderTransition(unpaidPix, 'DELIVERED')).toThrow(
          'O pagamento via PIX deve estar confirmado',
        );
      }
    });

    it('não considera CUSTOMER_REPORTED_PAID como PIX pago', () => {
      const reportedPix = context({
        status: 'READY',
        paymentMethod: 'PIX',
        paymentStatus: 'CUSTOMER_REPORTED_PAID',
      });

      expect(canTransitionOrder(reportedPix, 'DELIVERED')).toBe(false);
      expect(getNextOperationalAction(reportedPix)).toBe('CONFIRM_PAYMENT');
    });

    it.each(['CASH', 'CARD_ON_DELIVERY'] as const)(
      '%s pendente pode ser concluído para futura confirmação atômica',
      (paymentMethod) => {
        const pickup = context({
          status: 'READY',
          paymentMethod,
          paymentStatus: 'PENDING',
        });
        const delivery = context({
          status: 'OUT_FOR_DELIVERY',
          modality: 'DELIVERY',
          paymentMethod,
          paymentStatus: 'PENDING',
        });

        expect(canTransitionOrder(pickup, 'DELIVERED')).toBe(true);
        expect(canTransitionOrder(delivery, 'DELIVERED')).toBe(true);
        expect(getNextOperationalAction(pickup)).toBe('COMPLETE_PICKUP');
        expect(getNextOperationalAction(delivery)).toBe('COMPLETE_DELIVERY');
      },
    );

    it.each(['FAILED', 'CANCELLED', 'REFUNDED'] as const)(
      'não conclui com pagamento %s',
      (paymentStatus) => {
        const current = context({
          status: 'OUT_FOR_DELIVERY',
          modality: 'DELIVERY',
          paymentMethod: 'CASH',
          paymentStatus,
        });

        expect(canTransitionOrder(current, 'DELIVERED')).toBe(false);
        expect(() => assertOrderTransition(current, 'DELIVERED')).toThrow(BusinessRuleError);
      },
    );
  });

  describe('estados especiais e terminais', () => {
    it('rejeita AWAITING_PAYMENT como estado atual operacional', () => {
      const awaitingPayment = context({ status: 'AWAITING_PAYMENT' });

      expect(() => getAllowedOrderTransitions(awaitingPayment)).toThrow(BusinessRuleError);
      expect(() => getNextOperationalAction(awaitingPayment)).toThrow(BusinessRuleError);
      expect(() => assertOrderTransition(awaitingPayment, 'PENDING')).toThrow(BusinessRuleError);
      expect(canTransitionOrder(awaitingPayment, 'CONFIRMED')).toBe(false);
    });

    it('rejeita AWAITING_PAYMENT como destino', () => {
      const pending = context({ status: 'PENDING' });

      expect(canTransitionOrder(pending, 'AWAITING_PAYMENT')).toBe(false);
      expect(() => assertOrderTransition(pending, 'AWAITING_PAYMENT')).toThrow(
        BusinessRuleError,
      );
    });

    it.each(['DELIVERED', 'CANCELLED'] as const)('%s é terminal', (status) => {
      const terminal = context({ status });

      expect(getAllowedOrderTransitions(terminal)).toEqual([]);
      expect(getNextOperationalAction(terminal)).toBeNull();
      for (const candidate of ALL_STATUSES) {
        expect(canTransitionOrder(terminal, candidate)).toBe(false);
      }
    });
  });

  describe('ações operacionais e labels', () => {
    it('retorna a ação principal de cada etapa', () => {
      expect(getNextOperationalAction(context({ status: 'PENDING' }))).toBe('CONFIRM_ORDER');
      expect(getNextOperationalAction(context({ status: 'CONFIRMED' }))).toBe(
        'START_PREPARATION',
      );
      expect(getNextOperationalAction(context({ status: 'PREPARING' }))).toBe(
        'MARK_ORDER_READY',
      );
      expect(
        getNextOperationalAction(context({ status: 'OUT_FOR_DELIVERY', modality: 'DELIVERY' })),
      ).toBe('COMPLETE_DELIVERY');
    });

    it('fornece labels estáveis em pt-BR para todas as ações', () => {
      const expectedLabels: Record<OrderOperationalAction, string> = {
        CONFIRM_ORDER: 'Aceitar pedido',
        START_PREPARATION: 'Iniciar preparo',
        MARK_ORDER_READY: 'Marcar como pronto',
        DISPATCH_FOR_DELIVERY: 'Despachar para entrega',
        CONFIRM_PAYMENT: 'Confirmar pagamento',
        COMPLETE_PICKUP: 'Concluir retirada',
        COMPLETE_DELIVERY: 'Concluir entrega',
      };

      for (const [action, label] of Object.entries(expectedLabels) as Array<
        [OrderOperationalAction, string]
      >) {
        expect(getOrderWorkflowLabel(action)).toBe(label);
      }
    });
  });
});
