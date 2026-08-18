import { z } from 'zod';

const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use uma data no formato AAAA-MM-DD.')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, 'A data informada é inválida.');

const presetSchema = z.object({
  preset: z.enum(['TODAY', 'LAST_7_DAYS', 'LAST_30_DAYS']),
});

const customSchema = z
  .object({
    preset: z.literal('CUSTOM'),
    startLocalDate: localDateSchema,
    endLocalDate: localDateSchema,
  })
  .superRefine((value, context) => {
    const start = Date.parse(`${value.startLocalDate}T00:00:00.000Z`);
    const end = Date.parse(`${value.endLocalDate}T00:00:00.000Z`);
    if (start > end) {
      context.addIssue({
        code: 'custom',
        path: ['startLocalDate'],
        message: 'A data inicial precisa vir antes da data final.',
      });
      return;
    }
    const inclusiveDays = Math.floor((end - start) / 86_400_000) + 1;
    if (inclusiveDays > 365) {
      context.addIssue({
        code: 'custom',
        path: ['endLocalDate'],
        message: 'Escolha um período de no máximo 365 dias.',
      });
    }
  });

export const reportsPeriodInputSchema = z.discriminatedUnion('preset', [
  presetSchema,
  customSchema,
]);

export type ReportsPeriodSchemaInput = z.infer<typeof reportsPeriodInputSchema>;
