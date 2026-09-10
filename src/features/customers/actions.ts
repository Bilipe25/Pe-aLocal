'use server';

import { revalidatePath } from 'next/cache';

import type { CustomerReturnCampaignInput } from '@/schemas/customer-relationship';
import { actionError, actionSuccess, type ActionResult } from '@/server/errors';
import { createCustomerReturnCampaign } from '@/server/services/customer-return-campaign.service';

export async function createCustomerReturnCampaignAction(
  input: CustomerReturnCampaignInput,
): Promise<ActionResult<{ campaignId: string; recipients: number }>> {
  try {
    const result = await createCustomerReturnCampaign(input);
    revalidatePath('/dashboard/customers');
    revalidatePath('/dashboard/customers/return');
    return actionSuccess({ campaignId: result.campaignId, recipients: result.recipients });
  } catch (error) {
    return actionError(error);
  }
}
