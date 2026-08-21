import 'server-only';

import { Prisma } from '@prisma/client';

import { storeAssetUrl } from '@/features/assets/urls';
import { getDb } from '@/server/database/client';
import { AuthorizationError, BusinessRuleError, ConcurrencyError } from '@/server/errors';
import { hasTenantPermission, Permission } from '@/server/permissions';
import { requirePosContext, type PosContext } from '@/server/services/pos-context.service';
import { rebuildOrderIntentFromHistory } from '@/server/services/repeat-order.service';

const MAX_POS_SHORTCUTS = 24;
const RECENT_POS_ORDERS_LIMIT = 20;
const TOP_POS_PRODUCTS_LIMIT = 12;

function normalizeTerminalName(name: string) {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('pt-BR');
}

function assertPermission(context: PosContext, permission: Permission, message: string) {
  if (!hasTenantPermission(context.session.tenantRole, permission)) {
    throw new AuthorizationError(message);
  }
}

export async function listPosTerminals(providedContext?: PosContext) {
  const context = providedContext ?? (await requirePosContext());
  return getDb().storePosTerminal.findMany({
    where: { tenantId: context.session.tenantId, storeId: context.store.id },
    orderBy: [{ isActive: 'desc' }, { nameNormalized: 'asc' }, { id: 'asc' }],
    select: { id: true, name: true, isActive: true, version: true },
  });
}

export async function savePosTerminal(input: {
  id?: string;
  name: string;
  expectedVersion?: number;
}) {
  const context = await requirePosContext();
  assertPermission(
    context,
    Permission.MANAGE_POS_TERMINALS,
    'Seu perfil não pode gerenciar terminais do PDV.',
  );
  const nameNormalized = normalizeTerminalName(input.name);
  if (!input.id) {
    return getDb().storePosTerminal.create({
      data: {
        tenantId: context.session.tenantId,
        storeId: context.store.id,
        name: input.name,
        nameNormalized,
      },
      select: { id: true, name: true, isActive: true, version: true },
    });
  }
  const updated = await getDb().storePosTerminal.updateMany({
    where: {
      id: input.id,
      tenantId: context.session.tenantId,
      storeId: context.store.id,
      version: input.expectedVersion,
    },
    data: { name: input.name, nameNormalized, version: { increment: 1 } },
  });
  if (updated.count !== 1) throw new ConcurrencyError('Terminal do PDV');
  return getDb().storePosTerminal.findFirstOrThrow({
    where: { id: input.id, tenantId: context.session.tenantId, storeId: context.store.id },
    select: { id: true, name: true, isActive: true, version: true },
  });
}

export async function deactivatePosTerminal(id: string, expectedVersion: number) {
  const context = await requirePosContext();
  assertPermission(
    context,
    Permission.MANAGE_POS_TERMINALS,
    'Seu perfil não pode gerenciar terminais do PDV.',
  );
  const updated = await getDb().storePosTerminal.updateMany({
    where: {
      id,
      tenantId: context.session.tenantId,
      storeId: context.store.id,
      version: expectedVersion,
      isActive: true,
    },
    data: { isActive: false, version: { increment: 1 } },
  });
  if (updated.count !== 1) throw new ConcurrencyError('Terminal do PDV');
  return { id, isActive: false as const, version: expectedVersion + 1 };
}

