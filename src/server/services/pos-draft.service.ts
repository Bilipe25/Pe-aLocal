import 'server-only';

import { Prisma } from '@prisma/client';

import type { PosOrderInput, SavePosDraftInput } from '@/schemas/pos';
import { posDraftIntentSchema } from '@/schemas/pos';
import { getDb } from '@/server/database/client';
import { BusinessRuleError } from '@/server/errors';
import {
  decryptPosDraftPayload,
  encryptPosDraftPayload,
  getPosDraftEncryptionKey,
  posDraftAad,
} from '@/lib/pos-draft/crypto';
import { requirePosContext, type PosContext } from '@/server/services/pos-context.service';

const POS_DRAFT_TTL_MS = 12 * 60 * 60 * 1_000;
const POS_DRAFT_LIST_LIMIT = 20;
const POS_DRAFT_CLEANUP_LIMIT = 25;

function draftUnavailable() {
  return new BusinessRuleError(
    'Este pedido em espera foi alterado em outro terminal. Atualize a lista.',
  );
}

async function assertActiveTerminal(context: PosContext, terminalId: string | undefined) {
  if (!terminalId) return null;
  const terminal = await getDb().storePosTerminal.findFirst({
    where: {
      id: terminalId,
      tenantId: context.session.tenantId,
      storeId: context.store.id,
      isActive: true,
    },
    select: { id: true, name: true },
  });
  if (!terminal) throw new BusinessRuleError('O terminal selecionado está inativo ou não existe.');
  return terminal;
}

async function encryptIntent(
  context: PosContext,
  draftId: string,
  intent: SavePosDraftInput['intent'],
) {
  return encryptPosDraftPayload(
    JSON.stringify(intent),
    getPosDraftEncryptionKey(),
    posDraftAad({
      tenantId: context.session.tenantId,
      storeId: context.store.id,
      draftId,
    }),
  );
}

async function decryptIntent(
  context: PosContext,
  draft: { id: string; payloadCiphertext: string; payloadIv: string },
) {
  let plaintext: string;
  try {
    plaintext = await decryptPosDraftPayload(
      { ciphertext: draft.payloadCiphertext, iv: draft.payloadIv },
      getPosDraftEncryptionKey(),
      posDraftAad({
        tenantId: context.session.tenantId,
        storeId: context.store.id,
        draftId: draft.id,
      }),
    );
  } catch {
    throw new BusinessRuleError('Não foi possível abrir este pedido em espera com segurança.');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(plaintext);
  } catch {
    throw new BusinessRuleError(
      'Este pedido em espera contém dados inválidos e precisa ser descartado.',
    );
  }
  const parsed = posDraftIntentSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BusinessRuleError(
      'Este pedido em espera contém dados inválidos e precisa ser descartado.',
    );
  }
  return parsed.data;
}

async function cleanupExpiredDrafts(context: PosContext, now: Date) {
  const expired = await getDb().posDraft.findMany({
    where: {
      tenantId: context.session.tenantId,
      storeId: context.store.id,
      status: 'OPEN',
      expiresAt: { lte: now },
    },
    orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
    take: POS_DRAFT_CLEANUP_LIMIT,
    select: { id: true, version: true },
  });
  await Promise.all(
    expired.map(async (draft) => {
      const encrypted = await encryptIntent(context, draft.id, {
        modality: 'PICKUP',
        customerName: '',
        customerPhone: '',
        items: [],
        couponCode: undefined,
        manualDiscount: undefined,
        notes: '',
        paidNow: false,
        saveCustomerData: false,
      } as SavePosDraftInput['intent']);
      await getDb().posDraft.updateMany({
        where: {
          id: draft.id,
          tenantId: context.session.tenantId,
          storeId: context.store.id,
          status: 'OPEN',
          version: draft.version,
          expiresAt: { lte: now },
        },
        data: {
          status: 'EXPIRED',
          version: { increment: 1 },
          payloadCiphertext: encrypted.ciphertext,
          payloadIv: encrypted.iv,
        },
      });
    }),
  );
}

