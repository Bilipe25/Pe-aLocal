import 'server-only';

import { Prisma, type CustomerRecognitionThrottleScope } from '@prisma/client';

import type { CustomerRecognitionInput } from '@/schemas/customer-recognition';
import { getDb } from '@/server/database/client';
import { RateLimitError } from '@/server/errors';
import { isDeployedRuntime } from '@/server/runtime-environment';
import {
  customerNamesMatch,
  maskCustomerName,
  maskPhone,
  maskSavedAddress,
  normalizeCustomerName,
  type CustomerAddressValue,
} from '@/server/services/customer-recognition-formatting';
import type {
  CustomerRecognitionConfirmationResult,
  CustomerRecognitionInvalidationResult,
  CustomerRecognitionResult,
  MaskedCustomerAddressDto,
} from '@/types/customer-recognition';

const SESSION_TTL_MS = 15 * 60 * 1_000;
const MAX_SESSION_ATTEMPTS = 5;
const MAX_MASKED_ADDRESSES = 5;
const TOKEN_BYTES = 32;
const GENERIC_NOT_RECOGNIZED_MESSAGE =
  'Não foi possível recuperar dados salvos. Você pode continuar preenchendo o checkout normalmente.';
const TEMPORARILY_UNAVAILABLE_MESSAGE =
  'O reconhecimento rápido está temporariamente indisponível. Continue preenchendo o checkout normalmente.';

type RecognitionClient = Pick<
  Prisma.TransactionClient,
  | '$executeRaw'
  | 'checkoutRecognitionSession'
  | 'checkoutRecognitionAddressReference'
  | 'customerRecognitionThrottle'
  | 'customer'
  | 'customerAddress'
  | 'deliveryZonePostalRange'
  | 'storeAddress'
  | 'storefrontDevice'
  | 'customerDeviceRecognition'
>;

interface RecognitionScope {
  tenantId: string;
  storeId: string;
}

interface RecognitionAddressRecord extends CustomerAddressValue {
  id: string;
  customerId: string;
  tenantId: string;
  label: 'HOME' | 'WORK' | 'OTHER';
  isDefault: boolean;
  lastUsedAt: Date | null;
  updatedAt: Date;
  addressFingerprint: string;
  storeUses: Array<{ deliveryZoneId: string }>;
}

export interface StartCustomerRecognitionParams extends RecognitionScope {
  input: CustomerRecognitionInput;
  browserToken?: string | null;
  clientIp: string;
  now?: Date;
}

export interface StartCustomerRecognitionResponse {
  result: CustomerRecognitionResult;
  browserToken: string;
  expiresAt: Date;
}

export interface StartDeviceCustomerRecognitionParams extends RecognitionScope {
  deviceToken?: string | null;
  browserToken?: string | null;
  now?: Date;
}

export interface ResolveRecognitionAddressReferenceParams extends RecognitionScope {
  opaqueReference: string;
  browserToken: string;
  client: RecognitionClient;
  now?: Date;
}

export interface ResolvedRecognitionAddress {
  referenceId: string;
  sessionId: string;
  customerId: string;
  address: {
    id: string;
    updatedAt: Date;
    street: string;
    number: string;
    complement: string | null;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string | null;
    reference: string | null;
    addressFingerprint: string;
  };
  mappedDeliveryZoneId: string | null;
}

export interface ResolvedRecognitionSession {
  sessionId: string;
  customerId: string;
  confirmationMode: 'SAVED_ADDRESS' | 'NEW_ADDRESS';
}

export interface ResolvedRecognitionIdentity extends ResolvedRecognitionSession {
  customerName: string;
  customerPhone: string;
  phoneNormalized: string;
  consumedAt: Date | null;
}

export interface ResolvedActiveRecognitionSession {
  sessionId: string;
}

export class RecognitionRateLimitError extends RateLimitError {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(TEMPORARILY_UNAVAILABLE_MESSAGE);
    this.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterSeconds));
  }
}

export function getRecognitionCookieName() {
  return isDeployedRuntime() ? '__Host-pedidolocal_recognition' : 'pedidolocal_recognition';
}