export async function listPosShortcuts(providedContext?: PosContext) {
  const context = providedContext ?? (await requirePosContext());
  const shortcuts = await getDb().storePosShortcut.findMany({
    where: { tenantId: context.session.tenantId, storeId: context.store.id },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
    take: MAX_POS_SHORTCUTS,
    select: {
      id: true,
      position: true,
      product: {
        select: {
          id: true,
          name: true,
          basePrice: true,
          imageUrl: true,
          imageAssetId: true,
          isAvailable: true,
          isSoldOut: true,
          archivedAt: true,
        },
      },
      offer: {
        select: { id: true, name: true, kind: true, isActive: true, archivedAt: true },
      },
    },
  });
  return shortcuts.map((shortcut) => ({
    id: shortcut.id,
    position: shortcut.position,
    product: shortcut.product
      ? {
          ...shortcut.product,
          imageUrl: shortcut.product.imageAssetId
            ? storeAssetUrl(shortcut.product.imageAssetId, 384)
            : shortcut.product.imageUrl,
          available:
            !shortcut.product.archivedAt &&
            shortcut.product.isAvailable &&
            !shortcut.product.isSoldOut,
        }
      : null,
    offer: shortcut.offer
      ? {
          ...shortcut.offer,
          available: shortcut.offer.isActive && !shortcut.offer.archivedAt,
        }
      : null,
  }));
}

export async function createPosShortcut(input: { productId?: string; offerId?: string }) {
  const context = await requirePosContext();
  assertPermission(
    context,
    Permission.MANAGE_POS_SHORTCUTS,
    'Seu perfil não pode gerenciar produtos rápidos.',
  );
  const count = await getDb().storePosShortcut.count({
    where: { tenantId: context.session.tenantId, storeId: context.store.id },
  });
  if (count >= MAX_POS_SHORTCUTS) {
    throw new BusinessRuleError(`O PDV permite no máximo ${MAX_POS_SHORTCUTS} produtos rápidos.`);
  }
  if (input.productId) {
    const product = await getDb().product.findFirst({
      where: {
        id: input.productId,
        tenantId: context.session.tenantId,
        storeId: context.store.id,
        archivedAt: null,
      },
      select: { id: true },
    });
    if (!product) throw new BusinessRuleError('O produto selecionado não está disponível.');
  }
  if (input.offerId) {
    const offer = await getDb().storeOffer.findFirst({
      where: {
        id: input.offerId,
        tenantId: context.session.tenantId,
        storeId: context.store.id,
        archivedAt: null,
      },
      select: { id: true },
    });
    if (!offer) throw new BusinessRuleError('A oferta selecionada não está disponível.');
  }
  await getDb().storePosShortcut.create({
    data: {
      tenantId: context.session.tenantId,
      storeId: context.store.id,
      productId: input.productId ?? null,
      offerId: input.offerId ?? null,
      position: count,
    },
  });
  return listPosShortcuts(context);
}

export async function deletePosShortcut(id: string) {
  const context = await requirePosContext();
  assertPermission(
    context,
    Permission.MANAGE_POS_SHORTCUTS,
    'Seu perfil não pode gerenciar produtos rápidos.',
  );
  const current = await getDb().storePosShortcut.findFirst({
    where: { id, tenantId: context.session.tenantId, storeId: context.store.id },
    select: { id: true },
  });
  if (!current) throw new BusinessRuleError('O produto rápido não existe.');
  await getDb().storePosShortcut.delete({ where: { id } });
  const remaining = await getDb().storePosShortcut.findMany({
    where: { tenantId: context.session.tenantId, storeId: context.store.id },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
    select: { id: true },
  });
  await reorderPosShortcutsForContext(
    context,
    remaining.map((shortcut) => shortcut.id),
  );
  return listPosShortcuts(context);
}

async function reorderPosShortcutsForContext(context: PosContext, shortcutIds: string[]) {
  return getDb().$transaction(async (tx) => {
    const current = await tx.storePosShortcut.findMany({
      where: { tenantId: context.session.tenantId, storeId: context.store.id },
      select: { id: true },
    });
    if (
      current.length !== shortcutIds.length ||
      new Set(shortcutIds).size !== shortcutIds.length ||
      current.some((shortcut) => !shortcutIds.includes(shortcut.id))
    ) {
      throw new BusinessRuleError('Atualize os produtos rápidos antes de reordenar.');
    }
    await tx.storePosShortcut.updateMany({
      where: { tenantId: context.session.tenantId, storeId: context.store.id },
      data: { position: { increment: MAX_POS_SHORTCUTS + 1 } },
    });
    for (const [position, id] of shortcutIds.entries()) {
      await tx.storePosShortcut.update({ where: { id }, data: { position } });
    }
  });
}

