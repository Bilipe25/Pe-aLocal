import 'server-only';

import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';

import { formatDiningTableLabel, normalizeDiningTableLabel } from '@/domain/dining-tables';
import {
  createDiningTablesBatchSchema,
  diningTableMutationSchema,
  diningTableTokenSchema,
  renameDiningTableSchema,
  setDiningTableActiveSchema,
  type CreateDiningTablesBatchInput,
  type RenameDiningTableInput,
  type RotateDiningTableTokenInput,
  type SetDiningTableActiveInput,
} from '@/schemas/dining-table';
import { requireTenantStoreAccess } from '@/server/auth';
import { getDb, type DatabaseClient } from '@/server/database/client';
import {
  BusinessRuleError,
  ConcurrencyError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/server/errors';
import { Permission } from '@/server/permissions';
import * as auditRepo from '@/server/repositories/audit-log.repository';
import {
  diningTableAdminSelect,
  findDiningTableByPublicToken,
  listDiningTables,
} from '@/server/repositories/dining-table.repository';

function generateDiningTableToken() {
  return randomBytes(32).toString('base64url');
}

function parseOrThrow<T>(
  result: { success: true; data: T } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } },
) {
  if (result.success) return result.data;
  throw new ValidationError(
    'Os dados da mesa são inválidos.',
    result.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
  );
}

async function requireDiningTableEntitlement(
  tenantId: string,
  storeId: string,
  client: DatabaseClient | Prisma.TransactionClient = getDb(),
) {
  const entitlement = await client.storeEntitlement.findFirst({
    where: { tenantId, storeId },
    select: { dineInQrEnabled: true },
  });
  if (!entitlement?.dineInQrEnabled) {
    throw new BusinessRuleError('O Pedido por QR Code no salão não está habilitado nesta loja.');
  }
}

export async function getDiningTablesPage(storeId: string) {
  const { session, store } = await requireTenantStoreAccess(
    storeId,
    Permission.VIEW_DINING_TABLES,
  );
  const [entitlement, tables] = await Promise.all([
    getDb().storeEntitlement.findFirst({
      where: { tenantId: session.tenantId, storeId: store.id },
      select: { dineInQrEnabled: true },
    }),
    listDiningTables(session.tenantId, store.id),
  ]);

  return {
    store,
    enabled: entitlement?.dineInQrEnabled === true,
    canManage: session.tenantRole === 'OWNER' || session.tenantRole === 'MANAGER',
    tables,
  };
}

export async function resolveDiningTableContext(publicToken: unknown) {
  const parsed = diningTableTokenSchema.safeParse(publicToken);
  if (!parsed.success) return null;
  const table = await findDiningTableByPublicToken(parsed.data);
  if (!table) return null;
  return table;
}

