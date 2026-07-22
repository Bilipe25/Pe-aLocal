'use server';

import type { z } from 'zod';

import {
  dailyMetricsInputSchema,
  orderDetailsInputSchema,
  orderHistoryInputSchema,
  orderQueueFiltersSchema,
} from '@/features/orders/query-schemas';
import { actionError, actionSuccess, ValidationError } from '@/server/errors';
import { Permission } from '@/server/permissions';
import * as queryService from '@/server/services/order-query.service';
import { requireActiveStoreContext } from '@/server/services/store-context.service';

function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Os filtros de pedidos são inválidos.',
      parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }
  return parsed.data;
}

function queryContext(
  context: Awaited<ReturnType<typeof requireActiveStoreContext>>,
): queryService.OrderQueryContext {
  return {
    tenantId: context.session.tenantId,
    storeId: context.store.id,
    timeZone: context.store.timeZone,
    userId: context.session.userId,
    tenantRole: context.session.tenantRole,
  };
}

export async function getOrderQueueAction(rawFilters: unknown) {
  try {
    const filters = parseInput(orderQueueFiltersSchema, rawFilters);
    const context = await requireActiveStoreContext(Permission.VIEW_ORDERS);
    return actionSuccess(await queryService.getOrderQueue(queryContext(context), filters));
  } catch (error) {
    return actionError(error);
  }
}

export async function getOrderDetailsAction(rawInput: unknown) {
  try {
    const input = parseInput(orderDetailsInputSchema, rawInput);
    const context = await requireActiveStoreContext(Permission.VIEW_ORDER_DETAILS);
    return actionSuccess(
      await queryService.getOrderDetails(queryContext(context), input.orderId),
    );
  } catch (error) {
    return actionError(error);
  }
}

export async function getOrderHistoryAction(rawInput: unknown) {
  try {
    const input = parseInput(orderHistoryInputSchema, rawInput);
    const context = await requireActiveStoreContext(Permission.VIEW_ORDER_HISTORY);
    return actionSuccess(
      await queryService.getOrderHistory(queryContext(context), input.orderId, input),
    );
  } catch (error) {
    return actionError(error);
  }
}

export async function getDailyOrderMetricsAction(rawInput: unknown) {
  try {
    const input = parseInput(dailyMetricsInputSchema, rawInput);
    const context = await requireActiveStoreContext(Permission.VIEW_ORDERS);
    return actionSuccess(
      await queryService.getDailyOrderMetrics(queryContext(context), input.localDate),
    );
  } catch (error) {
    return actionError(error);
  }
}

export async function getActiveOrderCountsAction() {
  try {
    const context = await requireActiveStoreContext(Permission.VIEW_ORDERS);
    return actionSuccess(await queryService.getActiveOrderCounts(queryContext(context)));
  } catch (error) {
    return actionError(error);
  }
}
