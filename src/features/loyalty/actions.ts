'use server';

import type { LoyaltyProgramInput } from '@/schemas/loyalty';
import { actionError, actionSuccess, type ActionResult } from '@/server/errors';
import { saveLoyaltyProgram } from '@/server/services/loyalty.service';

export async function saveLoyaltyProgramAction(input: LoyaltyProgramInput): Promise<ActionResult> {
  try {
    await saveLoyaltyProgram(input);
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}
