import { describe, expect, it } from 'vitest';

import {
  assertPaymentTransition,
  canTransitionPayment,
  getAllowedPaymentTransitions,
  getPaymentTransitionTarget,
  getPaymentWorkflowLabel,
  type PaymentOperation,
  type PaymentWorkflowContext,
} from '@/domain/orders/payment-workflow';
import { BusinessRuleError } from '@/server/errors';
import type { PaymentStatus } from '@/types';

function context(overrides: Partial<PaymentWorkflowContext> = {}): PaymentWorkflowContext {
  return {
    status: 'PENDING',
    method: 'PIX',
    orderStatus: 'PENDING',
    ...overrides,
  };
}

describe('máquina de estados de pagamento', () => {
  it.each<readonly [PaymentStatus, readonly PaymentStatus[]]>([
    ['PENDING', ['CUSTOMER_REPORTED_PAID', 'PAID', 'CANCELLED']],
    ['CUSTOMER_REPORTED_PAID', ['PAID', 'FAILED', 'CANCELLED']],
    ['PAID', ['REFUNDED']],
    ['FAILED', ['PENDING', 'CANCELLED']],
    ['CANCELLED', []],
    ['REFUNDED', []],
  ])('%s expõe somente os destinos estruturais permitidos', (status, expected) => {
    expect(getAllowedPaymentTransitions(context({ status }))).toEqual(expected);
  });

  it('permite ao cliente informar somente PIX pendente', () => {
    expect(canTransitionPayment(context(), 'REPORT_BY_CUSTOMER')).toBe(true);
    expect(canTransitionPayment(context({ method: 'CASH' }), 'REPORT_BY_CUSTOMER')).toBe(false);
    expect(
      canTransitionPayment(context({ status: 'CUSTOMER_REPORTED_PAID' }), 'REPORT_BY_CUSTOMER'),
    ).toBe(false);
  });

  it.each(['PIX', 'CASH'] as const)('permite confirmação manual de %s', (method) => {
    expect(canTransitionPayment(context({ method }), 'CONFIRM_MANUALLY')).toBe(true);
  });

  it('não permite confirmação manual antecipada de cartão na entrega', () => {
    expect(canTransitionPayment(context({ method: 'CARD_ON_DELIVERY' }), 'CONFIRM_MANUALLY')).toBe(
      false,
    );
  });

  it.each(['CASH', 'CARD_ON_DELIVERY'] as const)(
    'confirma %s na conclusão somente na etapa de entrega ou retirada',
    (method) => {
      expect(
        canTransitionPayment(context({ method, orderStatus: 'READY' }), 'CONFIRM_ON_COMPLETION'),
      ).toBe(true);
      expect(
        canTransitionPayment(
          context({ method, orderStatus: 'PREPARING' }),
          'CONFIRM_ON_COMPLETION',
        ),
      ).toBe(false);
    },
  );

  it('não usa confirmação na conclusão para PIX', () => {
    expect(canTransitionPayment(context({ orderStatus: 'READY' }), 'CONFIRM_ON_COMPLETION')).toBe(
      false,
    );
  });

  it('rejeita e reabre somente pagamentos PIX pelo fluxo explícito', () => {
    expect(canTransitionPayment(context({ status: 'CUSTOMER_REPORTED_PAID' }), 'MARK_FAILED')).toBe(
      true,
    );
    expect(canTransitionPayment(context({ status: 'FAILED' }), 'RETRY_FAILED')).toBe(true);
    expect(
      canTransitionPayment(context({ status: 'FAILED', method: 'CASH' }), 'RETRY_FAILED'),
    ).toBe(false);
  });

  it('permite somente reembolso integral a partir de PAID', () => {
    expect(canTransitionPayment(context({ status: 'PAID' }), 'REFUND')).toBe(true);
    expect(canTransitionPayment(context({ status: 'PENDING' }), 'REFUND')).toBe(false);
  });

  it.each(['CANCELLED', 'REFUNDED'] as const)('%s é terminal', (status) => {
    const terminal = context({ status });
    const operations: PaymentOperation[] = [
      'REPORT_BY_CUSTOMER',
      'CONFIRM_MANUALLY',
      'CONFIRM_ON_COMPLETION',
      'MARK_FAILED',
      'RETRY_FAILED',
      'CANCEL',
      'REFUND',
    ];

    for (const operation of operations) {
      expect(canTransitionPayment(terminal, operation)).toBe(false);
      expect(() => assertPaymentTransition(terminal, operation)).toThrow(BusinessRuleError);
    }
  });

  it('permite remediar pagamento pago após cancelamento e bloqueia outras mutações', () => {
    expect(
      canTransitionPayment(context({ status: 'PAID', orderStatus: 'CANCELLED' }), 'REFUND'),
    ).toBe(true);
    expect(
      canTransitionPayment(
        context({ status: 'PENDING', orderStatus: 'CANCELLED' }),
        'REPORT_BY_CUSTOMER',
      ),
    ).toBe(false);
  });

  it('expõe destinos e labels sem modificar o contexto', () => {
    const current = context();
    const snapshot = { ...current };

    expect(getPaymentTransitionTarget('REPORT_BY_CUSTOMER')).toBe('CUSTOMER_REPORTED_PAID');
    expect(getPaymentTransitionTarget('REFUND')).toBe('REFUNDED');
    expect(getPaymentWorkflowLabel('REFUND')).toBe('Registrar reembolso integral');
    expect(() => assertPaymentTransition(current, 'REPORT_BY_CUSTOMER')).not.toThrow();
    expect(current).toEqual(snapshot);
  });
});
