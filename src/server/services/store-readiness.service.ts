import 'server-only';

import type { PixKeyType, Prisma } from '@prisma/client';

import { validatePixKey } from '@/lib/brazil';
import { DEFAULT_STORE_TIME_ZONE } from '@/schemas/store';
import { requireTenantStoreAccess } from '@/server/auth';
import { TenantAccessError } from '@/server/errors';
import { Permission } from '@/server/permissions';
import * as storeRepo from '@/server/repositories/store.repository';

export const HIGH_MIN_ORDER_VALUE_CENTS = 50_000;

export type StoreReadinessSeverity = 'BLOCKER' | 'WARNING';

export type StoreReadinessIssueCode =
  | 'TENANT_NOT_ACTIVE'
  | 'STORE_INACTIVE'
  | 'MODALITY_REQUIRED'
  | 'PAYMENT_METHOD_REQUIRED'
  | 'PIX_CONFIGURATION_INVALID'
  | 'DELIVERY_ZONE_REQUIRED'
  | 'CATALOG_REQUIRED'
  | 'OPENING_HOURS_REQUIRED'
  | 'OPENING_HOURS_INVALID'
  | 'TIMEZONE_INVALID'
  | 'ESSENTIAL_DATA_MISSING'
  | 'ADDRESS_REQUIRED'
  | 'PHONE_MISSING'
  | 'WHATSAPP_MISSING'
  | 'DESCRIPTION_MISSING'
  | 'FEATURED_PRODUCT_MISSING'
  | 'BRAND_IMAGE_MISSING'
  | 'MIN_ORDER_VALUE_HIGH';

export interface StoreReadinessIssue {
  code: StoreReadinessIssueCode;
  severity: StoreReadinessSeverity;
  title: string;
  description: string;
  actionHref?: string;
}

export interface StoreReadiness {
  isReady: boolean;
  blockers: StoreReadinessIssue[];
  warnings: StoreReadinessIssue[];
  issues: StoreReadinessIssue[];
}

export type StoreReadinessSnapshot = NonNullable<
  Awaited<ReturnType<typeof storeRepo.findStoreReadinessById>>
>;

type ReadinessClient = Pick<Prisma.TransactionClient, 'store'>;

function route(storeId: string, page: string) {
  return `/dashboard/stores/${storeId}/${page}`;
}

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function isValidTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return false;
  return Number(match[1]) <= 23 && Number(match[2]) <= 59;
}

export function isValidStoreTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function isValidPixConfiguration(type: PixKeyType | null, key: string | null) {
  return Boolean(type && key && validatePixKey(type, key));
}

function hasCompleteAddress(address: StoreReadinessSnapshot['address']) {
  if (!address) return false;
  return (
    hasText(address.street) &&
    hasText(address.number) &&
    hasText(address.neighborhood) &&
    hasText(address.city) &&
    /^[A-Za-z]{2}$/.test(address.state.trim()) &&
    address.zipCode.replace(/\D/g, '').length === 8
  );
}

function hasPublishedBrandImage(snapshot: StoreReadinessSnapshot) {
  if (hasText(snapshot.logoUrl) || hasText(snapshot.coverUrl)) return true;
  const config = snapshot.customization?.publishedConfig;
  if (!config || typeof config !== 'object' || Array.isArray(config)) return false;
  const identity = (config as Record<string, unknown>).identity;
  if (!identity || typeof identity !== 'object' || Array.isArray(identity)) return false;
  const values = identity as Record<string, unknown>;
  return hasText(String(values.logoAssetId ?? '')) || hasText(String(values.coverAssetId ?? ''));
}

function issue(
  code: StoreReadinessIssueCode,
  severity: StoreReadinessSeverity,
  title: string,
  description: string,
  actionHref?: string,
): StoreReadinessIssue {
  return { code, severity, title, description, ...(actionHref ? { actionHref } : {}) };
}

