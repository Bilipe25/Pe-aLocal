import 'server-only';

import { Prisma } from '@prisma/client';

import type { ConsumerAddressInput } from '@/schemas/consumer-address';
import { getDb } from '@/server/database/client';
import { ConflictError, NotFoundError } from '@/server/errors';
import { createCustomerAddressFingerprint } from '@/server/services/customer-recognition-formatting';
import { requireConsumerForStore } from '@/server/services/consumer-auth.service';

async function addressScope(input: { storeSlug: string; sessionToken?: string | null }) {
  const authorized = await requireConsumerForStore(input);
  if (!authorized.consumer.customer) throw new NotFoundError('Cliente');
  return { ...authorized, customerId: authorized.consumer.customer.id };
}

export async function listConsumerAddresses(input: {
  storeSlug: string;
  sessionToken?: string | null;
}) {
  const { scope, customerId } = await addressScope(input);
  return getDb().customerAddress.findMany({
    where: { tenantId: scope.tenantId, customerId },
    orderBy: [{ isDefault: 'desc' }, { lastUsedAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      label: true,
      street: true,
      number: true,
      complement: true,
      neighborhood: true,
      city: true,
      state: true,
      zipCode: true,
      reference: true,
      isDefault: true,
    },
  });
}

export async function createConsumerAddress(input: {
  storeSlug: string;
  sessionToken?: string | null;
  address: ConsumerAddressInput;
}) {
  const { scope, customerId } = await addressScope(input);
  const fingerprint = await createCustomerAddressFingerprint(input.address);
  try {
    return await getDb().$transaction(
      async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`consumer-address:${customerId}`}, 0))`,
        );
        const existingCount = await tx.customerAddress.count({
          where: { tenantId: scope.tenantId, customerId },
        });
        const isDefault = input.address.isDefault || existingCount === 0;
        if (isDefault)
          await tx.customerAddress.updateMany({
            where: { tenantId: scope.tenantId, customerId, isDefault: true },
            data: { isDefault: false },
          });
        return tx.customerAddress.create({
          data: {
            ...input.address,
            tenantId: scope.tenantId,
            customerId,
            addressFingerprint: fingerprint,
            isDefault,
          },
          select: { id: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw new ConflictError('Este endereço já está salvo.');
    throw error;
  }
}

export async function updateConsumerAddress(input: {
  storeSlug: string;
  sessionToken?: string | null;
  addressId: string;
  address: ConsumerAddressInput;
}) {
  const { scope, customerId } = await addressScope(input);
  const fingerprint = await createCustomerAddressFingerprint(input.address);
  try {
    await getDb().$transaction(
      async (tx) => {
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`consumer-address:${customerId}`}, 0))`,
        );
        const current = await tx.customerAddress.findFirst({
          where: { id: input.addressId, tenantId: scope.tenantId, customerId },
          select: { id: true, isDefault: true },
        });
        if (!current) throw new NotFoundError('Endereço');
        if (input.address.isDefault)
          await tx.customerAddress.updateMany({
            where: {
              tenantId: scope.tenantId,
              customerId,
              isDefault: true,
              id: { not: current.id },
            },
            data: { isDefault: false },
          });
        await tx.customerAddress.update({
          where: { id: current.id },
          data: {
            ...input.address,
            addressFingerprint: fingerprint,
            isDefault: current.isDefault || input.address.isDefault,
            storeUses: { deleteMany: {} },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw new ConflictError('Este endereço já está salvo.');
    throw error;
  }
}

export async function deleteConsumerAddress(input: {
  storeSlug: string;
  sessionToken?: string | null;
  addressId: string;
}) {
  const { scope, customerId } = await addressScope(input);
  await getDb().$transaction(
    async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`consumer-address:${customerId}`}, 0))`,
      );
      const current = await tx.customerAddress.findFirst({
        where: { id: input.addressId, tenantId: scope.tenantId, customerId },
        select: { id: true, isDefault: true },
      });
      if (!current) throw new NotFoundError('Endereço');
      await tx.customerAddress.delete({ where: { id: current.id } });
      if (current.isDefault) {
        const next = await tx.customerAddress.findFirst({
          where: { tenantId: scope.tenantId, customerId },
          orderBy: [{ lastUsedAt: 'desc' }, { createdAt: 'desc' }],
          select: { id: true },
        });
        if (next)
          await tx.customerAddress.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function setDefaultConsumerAddress(input: {
  storeSlug: string;
  sessionToken?: string | null;
  addressId: string;
}) {
  const { scope, customerId } = await addressScope(input);
  await getDb().$transaction(
    async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`consumer-address:${customerId}`}, 0))`,
      );
      const target = await tx.customerAddress.findFirst({
        where: { id: input.addressId, tenantId: scope.tenantId, customerId },
        select: { id: true },
      });
      if (!target) throw new NotFoundError('Endereço');
      await tx.customerAddress.updateMany({
        where: { tenantId: scope.tenantId, customerId, isDefault: true },
        data: { isDefault: false },
      });
      await tx.customerAddress.update({ where: { id: target.id }, data: { isDefault: true } });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
