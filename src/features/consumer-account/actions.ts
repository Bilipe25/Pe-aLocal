'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { consumerAddressInputSchema } from '@/schemas/consumer-address';
import { actionError, actionSuccess, ValidationError } from '@/server/errors';
import { createConsumerAddress, deleteConsumerAddress, setDefaultConsumerAddress, updateConsumerAddress } from '@/server/services/consumer-address.service';
import { CONSUMER_SESSION_COOKIE } from '@/server/services/consumer-auth.service';

const idSchema = z.guid();

async function sessionToken() { return (await cookies()).get(CONSUMER_SESSION_COOKIE)?.value; }
function refresh(storeSlug: string) { revalidatePath(`/${storeSlug}/account/addresses`); revalidatePath(`/${storeSlug}/checkout`); }

export async function saveConsumerAddressAction(storeSlug: string, addressId: string | null, rawInput: unknown) {
  try {
    const parsed = consumerAddressInputSchema.safeParse(rawInput);
    if (!parsed.success || (addressId && !idSchema.safeParse(addressId).success)) throw new ValidationError('Revise os dados do endereço.');
    if (addressId) await updateConsumerAddress({ storeSlug, sessionToken: await sessionToken(), addressId, address: parsed.data });
    else await createConsumerAddress({ storeSlug, sessionToken: await sessionToken(), address: parsed.data });
    refresh(storeSlug);
    return actionSuccess(undefined);
  } catch (error) { return actionError(error); }
}

export async function deleteConsumerAddressAction(storeSlug: string, addressId: string) {
  try {
    if (!idSchema.safeParse(addressId).success) throw new ValidationError();
    await deleteConsumerAddress({ storeSlug, sessionToken: await sessionToken(), addressId });
    refresh(storeSlug);
    return actionSuccess(undefined);
  } catch (error) { return actionError(error); }
}

export async function setDefaultConsumerAddressAction(storeSlug: string, addressId: string) {
  try {
    if (!idSchema.safeParse(addressId).success) throw new ValidationError();
    await setDefaultConsumerAddress({ storeSlug, sessionToken: await sessionToken(), addressId });
    refresh(storeSlug);
    return actionSuccess(undefined);
  } catch (error) { return actionError(error); }
}