export async function reorderPosShortcuts(shortcutIds: string[]) {
  const context = await requirePosContext();
  assertPermission(
    context,
    Permission.MANAGE_POS_SHORTCUTS,
    'Seu perfil não pode gerenciar produtos rápidos.',
  );
  await reorderPosShortcutsForContext(context, shortcutIds);
  return listPosShortcuts(context);
}

export async function getRecentPosOrders(providedContext?: PosContext) {
  const context = providedContext ?? (await requirePosContext());
  assertPermission(
    context,
    Permission.VIEW_ORDER_HISTORY,
    'Seu perfil não pode ver pedidos recentes.',
  );
  return getDb().order.findMany({
    where: {
      tenantId: context.session.tenantId,
      storeId: context.store.id,
      origin: 'POS',
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: RECENT_POS_ORDERS_LIMIT,
    select: {
      id: true,
      orderNumber: true,
      customerName: true,
      modality: true,
      total: true,
      status: true,
      paymentStatus: true,
      createdAt: true,
      posTerminalLabelSnapshot: true,
      createdBy: { select: { name: true } },
      _count: { select: { items: true } },
    },
  });
}

export async function getTopPosProducts(providedContext?: PosContext) {
  const context = providedContext ?? (await requirePosContext());
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000);
  return getDb()
    .$queryRaw<
      Array<{ productId: string; productName: string; units: bigint; orderCount: bigint }>
    >(
      Prisma.sql`
    SELECT
      oi."productId" AS "productId",
      MAX(oi."productName") AS "productName",
      SUM(oi."quantity")::bigint AS "units",
      COUNT(DISTINCT o."id")::bigint AS "orderCount"
    FROM "orders" o
    INNER JOIN "order_items" oi ON oi."orderId" = o."id"
    WHERE o."tenantId" = ${context.session.tenantId}
      AND o."storeId" = ${context.store.id}
      AND o."origin" = 'POS'::"OrderOrigin"
      AND o."status" <> 'CANCELLED'::"OrderStatus"
      AND o."createdAt" >= ${since}
    GROUP BY oi."productId"
    ORDER BY SUM(oi."quantity") DESC, COUNT(DISTINCT o."id") DESC, oi."productId" ASC
    LIMIT ${TOP_POS_PRODUCTS_LIMIT}
  `,
    )
    .then((rows) =>
      rows.map((row) => ({
        productId: row.productId,
        productName: row.productName,
        units: Number(row.units),
        orderCount: Number(row.orderCount),
      })),
    );
}

export async function getPosOperationalOverview(providedContext?: PosContext) {
  const context = providedContext ?? (await requirePosContext());
  const [terminals, shortcuts, recentOrders, topProducts] = await Promise.all([
    listPosTerminals(context),
    listPosShortcuts(context),
    hasTenantPermission(context.session.tenantRole, Permission.VIEW_ORDER_HISTORY)
      ? getRecentPosOrders(context)
      : Promise.resolve([]),
    getTopPosProducts(context),
  ]);
  return { terminals, shortcuts, recentOrders, topProducts };
}

export async function repeatPosOrder(orderId: string) {
  const context = await requirePosContext();
  assertPermission(context, Permission.VIEW_ORDER_HISTORY, 'Seu perfil não pode repetir pedidos.');
  const result = await rebuildOrderIntentFromHistory({
    tenantId: context.session.tenantId,
    storeId: context.store.id,
    orderId,
  });
  if (!result) throw new BusinessRuleError('O pedido selecionado não está disponível.');
  console.info('[POS_ORDER_REPEATED]', {
    storeId: context.store.id,
    userId: context.session.userId,
    sourceOrderId: orderId,
    readyItemCount: result.readyItems.length,
    issueCount: result.issues.length,
  });
  return result;
}
