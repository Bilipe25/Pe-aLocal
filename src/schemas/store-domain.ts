import { z } from 'zod';

export const STORE_DOMAIN_TYPES = ['SUBDOMAIN', 'CUSTOM'] as const;
export const STORE_DOMAIN_STATUSES = [
  'PENDING',
  'VERIFYING',
  'ACTIVE',
  'FAILED',
  'DISABLED',
] as const;

export const hostnameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(4)
  .max(253)
  .regex(
    /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
    'Informe apenas um hostname válido, sem protocolo, porta, caminho ou wildcard.',
  );

export const storeDomainRequestSchema = z
  .object({
    hostname: hostnameSchema,
    domainType: z.enum(STORE_DOMAIN_TYPES),
  })
  .strict();

export const storeDomainStatusSchema = z
  .object({
    domainId: z.uuid(),
    status: z.enum(STORE_DOMAIN_STATUSES),
    isPrimary: z.boolean(),
  })
  .strict();

export type StoreDomainRequestInput = z.input<typeof storeDomainRequestSchema>;
export type StoreDomainStatusInput = z.input<typeof storeDomainStatusSchema>;
