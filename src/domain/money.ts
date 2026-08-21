export const MAX_DATABASE_CENTS = 2_147_483_647;

export class MoneyArithmeticError extends RangeError {
  constructor() {
    super('A operação monetária excedeu o intervalo seguro em centavos.');
    this.name = 'MoneyArithmeticError';
  }
}

function assertOperand(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_DATABASE_CENTS) {
    throw new MoneyArithmeticError();
  }
}

export function addCents(left: number, right: number): number {
  assertOperand(left);
  assertOperand(right);
  const result = left + right;
  if (!Number.isSafeInteger(result) || result > MAX_DATABASE_CENTS) {
    throw new MoneyArithmeticError();
  }
  return result;
}

export function multiplyCents(value: number, quantity: number): number {
  assertOperand(value);
  if (!Number.isSafeInteger(quantity) || quantity < 0) throw new MoneyArithmeticError();
  const result = value * quantity;
  if (!Number.isSafeInteger(result) || result > MAX_DATABASE_CENTS) {
    throw new MoneyArithmeticError();
  }
  return result;
}

export function sumCents(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) total = addCents(total, value);
  return total;
}

export function trySumCents(values: Iterable<number>): number | null {
  try {
    return sumCents(values);
  } catch (error) {
    if (error instanceof MoneyArithmeticError) return null;
    throw error;
  }
}

export function tryTotalCents(terms: Iterable<{ value: number; quantity: number }>): number | null {
  try {
    return sumCents(Array.from(terms, ({ value, quantity }) => multiplyCents(value, quantity)));
  } catch (error) {
    if (error instanceof MoneyArithmeticError) return null;
    throw error;
  }
}

export function assertCheckoutFinancialInvariants(input: {
  subtotal: number;
  automaticDiscount: number;
  couponDiscount: number;
  discount: number;
  deliveryFee: number;
  total: number;
  paymentAmount?: number;
  adjustments: Array<{ type: string; amount: number; offerGroupLineId?: string }>;
  offerGroups: Array<{ lineId: string; discountAmount: number }>;
}): void {
  const adjustmentTotal = sumCents(input.adjustments.map((adjustment) => adjustment.amount));
  const computedDiscount = addCents(input.automaticDiscount, input.couponDiscount);
  const computedTotal = addCents(input.subtotal - input.discount, input.deliveryFee);
  const comboAdjustmentByGroup = new Map(
    input.adjustments
      .filter((adjustment) => adjustment.type === 'COMBO')
      .map((adjustment) => [adjustment.offerGroupLineId, adjustment.amount]),
  );
  const comboGroupsValid = input.offerGroups.every(
    (group) => comboAdjustmentByGroup.get(group.lineId) === group.discountAmount,
  );
  if (
    adjustmentTotal !== input.discount ||
    computedDiscount !== input.discount ||
    computedTotal !== input.total ||
    comboAdjustmentByGroup.size !== input.offerGroups.length ||
    (input.paymentAmount != null && input.paymentAmount !== input.total) ||
    !comboGroupsValid
  ) {
    throw new MoneyArithmeticError();
  }
}