function bytesToBase64Url(bytes: Uint8Array) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let output = '';

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const block = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);
    output += alphabet[(block >>> 18) & 63];
    output += alphabet[(block >>> 12) & 63];
    if (second !== undefined) output += alphabet[(block >>> 6) & 63];
    if (third !== undefined) output += alphabet[block & 63];
  }

  return output;
}

export function createRecognitionSecret() {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
}

export async function hashRecognitionSecret(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function isRecognitionSecret(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

function addMilliseconds(value: Date, milliseconds: number) {
  return new Date(value.getTime() + milliseconds);
}

function secondsUntil(value: Date, now: Date) {
  return Math.max(1, Math.ceil((value.getTime() - now.getTime()) / 1_000));
}

function normalizedLocation(value: string) {
  return normalizeCustomerName(value);
}

function isBoundedAddressText(value: string | null | undefined, max: number, optional = false) {
  if (value == null || value.trim() === '') return optional;
  return Array.from(value.trim()).length <= max;
}

function addressFitsCheckoutContract(address: CustomerAddressValue) {
  const postalCode = address.zipCode?.replace(/\D/g, '') ?? '';
  return (
    isBoundedAddressText(address.street, 160) &&
    isBoundedAddressText(address.number, 30) &&
    isBoundedAddressText(address.complement, 120, true) &&
    isBoundedAddressText(address.neighborhood, 120) &&
    isBoundedAddressText(address.city, 120) &&
    /^[A-Za-z]{2}$/.test(address.state.trim()) &&
    (!postalCode || /^\d{8}$/.test(postalCode)) &&
    isBoundedAddressText(address.reference, 200, true)
  );
}

function locationMatchesStore(
  address: Pick<RecognitionAddressRecord, 'city' | 'state' | 'storeUses'>,
  storeAddress: { city: string; state: string } | null,
) {
  if (!storeAddress) return address.storeUses.length > 0;
  return (
    normalizedLocation(address.city) === normalizedLocation(storeAddress.city) &&
    address.state.trim().toUpperCase() === storeAddress.state.trim().toUpperCase()
  );
}

function labelForCustomer(label: RecognitionAddressRecord['label']) {
  if (label === 'HOME') return 'Casa';
  if (label === 'WORK') return 'Trabalho';
  return 'Outro endereço';
}

function lastUsedLabel(lastUsedAt: Date | null, now: Date) {
  if (!lastUsedAt) return undefined;
  return now.getTime() - lastUsedAt.getTime() <= 30 * 24 * 60 * 60 * 1_000
    ? 'Usado recentemente'
    : undefined;
}

async function acquireThrottleLocks(
  client: RecognitionClient,
  tenantId: string,
  entries: Array<{ scope: CustomerRecognitionThrottleScope; keyHash: string }>,
) {
  const keys = entries
    .map((entry) => `customer-recognition:${tenantId}:${entry.scope}:${entry.keyHash}`)
    .sort();
  for (const key of keys) {
    await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  }
}

async function recordThrottleAttempt(
  client: RecognitionClient,
  tenantId: string,
  entry: {
    throttleScope: CustomerRecognitionThrottleScope;
    storeId: string | null;
    keyHash: string;
    maxAttempts: number;
    windowMs: number;
  },
  now: Date,
) {
  const where = {
    tenantId_scope_keyHash: {
      tenantId,
      scope: entry.throttleScope,
      keyHash: entry.keyHash,
    },
  } as const;
  const existing = await client.customerRecognitionThrottle.findUnique({ where });
  const expiresAt = addMilliseconds(now, entry.windowMs);

  if (!existing || existing.expiresAt <= now) {
    await client.customerRecognitionThrottle.upsert({
      where,
      create: {
        tenantId,
        storeId: entry.storeId,
        scope: entry.throttleScope,
        keyHash: entry.keyHash,
        failureCount: 1,
        windowStartedAt: now,
        expiresAt,
      },
      update: {
        failureCount: 1,
        windowStartedAt: now,
        expiresAt,
        nextAttemptAt: null,
        blockedUntil: null,
      },
    });
    return;
  }

  const unavailableUntil = existing.blockedUntil ?? existing.nextAttemptAt;
  if (unavailableUntil && unavailableUntil > now) {
    throw new RecognitionRateLimitError(secondsUntil(unavailableUntil, now));
  }
  if (existing.failureCount >= entry.maxAttempts) {
    await client.customerRecognitionThrottle.update({
      where,
      data: { blockedUntil: existing.expiresAt },
    });
    throw new RecognitionRateLimitError(secondsUntil(existing.expiresAt, now));
  }

  await client.customerRecognitionThrottle.update({
    where,
    data: { failureCount: { increment: 1 } },
  });
}

async function ensureRecognitionSession(
  client: RecognitionClient,
  scope: RecognitionScope,
  browserToken: string | null | undefined,
  now: Date,
) {
  if (isRecognitionSecret(browserToken)) {
    const tokenHash = await hashRecognitionSecret(browserToken);
    const existing = await client.checkoutRecognitionSession.findUnique({
      where: { tokenHash },
    });
    if (
      existing &&
      existing.tenantId === scope.tenantId &&
      existing.storeId === scope.storeId &&
      existing.expiresAt > now &&
      !existing.invalidatedAt &&
      !existing.consumedAt
    ) {
      return { session: existing, browserToken };
    }
  }

  const nextBrowserToken = createRecognitionSecret();
  const session = await client.checkoutRecognitionSession.create({
    data: {
      ...scope,
      tokenHash: await hashRecognitionSecret(nextBrowserToken),
      expiresAt: addMilliseconds(now, SESSION_TTL_MS),
    },
  });
  return { session, browserToken: nextBrowserToken };
}

function resolvePostalZone(
  zipCode: string | null | undefined,
  ranges: Array<{ postalCodeStart: string; postalCodeEnd: string; deliveryZoneId: string }>,
) {
  const normalized = zipCode?.replace(/\D/g, '');
  if (!normalized || !/^\d{8}$/.test(normalized)) return null;
  return (
    ranges.find((range) => normalized >= range.postalCodeStart && normalized <= range.postalCodeEnd)
      ?.deliveryZoneId ?? null
  );
}

async function createMaskedAddressReferences(
  client: RecognitionClient,
  params: RecognitionScope & {
    sessionId: string;
    customerId: string;
    expiresAt: Date;
    now: Date;
  },
) {
  const [storeAddress, addresses, postalRanges] = await Promise.all([
    client.storeAddress.findUnique({
      where: { storeId: params.storeId },
      select: { city: true, state: true },
    }),
    client.customerAddress.findMany({
      where: { tenantId: params.tenantId, customerId: params.customerId },
      orderBy: [{ isDefault: 'desc' }, { lastUsedAt: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: 20,
      select: {
        id: true,
        tenantId: true,
        customerId: true,
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
        lastUsedAt: true,
        updatedAt: true,
        addressFingerprint: true,
        storeUses: {
          where: {
            tenantId: params.tenantId,
            storeId: params.storeId,
            deliveryZone: { isActive: true },
          },
          select: { deliveryZoneId: true },
          take: 1,
        },
      },
    }),
    client.deliveryZonePostalRange.findMany({
      where: {
        tenantId: params.tenantId,
        storeId: params.storeId,
        isActive: true,
        deliveryZone: { isActive: true },
      },
      select: { postalCodeStart: true, postalCodeEnd: true, deliveryZoneId: true },
    }),
  ]);

  const eligible = (addresses as RecognitionAddressRecord[])
    .filter(
      (address) =>
        addressFitsCheckoutContract(address) && locationMatchesStore(address, storeAddress),
    )
    .slice(0, MAX_MASKED_ADDRESSES);

  await client.checkoutRecognitionAddressReference.updateMany({
    where: {
      recognitionSessionId: params.sessionId,
      invalidatedAt: null,
      consumedAt: null,
    },
    data: { invalidatedAt: params.now },
  });

  const prepared = await Promise.all(
    eligible.map(async (address) => {
      const opaqueReference = createRecognitionSecret();
      const mappedDeliveryZoneId =
        address.storeUses[0]?.deliveryZoneId ?? resolvePostalZone(address.zipCode, postalRanges);
      return {
        data: {
          referenceHash: await hashRecognitionSecret(opaqueReference),
          recognitionSessionId: params.sessionId,
          tenantId: params.tenantId,
          storeId: params.storeId,
          customerId: params.customerId,
          customerAddressId: address.id,
          addressUpdatedAt: address.updatedAt,
          expiresAt: params.expiresAt,
        },
        dto: {
          opaqueReference,
          label: labelForCustomer(address.label),
          maskedAddress: maskSavedAddress(address),
          isDefault: address.isDefault,
          ...(lastUsedLabel(address.lastUsedAt, params.now)
            ? { lastUsedLabel: lastUsedLabel(address.lastUsedAt, params.now) }
            : {}),
          requiresDeliveryZoneSelection: !mappedDeliveryZoneId,
        } satisfies MaskedCustomerAddressDto,
      };
    }),
  );
  if (prepared.length > 0) {
    await client.checkoutRecognitionAddressReference.createMany({
      data: prepared.map((item) => item.data),
    });
  }
  return prepared.map((item) => item.dto);
}

function assertSessionCanAttempt(
  session: {
    attemptCount: number;
    nextAttemptAt: Date | null;
    blockedUntil: Date | null;
    expiresAt: Date;
  },
  now: Date,
) {
  const unavailableUntil = session.blockedUntil ?? session.nextAttemptAt;
  if (unavailableUntil && unavailableUntil > now) {
    throw new RecognitionRateLimitError(secondsUntil(unavailableUntil, now));
  }
  if (session.attemptCount >= MAX_SESSION_ATTEMPTS) {
    throw new RecognitionRateLimitError(secondsUntil(session.expiresAt, now));
  }
}

async function recordFailedSessionAttempt(
  client: RecognitionClient,
  session: {
    id: string;
    consecutiveFailures: number;
    expiresAt: Date;
  },
  now: Date,
) {
  const failureCount = session.consecutiveFailures + 1;
  const nextAttemptAt =
    failureCount === 3
      ? addMilliseconds(now, 15_000)
      : failureCount === 4
        ? addMilliseconds(now, 60_000)
        : null;
  const blockedUntil = failureCount >= MAX_SESSION_ATTEMPTS ? session.expiresAt : null;
  await client.checkoutRecognitionSession.update({
    where: { id: session.id },
    data: {
      attemptCount: { increment: 1 },
      consecutiveFailures: failureCount,
      customerId: null,
      deviceRecognitionId: null,
      nextAttemptAt,
      blockedUntil,
      confirmedAt: null,
      confirmationMode: null,
    },
  });
  await client.checkoutRecognitionAddressReference.updateMany({
    where: { recognitionSessionId: session.id, invalidatedAt: null, consumedAt: null },
    data: { invalidatedAt: now },
  });
}

export async function startCustomerRecognition(
  params: StartCustomerRecognitionParams,
): Promise<StartCustomerRecognitionResponse> {
  const now = params.now ?? new Date();
  const db = getDb();
  const ipHash = await hashRecognitionSecret(`ip:${params.clientIp}`);
  const phoneHash = await hashRecognitionSecret(`phone:${params.input.customerPhone}`);
  const storeHash = await hashRecognitionSecret(`store:${params.storeId}`);

  return db.$transaction(
    async (client) => {
      const scope = { tenantId: params.tenantId, storeId: params.storeId };
      const sessionData = await ensureRecognitionSession(client, scope, params.browserToken, now);
      assertSessionCanAttempt(sessionData.session, now);

      const throttleEntries = [
        {
          throttleScope: 'IP' as const,
          storeId: null,
          keyHash: ipHash,
          maxAttempts: 20,
          windowMs: 5 * 60_000,
        },
        {
          throttleScope: 'PHONE' as const,
          storeId: null,
          keyHash: phoneHash,
          maxAttempts: 5,
          windowMs: 15 * 60_000,
        },
        {
          throttleScope: 'STORE' as const,
          storeId: params.storeId,
          keyHash: storeHash,
          maxAttempts: 60,
          windowMs: 60_000,
        },
      ];
      await acquireThrottleLocks(
        client,
        params.tenantId,
        throttleEntries.map(({ throttleScope, keyHash }) => ({
          scope: throttleScope,
          keyHash,
        })),
      );
      for (const entry of throttleEntries) {
        await recordThrottleAttempt(client, params.tenantId, entry, now);
      }

      const customer = await client.customer.findUnique({
        where: {
          tenantId_phoneNormalized: {
            tenantId: params.tenantId,
            phoneNormalized: params.input.customerPhone,
          },
        },
        select: { id: true, name: true, phoneNormalized: true, recognitionEnabled: true },
      });
      if (
        !customer ||
        !customer.recognitionEnabled ||
        !customerNamesMatch(customer.name, params.input.customerName)
      ) {
        await recordFailedSessionAttempt(client, sessionData.session, now);
        return {
          result: { recognized: false, message: GENERIC_NOT_RECOGNIZED_MESSAGE },
          browserToken: sessionData.browserToken,
          expiresAt: sessionData.session.expiresAt,
        };
      }

      await client.checkoutRecognitionSession.update({
        where: { id: sessionData.session.id },
        data: {
          customerId: customer.id,
          deviceRecognitionId: null,
          attemptCount: { increment: 1 },
          consecutiveFailures: 0,
          nextAttemptAt: null,
          blockedUntil: null,
          confirmedAt: null,
          confirmationMode: null,
        },
      });
      const maskedAddresses = await createMaskedAddressReferences(client, {
        tenantId: params.tenantId,
        storeId: params.storeId,
        sessionId: sessionData.session.id,
        customerId: customer.id,
        expiresAt: sessionData.session.expiresAt,
        now,
      });

      return {
        result: {
          recognized: true,
          maskedName: maskCustomerName(customer.name),
          maskedPhone: maskPhone(customer.phoneNormalized),
          maskedAddresses,
        },
        browserToken: sessionData.browserToken,
        expiresAt: sessionData.session.expiresAt,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

/**
 * Reconhecimento não autenticado por aparelho. O token persistente apenas
 * localiza um vínculo previamente consentido; toda operação do checkout usa
 * uma nova sessão curta e retorna somente dados mascarados.
 */
export async function startDeviceCustomerRecognition(
  params: StartDeviceCustomerRecognitionParams,
): Promise<StartCustomerRecognitionResponse | null> {
  const now = params.now ?? new Date();
  if (!isRecognitionSecret(params.deviceToken)) return null;
  const deviceTokenHash = await hashRecognitionSecret(params.deviceToken);
  const db = getDb();

  return db.$transaction(
    async (client) => {
      const device = await client.storefrontDevice.findUnique({
        where: { tokenHash: deviceTokenHash },
        select: {
          id: true,
          expiresAt: true,
          recognitions: {
            where: {
              tenantId: params.tenantId,
              storeId: params.storeId,
              revokedAt: null,
              expiresAt: { gt: now },
            },
            take: 1,
            select: {
              id: true,
              customerId: true,
              customer: {
                select: {
                  id: true,
                  name: true,
                  phoneNormalized: true,
                  recognitionEnabled: true,
                },
              },
            },
          },
        },
      });
      const recognition = device?.recognitions[0];
      if (
        !device ||
        device.expiresAt <= now ||
        !recognition ||
        !recognition.customer.recognitionEnabled
      ) {
        return null;
      }

      const deviceThrottleHash = await hashRecognitionSecret(`device:${deviceTokenHash}`);
      await acquireThrottleLocks(client, params.tenantId, [
        { scope: 'SESSION', keyHash: deviceThrottleHash },
      ]);
      await recordThrottleAttempt(
        client,
        params.tenantId,
        {
          throttleScope: 'SESSION',
          storeId: params.storeId,
          keyHash: deviceThrottleHash,
          maxAttempts: 20,
          windowMs: 5 * 60_000,
        },
        now,
      );

      const scope = { tenantId: params.tenantId, storeId: params.storeId };
      const sessionData = await ensureRecognitionSession(client, scope, params.browserToken, now);
      await client.checkoutRecognitionSession.update({
        where: { id: sessionData.session.id },
        data: {
          customerId: recognition.customerId,
          deviceRecognitionId: recognition.id,
          consecutiveFailures: 0,
          nextAttemptAt: null,
          blockedUntil: null,
          confirmedAt: null,
          confirmationMode: null,
        },
      });
      const maskedAddresses = await createMaskedAddressReferences(client, {
        ...scope,
        sessionId: sessionData.session.id,
        customerId: recognition.customerId,
        expiresAt: sessionData.session.expiresAt,
        now,
      });
      await Promise.all([
        client.storefrontDevice.update({
          where: { id: device.id },
          data: { lastUsedAt: now },
        }),
        client.customerDeviceRecognition.update({
          where: { id: recognition.id },
          data: { lastUsedAt: now },
        }),
      ]);

      return {
        result: {
          recognized: true,
          maskedName: maskCustomerName(recognition.customer.name),
          maskedPhone: maskPhone(recognition.customer.phoneNormalized),
          maskedAddresses,
        },
        browserToken: sessionData.browserToken,
        expiresAt: sessionData.session.expiresAt,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

async function loadRecognitionAddressReference(
  params: ResolveRecognitionAddressReferenceParams,
  requireConfirmation: boolean,
): Promise<ResolvedRecognitionAddress | null> {
  const now = params.now ?? new Date();
  if (!isRecognitionSecret(params.browserToken) || !isRecognitionSecret(params.opaqueReference)) {
    return null;
  }

  const [tokenHash, referenceHash] = await Promise.all([
    hashRecognitionSecret(params.browserToken),
    hashRecognitionSecret(params.opaqueReference),
  ]);
  const reference = await params.client.checkoutRecognitionAddressReference.findUnique({
    where: { referenceHash },
    select: {
      id: true,
      recognitionSessionId: true,
      tenantId: true,
      storeId: true,
      customerId: true,
      addressUpdatedAt: true,
      expiresAt: true,
      invalidatedAt: true,
      consumedAt: true,
      confirmedAt: true,
      recognitionSession: {
        select: {
          tokenHash: true,
          customerId: true,
          expiresAt: true,
          invalidatedAt: true,
          consumedAt: true,
          confirmedAt: true,
          confirmationMode: true,
        },
      },
      customerAddress: {
        select: {
          id: true,
          tenantId: true,
          customerId: true,
          updatedAt: true,
          street: true,
          number: true,
          complement: true,
          neighborhood: true,
          city: true,
          state: true,
          zipCode: true,
          reference: true,
          addressFingerprint: true,
          storeUses: {
            where: {
              tenantId: params.tenantId,
              storeId: params.storeId,
              deliveryZone: { isActive: true },
            },
            select: { deliveryZoneId: true },
            take: 1,
          },
        },
      },
    },
  });

  if (
    !reference ||
    reference.tenantId !== params.tenantId ||
    reference.storeId !== params.storeId ||
    reference.expiresAt <= now ||
    reference.invalidatedAt ||
    reference.consumedAt ||
    reference.recognitionSession.tokenHash !== tokenHash ||
    reference.recognitionSession.customerId !== reference.customerId ||
    reference.recognitionSession.expiresAt <= now ||
    reference.recognitionSession.invalidatedAt ||
    reference.recognitionSession.consumedAt ||
    (requireConfirmation &&
      (!reference.confirmedAt ||
        !reference.recognitionSession.confirmedAt ||
        reference.recognitionSession.confirmationMode !== 'SAVED_ADDRESS')) ||
    reference.customerAddress.tenantId !== params.tenantId ||
    reference.customerAddress.customerId !== reference.customerId ||
    reference.customerAddress.updatedAt.getTime() !== reference.addressUpdatedAt.getTime()
  ) {
    return null;
  }

  const storeAddress = await params.client.storeAddress.findUnique({
    where: { storeId: params.storeId },
    select: { city: true, state: true },
  });
  const recognitionAddress = {
    ...reference.customerAddress,
    label: 'OTHER' as const,
    isDefault: false,
    lastUsedAt: null,
  };
  if (
    !addressFitsCheckoutContract(recognitionAddress) ||
    !locationMatchesStore(recognitionAddress, storeAddress)
  ) {
    return null;
  }

  let mappedDeliveryZoneId: string | null =
    reference.customerAddress.storeUses[0]?.deliveryZoneId ?? null;
  const normalizedZipCode = reference.customerAddress.zipCode?.replace(/\D/g, '');
  if (!mappedDeliveryZoneId && normalizedZipCode && /^\d{8}$/.test(normalizedZipCode)) {
    const postalRange = await params.client.deliveryZonePostalRange.findFirst({
      where: {
        tenantId: params.tenantId,
        storeId: params.storeId,
        isActive: true,
        postalCodeStart: { lte: normalizedZipCode },
        postalCodeEnd: { gte: normalizedZipCode },
        deliveryZone: { isActive: true },
      },
      select: { deliveryZoneId: true },
    });
    mappedDeliveryZoneId = postalRange?.deliveryZoneId ?? null;
  }

  const address = {
    id: reference.customerAddress.id,
    updatedAt: reference.customerAddress.updatedAt,
    street: reference.customerAddress.street,
    number: reference.customerAddress.number,
    complement: reference.customerAddress.complement,
    neighborhood: reference.customerAddress.neighborhood,
    city: reference.customerAddress.city,
    state: reference.customerAddress.state,
    zipCode: reference.customerAddress.zipCode,
    reference: reference.customerAddress.reference,
    addressFingerprint: reference.customerAddress.addressFingerprint,
  };
  return {
    referenceId: reference.id,
    sessionId: reference.recognitionSessionId,
    customerId: reference.customerId,
    address,
    mappedDeliveryZoneId,
  };
}

export async function resolveRecognitionAddressReference(
  params: ResolveRecognitionAddressReferenceParams,
): Promise<ResolvedRecognitionAddress | null> {
  return loadRecognitionAddressReference(params, true);
}

export async function resolveConfirmedRecognition(params: {
  tenantId: string;
  storeId: string;
  browserToken: string;
  client: RecognitionClient;
  now?: Date;
}): Promise<ResolvedRecognitionSession | null> {
  const identity = await resolveRecognitionIdentity(params);
  if (!identity) return null;
  return {
    sessionId: identity.sessionId,
    customerId: identity.customerId,
    confirmationMode: identity.confirmationMode,
  };
}

export async function resolveRecognitionIdentity(params: {
  tenantId: string;
  storeId: string;
  browserToken: string;
  client: RecognitionClient;
  now?: Date;
  allowConsumed?: boolean;
}): Promise<ResolvedRecognitionIdentity | null> {
  const now = params.now ?? new Date();
  if (!isRecognitionSecret(params.browserToken)) return null;
  const tokenHash = await hashRecognitionSecret(params.browserToken);
  const session = await params.client.checkoutRecognitionSession.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      tenantId: true,
      storeId: true,
      customerId: true,
      expiresAt: true,
      invalidatedAt: true,
      consumedAt: true,
      confirmedAt: true,
      confirmationMode: true,
      customer: {
        select: {
          id: true,
          tenantId: true,
          name: true,
          phone: true,
          phoneNormalized: true,
          recognitionEnabled: true,
        },
      },
    },
  });
  if (
    !session?.customerId ||
    session.tenantId !== params.tenantId ||
    session.storeId !== params.storeId ||
    session.expiresAt <= now ||
    session.invalidatedAt ||
    (!params.allowConsumed && session.consumedAt) ||
    !session.confirmedAt ||
    !session.confirmationMode ||
    !session.customer ||
    session.customer.tenantId !== params.tenantId ||
    !session.customer.recognitionEnabled
  ) {
    return null;
  }
  return {
    sessionId: session.id,
    customerId: session.customerId,
    confirmationMode: session.confirmationMode,
    customerName: session.customer.name,
    customerPhone: session.customer.phone,
    phoneNormalized: session.customer.phoneNormalized,
    consumedAt: session.consumedAt,
  };
}

export async function resolveActiveRecognitionSession(params: {
  tenantId: string;
  storeId: string;
  browserToken: string;
  client: RecognitionClient;
  now?: Date;
}): Promise<ResolvedActiveRecognitionSession | null> {
  const now = params.now ?? new Date();
  if (!isRecognitionSecret(params.browserToken)) return null;
  const tokenHash = await hashRecognitionSecret(params.browserToken);
  const session = await params.client.checkoutRecognitionSession.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      tenantId: true,
      storeId: true,
      expiresAt: true,
      invalidatedAt: true,
      consumedAt: true,
    },
  });
  if (
    !session ||
    session.tenantId !== params.tenantId ||
    session.storeId !== params.storeId ||
    session.expiresAt <= now ||
    session.invalidatedAt ||
    session.consumedAt
  ) {
    return null;
  }
  return { sessionId: session.id };
}

export async function confirmRecognitionAddress(
  params: RecognitionScope & {
    browserToken: string;
    opaqueReference: string;
  },
): Promise<CustomerRecognitionConfirmationResult | null> {
  const now = new Date();
  const db = getDb();
  return db.$transaction(async (client) => {
    const resolved = await loadRecognitionAddressReference(
      {
        ...params,
        client,
        now,
      },
      false,
    );
    if (!resolved) return null;
    await client.checkoutRecognitionSession.update({
      where: { id: resolved.sessionId },
      data: { confirmedAt: now, confirmationMode: 'SAVED_ADDRESS' },
    });
    await client.checkoutRecognitionAddressReference.update({
      where: { id: resolved.referenceId },
      data: { confirmedAt: now },
    });
    return {
      confirmed: true,
      mode: 'SAVED_ADDRESS',
      opaqueReference: params.opaqueReference,
    } as const;
  });
}

export async function continueRecognitionWithNewAddress(
  params: RecognitionScope & {
    browserToken: string;
    now?: Date;
  },
): Promise<CustomerRecognitionConfirmationResult | null> {
  const now = params.now ?? new Date();
  if (!isRecognitionSecret(params.browserToken)) return null;
  const tokenHash = await hashRecognitionSecret(params.browserToken);
  const db = getDb();
  return db.$transaction(async (client) => {
    const session = await client.checkoutRecognitionSession.findUnique({ where: { tokenHash } });
    if (
      !session?.customerId ||
      session.tenantId !== params.tenantId ||
      session.storeId !== params.storeId ||
      session.expiresAt <= now ||
      session.invalidatedAt ||
      session.consumedAt
    ) {
      return null;
    }
    await client.checkoutRecognitionAddressReference.updateMany({
      where: { recognitionSessionId: session.id, invalidatedAt: null, consumedAt: null },
      data: { invalidatedAt: now },
    });
    await client.checkoutRecognitionSession.update({
      where: { id: session.id },
      data: { confirmedAt: now, confirmationMode: 'NEW_ADDRESS' },
    });
    return { confirmed: true, mode: 'NEW_ADDRESS' } as const;
  });
}

export async function invalidateRecognitionSession(
  params: RecognitionScope & {
    browserToken?: string | null;
    deviceToken?: string | null;
    now?: Date;
  },
): Promise<CustomerRecognitionInvalidationResult> {
  const now = params.now ?? new Date();
  const browserTokenHash = isRecognitionSecret(params.browserToken)
    ? await hashRecognitionSecret(params.browserToken)
    : null;
  const deviceTokenHash = isRecognitionSecret(params.deviceToken)
    ? await hashRecognitionSecret(params.deviceToken)
    : null;
  if (!browserTokenHash && !deviceTokenHash) return { invalidated: true };
  const db = getDb();
  await db.$transaction(async (client) => {
    if (browserTokenHash) {
      const session = await client.checkoutRecognitionSession.findUnique({
        where: { tokenHash: browserTokenHash },
      });
      if (session && session.tenantId === params.tenantId && session.storeId === params.storeId) {
        await client.checkoutRecognitionSession.update({
          where: { id: session.id },
          data: { invalidatedAt: now, customerId: null, deviceRecognitionId: null },
        });
        await client.checkoutRecognitionAddressReference.updateMany({
          where: { recognitionSessionId: session.id, invalidatedAt: null, consumedAt: null },
          data: { invalidatedAt: now },
        });
      }
    }
    if (deviceTokenHash) {
      const device = await client.storefrontDevice.findUnique({
        where: { tokenHash: deviceTokenHash },
        select: { id: true },
      });
      if (device) {
        await client.customerDeviceRecognition.updateMany({
          where: {
            storefrontDeviceId: device.id,
            tenantId: params.tenantId,
            storeId: params.storeId,
            revokedAt: null,
          },
          data: { revokedAt: now },
        });
      }
    }
  });
  return { invalidated: true };
}

export async function consumeRecognitionSession(
  client: RecognitionClient,
  sessionId: string,
  now: Date,
) {
  const consumed = await client.checkoutRecognitionSession.updateMany({
    where: {
      id: sessionId,
      expiresAt: { gt: now },
      invalidatedAt: null,
      consumedAt: null,
    },
    data: { consumedAt: now },
  });
  if (consumed.count !== 1) return false;
  await client.checkoutRecognitionAddressReference.updateMany({
    where: { recognitionSessionId: sessionId, invalidatedAt: null, consumedAt: null },
    data: { consumedAt: now },
  });
  return true;
}
