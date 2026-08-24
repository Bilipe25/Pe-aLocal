import 'server-only';

import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';

import {
  buildDiningSessionFinancialSummary,
  canAutoRolloverDiningSession,
  DINING_SERVICE_REQUEST_COOLDOWN_MS,
  evaluateDiningSessionClose,
} from '@/domain/dining-room';
import {
  diningServiceRequestSchema,
  diningSessionMutationSchema,
  diningSessionTokenSchema,
  resolveDiningServiceRequestSchema,
  transferDiningSessionSchema,
  type DiningServiceRequestInput,
  type DiningSessionMutationInput,
  type ResolveDiningServiceRequestInput,
  type TransferDiningSessionInput,
} from '@/schemas/dining-room';
import { requireTenantStoreAccess } from '@/server/auth';
import { getDb } from '@/server/database/client';
import {
  BusinessRuleError,
  ConcurrencyError,
  ConflictError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from '@/server/errors';
import { triggerDiningRoomUpdated } from '@/lib/pusher/server';
import { Permission } from '@/server/permissions';
import * as auditRepo from '@/server/repositories/audit-log.repository';
import * as sessionRepo from '@/server/repositories/dining-table-session.repository';
import { createDiningRoomOperationalEvent } from '@/server/services/operational-outbox.service';
import type {
  DiningRoomSnapshotDto,
  DiningSessionDetailDto,
  PublicDiningSessionDto,
} from '@/types/dining-room';

type CheckoutSessionClient = Prisma.TransactionClient;

function generateSessionToken() {
  return randomBytes(32).toString('base64url');
}

function parseOrThrow<T>(
  result:
    | { success: true; data: T }
    | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } },
) {
  if (result.success) return result.data;
  throw new ValidationError(
    'Os dados do atendimento são inválidos.',
    result.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
  );
}

function isRetryableTransactionError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}

async function serializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await getDb().$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 15_000,
      });
    } catch (error) {
      if (!isRetryableTransactionError(error) || attempt === 3) throw error;
    }
  }
  throw new Error('unreachable dining session transaction retry state');
}

