import 'server-only';

import type { Prisma } from '@prisma/client';

import { normalizePhone } from '@/lib/brazil';
import type { PosDeliveryAddressInput, PosOrderInput } from '@/schemas/pos';
import { createCustomerAddressFingerprint } from '@/server/services/customer-recognition-formatting';

export async function persistPosCustomerAfterOrder(input: {
  tx: Prisma.TransactionClient;
  tenantId: string;
  storeId: string;
  orderId: string;
  orderInput: PosOrderInput;
  address: PosDeliveryAddressInput | null;
  now: Date;
}) {
  const { tx, tenantId, storeId, orderId, orderInput, address, now } = input;
  if (!orderInput.saveCustomerData || !orderInput.customerName || !orderInput.customerPhone) {
    return { customerId: orderInput.customerId ?? null, addressId: null };
  }

  const phoneNormalized = normalizePhone(orderInput.customerPhone);
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${`pos-customer:${tenantId}:${phoneNormalized}`}, 0))
  `;

  const existing = orderInput.customerId
    ? await tx.customer.findFirst({
        where: { id: orderInput.customerId, tenantId },
        select: { id: true },
      })
    : await tx.customer.findUnique({
        where: { tenantId_phoneNormalized: { tenantId, phoneNormalized } },
        select: { id: true },
      });
  const customer = existing
    ? await tx.customer.update({
        where: { id: existing.id },
        data: { lastOrderAt: now },
        select: { id: true },
      })
    : await tx.customer.create({
        data: {
          tenantId,
          name: orderInput.customerName,
          phone: orderInput.customerPhone,
          phoneNormalized,
          recognitionEnabled: false,
          lastOrderAt: now,
        },
        select: { id: true },
      });

  let addressId: string | null = null;
  if (address) {
    const fingerprint = await createCustomerAddressFingerprint({
      street: address.street,
      number: address.number,
      complement: address.complement || null,
      neighborhood: address.neighborhood,
      city: address.city,
      state: address.state,
      zipCode: address.postalCode ?? null,
      reference: address.reference || null,
    });
    const saved = await tx.customerAddress.upsert({
      where: {
        customerId_addressFingerprint: {
          customerId: customer.id,
          addressFingerprint: fingerprint,
        },
      },
      create: {
        tenantId,
        customerId: customer.id,
        label: address.label,
        street: address.street,
        number: address.number,
        complement: address.complement || null,
        neighborhood: address.neighborhood,
        city: address.city,
        state: address.state,
        zipCode: address.postalCode ?? null,
        reference: address.reference || null,
        addressFingerprint: fingerprint,
        isDefault: false,
        lastUsedAt: now,
      },
      update: { reference: address.reference || null, lastUsedAt: now },
      select: { id: true },
    });
    addressId = saved.id;
    await tx.customerAddressStoreUse.upsert({
      where: { customerAddressId_storeId: { customerAddressId: saved.id, storeId } },
      create: {
        tenantId,
        storeId,
        customerAddressId: saved.id,
        deliveryZoneId: address.deliveryZoneId,
        lastUsedAt: now,
      },
      update: { deliveryZoneId: address.deliveryZoneId, lastUsedAt: now },
    });
  }

  await tx.order.update({ where: { id: orderId }, data: { customerId: customer.id } });
  return { customerId: customer.id, addressId };
}