export function evaluateStoreReadiness(
  snapshot: StoreReadinessSnapshot,
  timeZone = snapshot.timeZone ?? DEFAULT_STORE_TIME_ZONE,
): StoreReadiness {
  const blockers: StoreReadinessIssue[] = [];
  const warnings: StoreReadinessIssue[] = [];
  const settings = snapshot.settings;
  const operationsHref = route(snapshot.id, 'operations');
  const hoursHref = route(snapshot.id, 'hours');

  if (snapshot.tenant.status !== 'ACTIVE') {
    blockers.push(
      issue(
        'TENANT_NOT_ACTIVE',
        'BLOCKER',
        'Estabelecimento inativo',
        'O estabelecimento precisa estar ativo na plataforma antes de receber pedidos.',
      ),
    );
  }
  if (!snapshot.isActive) {
    blockers.push(
      issue(
        'STORE_INACTIVE',
        'BLOCKER',
        'Unidade inativa',
        'Ative a unidade antes de abrir o recebimento de pedidos.',
      ),
    );
  }
  if (!hasText(snapshot.name) || !hasText(snapshot.slug)) {
    blockers.push(
      issue(
        'ESSENTIAL_DATA_MISSING',
        'BLOCKER',
        'Dados essenciais incompletos',
        'Informe o nome e o endereço público da unidade.',
        route(snapshot.id, 'general'),
      ),
    );
  }
  if (!settings?.deliveryEnabled && !settings?.pickupEnabled) {
    blockers.push(
      issue(
        'MODALITY_REQUIRED',
        'BLOCKER',
        'Nenhuma modalidade ativa',
        'Habilite entrega ou retirada para que o cliente consiga concluir o pedido.',
        operationsHref,
      ),
    );
  }
  if (!settings?.acceptsPix && !settings?.acceptsCash && !settings?.acceptsCardOnDelivery) {
    blockers.push(
      issue(
        'PAYMENT_METHOD_REQUIRED',
        'BLOCKER',
        'Nenhuma forma de pagamento ativa',
        'Habilite ao menos uma forma de pagamento.',
        operationsHref,
      ),
    );
  }
  if (settings?.acceptsPix && !isValidPixConfiguration(settings.pixKeyType, settings.pixKey)) {
    blockers.push(
      issue(
        'PIX_CONFIGURATION_INVALID',
        'BLOCKER',
        'Configuração Pix incompleta',
        'Informe um tipo e uma chave Pix compatíveis antes de aceitar Pix.',
        route(snapshot.id, 'payments'),
      ),
    );
  }
  if (settings?.deliveryEnabled && snapshot.deliveryZones.length === 0) {
    blockers.push(
      issue(
        'DELIVERY_ZONE_REQUIRED',
        'BLOCKER',
        'Entrega sem zona ativa',
        'Cadastre ao menos uma zona ativa ou desabilite a entrega.',
        '/dashboard/delivery',
      ),
    );
  }
  if (snapshot.categories.length === 0) {
    blockers.push(
      issue(
        'CATALOG_REQUIRED',
        'BLOCKER',
        'Cardápio sem produtos disponíveis',
        'Ative uma categoria que possua ao menos um produto disponível.',
        '/dashboard/catalog',
      ),
    );
  }
  if (snapshot.openingHours.length === 0) {
    blockers.push(
      issue(
        'OPENING_HOURS_REQUIRED',
        'BLOCKER',
        'Horários não configurados',
        'Ative ao menos um dia de funcionamento.',
        hoursHref,
      ),
    );
  } else if (
    snapshot.openingHours.some(
      (hour) =>
        !isValidTime(hour.openTime) ||
        !isValidTime(hour.closeTime) ||
        hour.openTime === hour.closeTime,
    )
  ) {
    blockers.push(
      issue(
        'OPENING_HOURS_INVALID',
        'BLOCKER',
        'Horários inválidos',
        'Revise os horários ativos. Abertura e fechamento precisam ser válidos e diferentes.',
        hoursHref,
      ),
    );
  }
  if (!isValidStoreTimeZone(timeZone)) {
    blockers.push(
      issue(
        'TIMEZONE_INVALID',
        'BLOCKER',
        'Fuso horário inválido',
        'Selecione um fuso horário reconhecido para calcular a disponibilidade da loja.',
        hoursHref,
      ),
    );
  }
  if (
    (settings?.deliveryEnabled || settings?.pickupEnabled) &&
    !hasCompleteAddress(snapshot.address)
  ) {
    blockers.push(
      issue(
        'ADDRESS_REQUIRED',
        'BLOCKER',
        'Endereço operacional incompleto',
        'Complete o endereço usado para entrega ou retirada.',
        route(snapshot.id, 'address'),
      ),
    );
  }

  if (!hasText(snapshot.phone)) {
    warnings.push(
      issue(
        'PHONE_MISSING',
        'WARNING',
        'Telefone não informado',
        'Adicione um telefone para facilitar o contato com a unidade.',
        route(snapshot.id, 'general'),
      ),
    );
  }
  if (!hasText(snapshot.whatsapp)) {
    warnings.push(
      issue(
        'WHATSAPP_MISSING',
        'WARNING',
        'WhatsApp não informado',
        'Adicione um WhatsApp para o atendimento ao cliente.',
        route(snapshot.id, 'general'),
      ),
    );
  }
  if (!hasText(snapshot.description)) {
    warnings.push(
      issue(
        'DESCRIPTION_MISSING',
        'WARNING',
        'Descrição ausente',
        'Uma descrição curta ajuda o cliente a reconhecer a proposta da loja.',
        route(snapshot.id, 'general'),
      ),
    );
  }
  if (snapshot.products.length === 0) {
    warnings.push(
      issue(
        'FEATURED_PRODUCT_MISSING',
        'WARNING',
        'Nenhum produto em destaque',
        'Destaque um produto para orientar a escolha no cardápio.',
        '/dashboard/catalog',
      ),
    );
  }
  if (!hasPublishedBrandImage(snapshot)) {
    warnings.push(
      issue(
        'BRAND_IMAGE_MISSING',
        'WARNING',
        'Identidade visual incompleta',
        'Adicione logo ou capa para melhorar o reconhecimento da loja.',
      ),
    );
  }
  if ((settings?.minOrderValue ?? 0) > HIGH_MIN_ORDER_VALUE_CENTS) {
    warnings.push(
      issue(
        'MIN_ORDER_VALUE_HIGH',
        'WARNING',
        'Pedido mínimo elevado',
        'Revise se o pedido mínimo está adequado ao ticket esperado dos clientes.',
        operationsHref,
      ),
    );
  }

  return { isReady: blockers.length === 0, blockers, warnings, issues: [...blockers, ...warnings] };
}

export async function getStoreReadinessStateForTenant(
  tenantId: string,
  storeId: string,
  client?: ReadinessClient,
) {
  const snapshot = await storeRepo.findStoreReadinessById(storeId, tenantId, client);
  if (!snapshot) {
    throw new TenantAccessError('A loja não pertence ao estabelecimento autenticado.');
  }
  return { snapshot, readiness: evaluateStoreReadiness(snapshot) };
}

export async function getStoreReadinessForTenant(
  tenantId: string,
  storeId: string,
  client?: ReadinessClient,
) {
  const { readiness } = await getStoreReadinessStateForTenant(tenantId, storeId, client);
  return readiness;
}

export async function getStoreReadiness(storeId: string) {
  const { session } = await requireTenantStoreAccess(storeId, Permission.VIEW_STORE_OVERVIEW);
  return getStoreReadinessForTenant(session.tenantId, storeId);
}
