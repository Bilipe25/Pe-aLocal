import 'server-only';

import type { Prisma } from '@prisma/client';

import { normalizePhone } from '@/lib/brazil';
import type { CheckoutInput } from '@/schemas/checkout';
import {
  createCustomerAddressFingerprint,
  customerNamesMatch,
} from '@/server/services/customer-recognition-formatting';

export interface CheckoutCustomerAddress {
  id?: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string | null;
  reference: string | null;
}

interface PersistCheckoutCustomerParams {
  tx: Prisma.TransactionClient;
  tenantId: string;
  storeId: string;
  orderId: string;
  input: CheckoutInput;
  recognizedCustomerId?: string | null;
  address?: CheckoutCustomerAddress | null;
  deliveryZoneId?: string | null;
  now: Date;
}

export interface PersistCheckoutCustomerResult {
  customerId: string | null;
  addressId: string | null;
  nameConflict: boolean;
}

/**
 * Reconhecimento não autenticado. Esta função só associa dados após a criação
 * válida do pedido e nunca deve ser usada para autorizar leitura de PII.
 */
export async function persistCheckoutCustomerAfterOrder({
  tx,
  tenantId,
  storeId,
  orderId,
  input,
  recognizedCustomerId = null,
  address = null,
  deliveryZoneId = null,
  now,
}: PersistCheckoutCustomerParams): Promise<PersistCheckoutCustomerResult> {
  if (!input.saveCustomerData) {
    return { customerId: null, addressId: null, nameConflict: false };
  }

  const phoneNormalized = normalizePhone(input.customerPhone);
  const lockKey = `checkout-customer:${tenantId}:${phoneNormalized}`;
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
  `;

  const existing = await tx.customer.findUnique({
    where: { tenantId_phoneNormalized: { tenantId, phoneNormalized } },
    select: { id: true, name: true, recognitionEnabled: true },
  });

  if (
    (existing && !customerNamesMatch(existing.name, input.customerName)) ||
    (recognizedCustomerId && existing?.id !== recognizedCustomerId)
  ) {
    return { customerId: null, addressId: null, nameConflict: true };
  }

  const customer = existing
    ? await tx.customer.update({
        where: { id: existing.id },
        // Uma desativação existente pode representar uma decisão de
        // privacidade ou um bloqueio antiabuso. Somente clientes novos são
        // habilitados automaticamente pelo consentimento deste checkout.
        data: { lastOrderAt: now },
        select: { id: true },
      })
    : await tx.customer.create({
        data: {
          tenantId,
          name: input.customerName,
          phone: input.customerPhone,
          phoneNormalized,
          recognitionEnabled: true,
          lastOrderAt: now,
        },
        select: { id: true },
      });

  let addressId: string | null = null;
  if (address && deliveryZoneId) {
    const fingerprint = await createCustomerAddressFingerprint(address);
    let savedAddress = address.id
      ? await tx.customerAddress.findFirst({
          where: { id: address.id, tenantId, customerId: customer.id },
          select: { id: true },
        })
      : await tx.customerAddress.findUnique({
          where: {
            customerId_addressFingerprint: {
              customerId: customer.id,
              addressFingerprint: fingerprint,
            },
          },
          select: { id: true },
        });

    const existingAddressCount = await tx.customerAddress.count({
      where: { tenantId, customerId: customer.id },
    });
    const shouldBeDefault = input.setAddressAsDefault || existingAddressCount === 0;
    if (shouldBeDefault) {
      await tx.customerAddress.updateMany({
        where: { tenantId, customerId: customer.id, isDefault: true },
        data: { isDefault: false },
      });
    }

    if (savedAddress) {
      savedAddress = await tx.customerAddress.update({
        where: { id: savedAddress.id },
        data: {
          lastUsedAt: now,
          reference: address.reference,
          ...(address.id
            ? {}
            : { label: input.addressLabel, isDefault: shouldBeDefault || undefined }),
        },
        select: { id: true },
      });
    } else {
      savedAddress = await tx.customerAddress.create({
        data: {
          tenantId,
          customerId: customer.id,
          label: input.addressLabel,
          street: address.street,
          number: address.number,
          complement: address.complement,
          neighborhood: address.neighborhood,
          city: address.city,
          state: address.state,
          zipCode: address.zipCode,
          reference: address.reference,
          addressFingerprint: fingerprint,
          isDefault: shouldBeDefault,
          lastUsedAt: now,
        },
        select: { id: true },
      });
    }
    addressId = savedAddress.id;

    await tx.customerAddressStoreUse.upsert({
      where: { customerAddressId_storeId: { customerAddressId: addressId, storeId } },
      create: {
        tenantId,
        storeId,
        customerAddressId: addressId,
        deliveryZoneId,
        lastUsedAt: now,
      },
      update: { deliveryZoneId, lastUsedAt: now },
    });
  }

  await tx.order.update({
    where: { id: orderId },
    data: { customerId: customer.id },
  });

  return { customerId: customer.id, addressId, nameConflict: false };
}