export async function getOrCreateDiningSessionForCheckout(
  tx: CheckoutSessionClient,
  table: { id: string; tenantId: string; storeId: string },
  now: Date,
) {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${`dining-session:${table.tenantId}:${table.storeId}:${table.id}`}, 0))
  `;

  const current = await sessionRepo.findOpenSessionForTable(tx, {
    tenantId: table.tenantId,
    storeId: table.storeId,
    diningTableId: table.id,
  });

  if (current) {
    const canRollover = canAutoRolloverDiningSession({
      orders: current.orders,
      openRequestCount: current.serviceRequests.length,
    });
    if (!canRollover) return { id: current.id, publicToken: current.publicToken };

    const closed = await tx.diningTableSession.updateMany({
      where: { id: current.id, status: 'OPEN', version: current.version },
      data: { status: 'CLOSED', closedAt: now, version: { increment: 1 } },
    });
    if (closed.count !== 1) throw new ConcurrencyError('O atendimento da mesa');
  }

  const created = await tx.diningTableSession.create({
    data: {
      tenantId: table.tenantId,
      storeId: table.storeId,
      diningTableId: table.id,
      publicToken: generateSessionToken(),
      openedAt: now,
      lastOrderAt: now,
    },
    select: { id: true, publicToken: true },
  });
  await auditRepo.createAuditLog(
    {
      tenantId: table.tenantId,
      storeId: table.storeId,
      action: 'DINING_SESSION_OPENED',
      entity: 'DiningTableSession',
      entityId: created.id,
      metadata: { diningTableId: table.id, source: current ? 'AUTO_ROLLOVER' : 'CHECKOUT' },
    },
    tx,
  );
  return created;
}

export async function touchDiningSessionAfterOrder(
  tx: CheckoutSessionClient,
  sessionId: string,
  now: Date,
) {
  await tx.diningTableSession.update({
    where: { id: sessionId },
    data: { lastOrderAt: now, version: { increment: 1 } },
  });
}

export async function getDiningRoomSnapshotForStore(input: {
  tenantId: string;
  storeId: string;
  storeName: string;
  enabledForNewOrders: boolean;
}): Promise<DiningRoomSnapshotDto> {
  const rows = await sessionRepo.listDiningRoomRows(input.tenantId, input.storeId);
  const tables = rows.map((table) => {
    const session = table.sessions[0] ?? null;
    const financial = buildDiningSessionFinancialSummary(session?.orders ?? []);
    const assistance = session?.serviceRequests.find((request) => request.type === 'ASSISTANCE');
    const bill = session?.serviceRequests.find((request) => request.type === 'BILL');
    const request = assistance ?? bill ?? null;
    const state = !session ? 'FREE' : assistance ? 'ASSISTANCE' : bill ? 'BILL' : 'OPEN';
    return {
      tableId: table.id,
      label: table.label,
      sortOrder: table.sortOrder,
      isActive: table.isActive,
      state,
      sessionId: session?.id ?? null,
      sessionVersion: session?.version ?? null,
      openedAt: session?.openedAt.toISOString() ?? null,
      lastOrderAt: session?.lastOrderAt.toISOString() ?? null,
      orderCount: financial.orderCount,
      totalConsideredCents: financial.totalConsideredCents,
      pendingCents: financial.pendingCents,
      openRequest: request
        ? {
            id: request.id,
            type: request.type,
            version: request.version,
            createdAt: request.createdAt.toISOString(),
          }
        : null,
    } satisfies DiningRoomSnapshotDto['tables'][number];
  });
  const totals = tables.reduce(
    (summary, table) => {
      if (table.sessionId) summary.open += 1;
      if (table.state === 'ASSISTANCE') summary.assistance += 1;
      if (table.state === 'BILL') summary.bill += 1;
      return summary;
    },
    { tables: tables.length, open: 0, assistance: 0, bill: 0 },
  );
  return {
    enabledForNewOrders: input.enabledForNewOrders,
    storeId: input.storeId,
    storeName: input.storeName,
    generatedAt: new Date().toISOString(),
    totals,
    tables,
  };
}

export async function getDiningRoomSnapshot(): Promise<DiningRoomSnapshotDto> {
  const { session, store } = await import('@/server/services/store-context.service').then(
    ({ requireActiveStoreContext }) => requireActiveStoreContext(Permission.VIEW_DINING_ROOM),
  );
  return getDiningRoomSnapshotForStore({
    tenantId: session.tenantId,
    storeId: store.id,
    storeName: store.name,
    enabledForNewOrders: store.entitlement?.dineInQrEnabled === true,
  });
}

export async function getDiningSessionDetail(sessionId: string): Promise<DiningSessionDetailDto> {
  const { session, store } = await import('@/server/services/store-context.service').then(
    ({ requireActiveStoreContext }) => requireActiveStoreContext(Permission.VIEW_DINING_ROOM),
  );
  const row = await sessionRepo.findDiningSessionDetail(session.tenantId, store.id, sessionId);
  if (!row) throw new NotFoundError('Atendimento da mesa');
  const [financialSummary, transferDestinations] = await Promise.all([
    Promise.resolve(buildDiningSessionFinancialSummary(row.orders)),
    row.status === 'OPEN'
      ? sessionRepo.listAvailableTransferDestinations(
          session.tenantId,
          store.id,
          row.diningTable.id,
        )
      : Promise.resolve([]),
  ]);
  const closeEvaluation = evaluateDiningSessionClose({
    orders: row.orders,
    openRequestCount: row.serviceRequests.filter((request) => request.status === 'OPEN').length,
  });
  return {
    sessionId: row.id,
    version: row.version,
    status: row.status,
    openedAt: row.openedAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
    table: row.diningTable,
    orders: row.orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      total: order.total,
      originalTableLabel: order.diningTableLabelSnapshot ?? 'Mesa não identificada',
      createdAt: order.createdAt.toISOString(),
    })),
    financialSummary,
    closeEvaluation,
    requests: row.serviceRequests.map((request) => ({
      ...request,
      createdAt: request.createdAt.toISOString(),
      resolvedAt: request.resolvedAt?.toISOString() ?? null,
    })),
    transferDestinations,
  };
}

export async function getPublicDiningSession(
  publicToken: unknown,
): Promise<PublicDiningSessionDto> {
  const parsed = diningSessionTokenSchema.safeParse(publicToken);
  if (!parsed.success) return { state: 'INVALID' };
  const session = await sessionRepo.findPublicSession(parsed.data);
  if (!session) return { state: 'INVALID' };
  if (session.status !== 'OPEN') {
    return {
      state: 'CLOSED',
      tableLabel: session.diningTable.label,
      storeName: session.store.name,
    };
  }
  return {
    state: 'OPEN',
    tableLabel: session.diningTable.label,
    storeName: session.store.name,
    continueOrderingHref: `/q/s/${session.publicToken}/menu`,
    publicOperationsEnabled: session.store.entitlement?.dineInQrEnabled === true,
    assistanceRequested: session.serviceRequests.some((request) => request.type === 'ASSISTANCE'),
    billRequested: session.serviceRequests.some((request) => request.type === 'BILL'),
  };
}

export async function getDiningSessionOrderingHref(publicToken: unknown) {
  const parsed = diningSessionTokenSchema.safeParse(publicToken);
  if (!parsed.success) return null;
  const session = await sessionRepo.findPublicSession(parsed.data);
  if (!session || session.status !== 'OPEN') return null;
  return `/q/${session.diningTable.publicToken}`;
}

export async function createPublicDiningServiceRequest(
  publicToken: unknown,
  rawInput: DiningServiceRequestInput,
) {
  const token = parseOrThrow(diningSessionTokenSchema.safeParse(publicToken));
  const input = parseOrThrow(diningServiceRequestSchema.safeParse(rawInput));
  const result = await serializable(async (tx) => {
    const session = await tx.diningTableSession.findUnique({
      where: { publicToken: token },
      select: {
        id: true,
        tenantId: true,
        storeId: true,
        status: true,
        diningTableId: true,
        version: true,
        store: { select: { entitlement: { select: { dineInQrEnabled: true } } } },
      },
    });
    if (!session) throw new NotFoundError('Atendimento da mesa');
    if (session.status !== 'OPEN')
      throw new BusinessRuleError('Este atendimento já foi encerrado.');
    if (!session.store.entitlement?.dineInQrEnabled) {
      throw new BusinessRuleError('As solicitações pelo salão estão pausadas nesta loja.');
    }
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${`dining-request:${session.id}:${input.type}`}, 0))
    `;
    const replay = await tx.diningTableServiceRequest.findUnique({
      where: {
        diningTableSessionId_idempotencyKey: {
          diningTableSessionId: session.id,
          idempotencyKey: input.idempotencyKey,
        },
      },
      select: { id: true, type: true, status: true, createdAt: true, version: true },
    });
    if (replay) return { request: replay, created: false, session, outboxEvent: null };
    const open = await tx.diningTableServiceRequest.findFirst({
      where: { diningTableSessionId: session.id, type: input.type, status: 'OPEN' },
      select: { id: true, type: true, status: true, createdAt: true, version: true },
    });
    if (open) return { request: open, created: false, session, outboxEvent: null };

    const recent = await tx.diningTableServiceRequest.findFirst({
      where: { diningTableSessionId: session.id, type: input.type },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { createdAt: true },
    });
    const now = new Date();
    if (recent && now.getTime() - recent.createdAt.getTime() < DINING_SERVICE_REQUEST_COOLDOWN_MS) {
      throw new RateLimitError(
        'A equipe já foi avisada. Aguarde um instante antes de solicitar novamente.',
      );
    }

    const request = await tx.diningTableServiceRequest.create({
      data: {
        tenantId: session.tenantId,
        storeId: session.storeId,
        diningTableSessionId: session.id,
        type: input.type,
        idempotencyKey: input.idempotencyKey,
      },
      select: { id: true, type: true, status: true, createdAt: true, version: true },
    });
    const updatedSession = await tx.diningTableSession.update({
      where: { id: session.id },
      data: { version: { increment: 1 } },
      select: { version: true },
    });
    const outboxEvent = await createDiningRoomOperationalEvent(tx, {
      tenantId: session.tenantId,
      storeId: session.storeId,
      sessionId: session.id,
      tableId: session.diningTableId,
      eventType: 'DINING_REQUEST_OPENED',
      reason: 'REQUEST_OPENED',
      version: updatedSession.version,
    });
    return { request, created: true, session, outboxEvent };
  });

  if (result.created) {
    console.info(
      result.request.type === 'ASSISTANCE'
        ? '[DINING_ASSISTANCE_REQUESTED]'
        : '[DINING_BILL_REQUESTED]',
      {
        storeId: result.session.storeId,
        sessionId: result.session.id,
        diningTableId: result.session.diningTableId,
      },
    );
    await triggerDiningRoomUpdated(result.session.storeId, {
      eventId: result.outboxEvent?.id,
      tableId: result.session.diningTableId,
      sessionId: result.session.id,
      reason: 'REQUEST_OPENED',
      version: result.session.version + 1,
    }).catch(() => undefined);
  }
  return {
    type: result.request.type,
    status: result.request.status,
    created: result.created,
    createdAt: result.request.createdAt.toISOString(),
  };
}