export async function savePosDraft(input: SavePosDraftInput) {
  const context = await requirePosContext();
  const now = new Date();
  await cleanupExpiredDrafts(context, now);
  const terminal = await assertActiveTerminal(context, input.terminalId);
  const draftId = input.draftId ?? crypto.randomUUID();
  const encrypted = await encryptIntent(context, draftId, input.intent);
  const expiresAt = new Date(now.getTime() + POS_DRAFT_TTL_MS);

  if (input.expectedVersion == null) {
    const existing = await getDb().posDraft.findFirst({
      where: {
        id: draftId,
        tenantId: context.session.tenantId,
        storeId: context.store.id,
      },
      select: { id: true, version: true, status: true, expiresAt: true },
    });
    if (existing) {
      if (existing.status !== 'OPEN' || existing.expiresAt <= now) throw draftUnavailable();
      return existing;
    }
    try {
      return await getDb().posDraft.create({
        data: {
          id: draftId,
          tenantId: context.session.tenantId,
          storeId: context.store.id,
          createdById: context.session.userId,
          terminalId: terminal?.id ?? null,
          modality: input.intent.modality,
          payloadCiphertext: encrypted.ciphertext,
          payloadIv: encrypted.iv,
          expiresAt,
        },
        select: { id: true, version: true, status: true, expiresAt: true },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }
      const retry = await getDb().posDraft.findFirst({
        where: {
          id: draftId,
          tenantId: context.session.tenantId,
          storeId: context.store.id,
          status: 'OPEN',
          expiresAt: { gt: now },
        },
        select: { id: true, version: true, status: true, expiresAt: true },
      });
      if (!retry) throw draftUnavailable();
      return retry;
    }
  }

  const updated = await getDb().posDraft.updateMany({
    where: {
      id: draftId,
      tenantId: context.session.tenantId,
      storeId: context.store.id,
      status: 'OPEN',
      version: input.expectedVersion,
      expiresAt: { gt: now },
    },
    data: {
      terminalId: terminal?.id ?? null,
      modality: input.intent.modality,
      payloadCiphertext: encrypted.ciphertext,
      payloadIv: encrypted.iv,
      expiresAt,
      version: { increment: 1 },
    },
  });
  if (updated.count !== 1) throw draftUnavailable();
  return { id: draftId, version: input.expectedVersion + 1, status: 'OPEN' as const, expiresAt };
}

export async function listOpenPosDrafts() {
  const context = await requirePosContext();
  const now = new Date();
  await cleanupExpiredDrafts(context, now);
  const drafts = await getDb().posDraft.findMany({
    where: {
      tenantId: context.session.tenantId,
      storeId: context.store.id,
      status: 'OPEN',
      expiresAt: { gt: now },
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: POS_DRAFT_LIST_LIMIT,
    select: {
      id: true,
      version: true,
      modality: true,
      payloadCiphertext: true,
      payloadIv: true,
      expiresAt: true,
      updatedAt: true,
      createdBy: { select: { name: true } },
      terminal: { select: { id: true, name: true, isActive: true } },
    },
  });
  return Promise.all(
    drafts.map(async (draft) => {
      const intent = await decryptIntent(context, draft);
      return {
        id: draft.id,
        version: draft.version,
        modality: draft.modality,
        customerName: intent.customerName || 'Sem nome',
        itemCount: intent.items.reduce((sum, item) => sum + item.quantity, 0),
        expiresAt: draft.expiresAt,
        updatedAt: draft.updatedAt,
        createdByName: draft.createdBy.name,
        terminal: draft.terminal,
      };
    }),
  );
}

export async function resumePosDraft(draftId: string) {
  const context = await requirePosContext();
  const now = new Date();
  const draft = await getDb().posDraft.findFirst({
    where: {
      id: draftId,
      tenantId: context.session.tenantId,
      storeId: context.store.id,
      status: 'OPEN',
      expiresAt: { gt: now },
    },
    select: {
      id: true,
      version: true,
      payloadCiphertext: true,
      payloadIv: true,
      expiresAt: true,
      terminal: { select: { id: true, name: true, isActive: true } },
    },
  });
  if (!draft) throw draftUnavailable();
  const intent = await decryptIntent(context, draft);
  console.info('[POS_DRAFT_RESUMED]', {
    storeId: context.store.id,
    userId: context.session.userId,
    draftId: draft.id,
  });
  return { ...draft, intent };
}

export async function discardPosDraft(draftId: string, expectedVersion: number) {
  const context = await requirePosContext();
  const encrypted = await encryptIntent(context, draftId, {
    modality: 'PICKUP',
    customerName: '',
    customerPhone: '',
    items: [],
    notes: '',
    paidNow: false,
    saveCustomerData: false,
  } as SavePosDraftInput['intent']);
  const discarded = await getDb().posDraft.updateMany({
    where: {
      id: draftId,
      tenantId: context.session.tenantId,
      storeId: context.store.id,
      status: 'OPEN',
      version: expectedVersion,
    },
    data: {
      status: 'DISCARDED',
      version: { increment: 1 },
      payloadCiphertext: encrypted.ciphertext,
      payloadIv: encrypted.iv,
    },
  });
  if (discarded.count !== 1) throw draftUnavailable();
  console.info('[POS_DRAFT_DISCARDED]', {
    storeId: context.store.id,
    userId: context.session.userId,
    draftId,
  });
  return { id: draftId, status: 'DISCARDED' as const };
}

export async function rebuildPosOrderInputFromDraft(
  context: PosContext,
  input: PosOrderInput,
): Promise<PosOrderInput> {
  if (!input.draftId || input.expectedDraftVersion == null) return input;
  const draft = await getDb().posDraft.findFirst({
    where: {
      id: input.draftId,
      tenantId: context.session.tenantId,
      storeId: context.store.id,
    },
    select: {
      id: true,
      status: true,
      version: true,
      expiresAt: true,
      terminalId: true,
      payloadCiphertext: true,
      payloadIv: true,
    },
  });
  if (!draft) throw draftUnavailable();
  if (draft.status === 'CONVERTED') return input;
  if (
    draft.status !== 'OPEN' ||
    draft.version !== input.expectedDraftVersion ||
    draft.expiresAt <= new Date()
  ) {
    throw draftUnavailable();
  }
  const intent = await decryptIntent(context, draft);
  return {
    ...intent,
    paymentMethod: input.paymentMethod,
    paidNow: input.paidNow,
    changeFor: input.changeFor,
    saveCustomerData: input.saveCustomerData,
    posTerminalId: draft.terminalId ?? undefined,
    draftId: input.draftId,
    expectedDraftVersion: input.expectedDraftVersion,
    expectedQuoteFingerprint: input.expectedQuoteFingerprint,
    idempotencyKey: input.idempotencyKey,
  };
}