export async function createDiningTablesBatch(
  storeId: string,
  input: CreateDiningTablesBatchInput,
) {
  const { session, store } = await requireTenantStoreAccess(
    storeId,
    Permission.MANAGE_DINING_TABLES,
  );
  const parsed = parseOrThrow(createDiningTablesBatchSchema.safeParse(input));
  const width = Math.max(2, String(parsed.start + parsed.count - 1).length);
  const rows = Array.from({ length: parsed.count }, (_, offset) => {
    const label = formatDiningTableLabel(parsed.prefix, parsed.start + offset, width);
    return { label, labelNormalized: normalizeDiningTableLabel(label) };
  });

  return getDb().$transaction(
    async (tx) => {
      await requireDiningTableEntitlement(session.tenantId, store.id, tx);
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${`dining-tables:${store.id}`}, 0))
      `;
      const duplicate = await tx.storeDiningTable.findFirst({
        where: {
          tenantId: session.tenantId,
          storeId: store.id,
          labelNormalized: { in: rows.map((row) => row.labelNormalized) },
        },
        select: { label: true },
      });
      if (duplicate) throw new ConflictError(`${duplicate.label} já está cadastrada.`);

      const latest = await tx.storeDiningTable.findFirst({
        where: { tenantId: session.tenantId, storeId: store.id },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });
      const firstSortOrder = (latest?.sortOrder ?? -1) + 1;
      const created = [];
      for (const [index, row] of rows.entries()) {
        created.push(
          await tx.storeDiningTable.create({
            data: {
              tenantId: session.tenantId,
              storeId: store.id,
              ...row,
              sortOrder: firstSortOrder + index,
              publicToken: generateDiningTableToken(),
            },
            select: diningTableAdminSelect,
          }),
        );
      }
      await auditRepo.createAuditLog(
        {
          tenantId: session.tenantId,
          storeId: store.id,
          userId: session.userId,
          action: 'CREATE',
          entity: 'StoreDiningTableBatch',
          entityId: store.id,
          metadata: { count: created.length, labels: created.map((table) => table.label) },
        },
        tx,
      );
      return created;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function renameDiningTable(storeId: string, input: RenameDiningTableInput) {
  const { session, store } = await requireTenantStoreAccess(
    storeId,
    Permission.MANAGE_DINING_TABLES,
  );
  const parsed = parseOrThrow(renameDiningTableSchema.safeParse(input));
  const labelNormalized = normalizeDiningTableLabel(parsed.label);

  return getDb().$transaction(async (tx) => {
    await requireDiningTableEntitlement(session.tenantId, store.id, tx);
    const collision = await tx.storeDiningTable.findFirst({
      where: {
        tenantId: session.tenantId,
        storeId: store.id,
        labelNormalized,
        id: { not: parsed.tableId },
      },
      select: { id: true },
    });
    if (collision) throw new ConflictError('Já existe uma mesa com esse nome.');
    const current = await tx.storeDiningTable.findFirst({
      where: { id: parsed.tableId, tenantId: session.tenantId, storeId: store.id },
      select: { label: true },
    });
    if (!current) throw new NotFoundError('Mesa');
    const updated = await tx.storeDiningTable.updateMany({
      where: {
        id: parsed.tableId,
        tenantId: session.tenantId,
        storeId: store.id,
        version: parsed.expectedVersion,
      },
      data: { label: parsed.label, labelNormalized, version: { increment: 1 } },
    });
    if (updated.count !== 1) throw new ConcurrencyError('A mesa');
    await auditRepo.createAuditLog(
      {
        tenantId: session.tenantId,
        storeId: store.id,
        userId: session.userId,
        action: 'UPDATE',
        entity: 'StoreDiningTable',
        entityId: parsed.tableId,
        metadata: { changedFields: ['label'], previousLabel: current.label, nextLabel: parsed.label },
      },
      tx,
    );
    return tx.storeDiningTable.findUniqueOrThrow({
      where: { id: parsed.tableId },
      select: diningTableAdminSelect,
    });
  });
}

export async function setDiningTableActive(storeId: string, input: SetDiningTableActiveInput) {
  const { session, store } = await requireTenantStoreAccess(
    storeId,
    Permission.MANAGE_DINING_TABLES,
  );
  const parsed = parseOrThrow(setDiningTableActiveSchema.safeParse(input));

  return getDb().$transaction(async (tx) => {
    await requireDiningTableEntitlement(session.tenantId, store.id, tx);
    const updated = await tx.storeDiningTable.updateMany({
      where: {
        id: parsed.tableId,
        tenantId: session.tenantId,
        storeId: store.id,
        version: parsed.expectedVersion,
      },
      data: { isActive: parsed.isActive, version: { increment: 1 } },
    });
    if (updated.count !== 1) throw new ConcurrencyError('A mesa');
    await auditRepo.createAuditLog(
      {
        tenantId: session.tenantId,
        storeId: store.id,
        userId: session.userId,
        action: 'UPDATE',
        entity: 'StoreDiningTable',
        entityId: parsed.tableId,
        metadata: { changedFields: ['isActive'], isActive: parsed.isActive },
      },
      tx,
    );
    return tx.storeDiningTable.findUniqueOrThrow({
      where: { id: parsed.tableId },
      select: diningTableAdminSelect,
    });
  });
}

export async function rotateDiningTableToken(
  storeId: string,
  input: RotateDiningTableTokenInput,
) {
  const { session, store } = await requireTenantStoreAccess(
    storeId,
    Permission.MANAGE_DINING_TABLES,
  );
  const parsed = parseOrThrow(diningTableMutationSchema.safeParse(input));
  const publicToken = generateDiningTableToken();

  return getDb().$transaction(async (tx) => {
    await requireDiningTableEntitlement(session.tenantId, store.id, tx);
    const updated = await tx.storeDiningTable.updateMany({
      where: {
        id: parsed.tableId,
        tenantId: session.tenantId,
        storeId: store.id,
        version: parsed.expectedVersion,
      },
      data: { publicToken, version: { increment: 1 } },
    });
    if (updated.count !== 1) throw new ConcurrencyError('A mesa');
    await auditRepo.createAuditLog(
      {
        tenantId: session.tenantId,
        storeId: store.id,
        userId: session.userId,
        action: 'UPDATE',
        entity: 'StoreDiningTable',
        entityId: parsed.tableId,
        metadata: { changedFields: ['publicToken'], tokenRotated: true },
      },
      tx,
    );
    return tx.storeDiningTable.findUniqueOrThrow({
      where: { id: parsed.tableId },
      select: diningTableAdminSelect,
    });
  });
}