export async function resolveDiningServiceRequest(
  storeId: string,
  rawInput: ResolveDiningServiceRequestInput,
) {
  const { session, store } = await requireTenantStoreAccess(
    storeId,
    Permission.OPERATE_DINING_ROOM,
  );
  const input = parseOrThrow(resolveDiningServiceRequestSchema.safeParse(rawInput));
  const result = await serializable(async (tx) => {
    const request = await tx.diningTableServiceRequest.findFirst({
      where: { id: input.requestId, tenantId: session.tenantId, storeId: store.id },
      select: {
        id: true,
        type: true,
        status: true,
        version: true,
        diningTableSession: { select: { id: true, diningTableId: true, version: true } },
      },
    });
    if (!request) throw new NotFoundError('Solicitação');
    if (request.status === 'RESOLVED') return { request, changed: false, outboxEvent: null };
    const updated = await tx.diningTableServiceRequest.updateMany({
      where: { id: request.id, status: 'OPEN', version: input.expectedVersion },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        resolvedById: session.userId,
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new ConcurrencyError('A solicitação');
    const updatedSession = await tx.diningTableSession.update({
      where: { id: request.diningTableSession.id },
      data: { version: { increment: 1 } },
      select: { version: true },
    });
    await auditRepo.createAuditLog(
      {
        tenantId: session.tenantId,
        storeId: store.id,
        userId: session.userId,
        action: 'DINING_SERVICE_REQUEST_RESOLVED',
        entity: 'DiningTableServiceRequest',
        entityId: request.id,
        metadata: { type: request.type, sessionId: request.diningTableSession.id },
      },
      tx,
    );
    const outboxEvent = await createDiningRoomOperationalEvent(tx, {
      tenantId: session.tenantId,
      storeId: store.id,
      sessionId: request.diningTableSession.id,
      tableId: request.diningTableSession.diningTableId,
      eventType: 'DINING_REQUEST_RESOLVED',
      reason: 'REQUEST_RESOLVED',
      version: updatedSession.version,
    });
    return { request, changed: true, outboxEvent };
  });
  if (result.changed) {
    console.info('[DINING_REQUEST_RESOLVED]', { storeId: store.id, requestId: result.request.id });
    await triggerDiningRoomUpdated(store.id, {
      eventId: result.outboxEvent?.id,
      tableId: result.request.diningTableSession.diningTableId,
      sessionId: result.request.diningTableSession.id,
      reason: 'REQUEST_RESOLVED',
      version: result.request.diningTableSession.version + 1,
    }).catch(() => undefined);
  }
  return { changed: result.changed };
}

export async function closeDiningSession(storeId: string, rawInput: DiningSessionMutationInput) {
  const { session, store } = await requireTenantStoreAccess(
    storeId,
    Permission.OPERATE_DINING_ROOM,
  );
  const input = parseOrThrow(diningSessionMutationSchema.safeParse(rawInput));
  const result = await serializable(async (tx) => {
    await tx.$executeRaw`SELECT "id" FROM "dining_table_sessions" WHERE "id" = ${input.sessionId} FOR UPDATE`;
    const current = await tx.diningTableSession.findFirst({
      where: { id: input.sessionId, tenantId: session.tenantId, storeId: store.id },
      select: {
        id: true,
        status: true,
        version: true,
        diningTableId: true,
        orders: { select: sessionRepo.diningSessionOrderSelect },
        serviceRequests: { where: { status: 'OPEN' }, select: { id: true } },
      },
    });
    if (!current) throw new NotFoundError('Atendimento da mesa');
    if (current.status === 'CLOSED') return { current, changed: false, outboxEvent: null };
    const evaluation = evaluateDiningSessionClose({
      orders: current.orders,
      openRequestCount: current.serviceRequests.length,
    });
    if (!evaluation.canClose)
      throw new BusinessRuleError(evaluation.message ?? 'A mesa ainda não pode ser fechada.');
    const updated = await tx.diningTableSession.updateMany({
      where: { id: current.id, status: 'OPEN', version: input.expectedVersion },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        closedById: session.userId,
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new ConcurrencyError('O atendimento da mesa');
    await auditRepo.createAuditLog(
      {
        tenantId: session.tenantId,
        storeId: store.id,
        userId: session.userId,
        action: 'DINING_SESSION_CLOSED',
        entity: 'DiningTableSession',
        entityId: current.id,
        metadata: { diningTableId: current.diningTableId },
      },
      tx,
    );
    const outboxEvent = await createDiningRoomOperationalEvent(tx, {
      tenantId: session.tenantId,
      storeId: store.id,
      sessionId: current.id,
      tableId: current.diningTableId,
      eventType: 'DINING_SESSION_CLOSED',
      reason: 'CLOSED',
      version: current.version + 1,
    });
    return { current, changed: true, outboxEvent };
  });
  if (result.changed) {
    console.info('[DINING_SESSION_CLOSED]', { storeId: store.id, sessionId: result.current.id });
    await triggerDiningRoomUpdated(store.id, {
      eventId: result.outboxEvent?.id,
      tableId: result.current.diningTableId,
      sessionId: result.current.id,
      reason: 'CLOSED',
      version: result.current.version + 1,
    }).catch(() => undefined);
  }
  return { changed: result.changed };
}

export async function transferDiningSession(storeId: string, rawInput: TransferDiningSessionInput) {
  const { session, store } = await requireTenantStoreAccess(
    storeId,
    Permission.OPERATE_DINING_ROOM,
  );
  const input = parseOrThrow(transferDiningSessionSchema.safeParse(rawInput));
  const result = await serializable(async (tx) => {
    const lockKeys = [input.sessionId, input.destinationTableId].sort();
    for (const key of lockKeys) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`dining-transfer:${session.tenantId}:${store.id}:${key}`}, 0))`;
    }
    const current = await tx.diningTableSession.findFirst({
      where: { id: input.sessionId, tenantId: session.tenantId, storeId: store.id },
      select: { id: true, status: true, version: true, diningTableId: true },
    });
    if (!current) throw new NotFoundError('Atendimento da mesa');
    if (current.status !== 'OPEN')
      throw new BusinessRuleError('Este atendimento já foi encerrado.');
    if (current.diningTableId === input.destinationTableId) {
      throw new BusinessRuleError('Escolha uma mesa diferente para a transferência.');
    }
    const destination = await tx.storeDiningTable.findFirst({
      where: { id: input.destinationTableId, tenantId: session.tenantId, storeId: store.id },
      select: { id: true, label: true, isActive: true },
    });
    if (!destination) throw new NotFoundError('Mesa de destino');
    if (!destination.isActive) throw new BusinessRuleError('A mesa de destino está desativada.');
    const occupied = await tx.diningTableSession.findFirst({
      where: {
        diningTableId: destination.id,
        tenantId: session.tenantId,
        storeId: store.id,
        status: 'OPEN',
      },
      select: { id: true },
    });
    if (occupied) throw new ConflictError(`${destination.label} já está em atendimento.`);
    const updated = await tx.diningTableSession.updateMany({
      where: { id: current.id, status: 'OPEN', version: input.expectedVersion },
      data: { diningTableId: destination.id, version: { increment: 1 } },
    });
    if (updated.count !== 1) throw new ConcurrencyError('O atendimento da mesa');
    await auditRepo.createAuditLog(
      {
        tenantId: session.tenantId,
        storeId: store.id,
        userId: session.userId,
        action: 'DINING_SESSION_TRANSFERRED',
        entity: 'DiningTableSession',
        entityId: current.id,
        metadata: { fromDiningTableId: current.diningTableId, toDiningTableId: destination.id },
      },
      tx,
    );
    const outboxEvent = await createDiningRoomOperationalEvent(tx, {
      tenantId: session.tenantId,
      storeId: store.id,
      sessionId: current.id,
      tableId: destination.id,
      eventType: 'DINING_SESSION_TRANSFERRED',
      reason: 'TRANSFERRED',
      version: current.version + 1,
    });
    return { current, destination, outboxEvent };
  });
  console.info('[DINING_SESSION_TRANSFERRED]', {
    storeId: store.id,
    sessionId: result.current.id,
    fromDiningTableId: result.current.diningTableId,
    toDiningTableId: result.destination.id,
  });
  await triggerDiningRoomUpdated(store.id, {
    eventId: result.outboxEvent.id,
    tableId: result.destination.id,
    sessionId: result.current.id,
    reason: 'TRANSFERRED',
    version: result.current.version + 1,
  }).catch(() => undefined);
  return { tableId: result.destination.id, tableLabel: result.destination.label };
}
