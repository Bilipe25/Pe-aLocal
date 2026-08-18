'use server';

import { reportsPeriodInputSchema } from '@/features/reports/schemas';
import { requireAdvancedReportsContext } from '@/features/reports/access';
import { actionError, actionSuccess, ValidationError } from '@/server/errors';
import { getAdvancedReports } from '@/server/services/reports.service';

export async function getAdvancedReportsAction(rawInput: unknown) {
  try {
    const parsed = reportsPeriodInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new ValidationError(
        'O período informado é inválido.',
        parsed.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      );
    }
    const { reportsContext } = await requireAdvancedReportsContext();
    return actionSuccess(await getAdvancedReports(reportsContext, parsed.data));
  } catch (error) {
    return actionError(error);
  }
}
