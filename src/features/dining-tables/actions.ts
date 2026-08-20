'use server';

import { revalidatePath } from 'next/cache';

import type {
  CreateDiningTablesBatchInput,
  RenameDiningTableInput,
  RotateDiningTableTokenInput,
  SetDiningTableActiveInput,
} from '@/schemas/dining-table';
import { actionError, actionSuccess } from '@/server/errors';
import {
  createDiningTablesBatch,
  renameDiningTable,
  rotateDiningTableToken,
  setDiningTableActive,
} from '@/server/services/dining-table.service';

function refreshDiningTables(storeId: string) {
  revalidatePath(`/dashboard/stores/${storeId}/tables`);
}

export async function createDiningTablesBatchAction(
  storeId: string,
  input: CreateDiningTablesBatchInput,
) {
  try {
    const tables = await createDiningTablesBatch(storeId, input);
    refreshDiningTables(storeId);
    return actionSuccess({ tables });
  } catch (error) {
    return actionError(error);
  }
}

export async function renameDiningTableAction(storeId: string, input: RenameDiningTableInput) {
  try {
    const table = await renameDiningTable(storeId, input);
    refreshDiningTables(storeId);
    return actionSuccess({ table });
  } catch (error) {
    return actionError(error);
  }
}

export async function setDiningTableActiveAction(
  storeId: string,
  input: SetDiningTableActiveInput,
) {
  try {
    const table = await setDiningTableActive(storeId, input);
    refreshDiningTables(storeId);
    return actionSuccess({ table });
  } catch (error) {
    return actionError(error);
  }
}

export async function rotateDiningTableTokenAction(
  storeId: string,
  input: RotateDiningTableTokenInput,
) {
  try {
    const table = await rotateDiningTableToken(storeId, input);
    refreshDiningTables(storeId);
    return actionSuccess({ table });
  } catch (error) {
    return actionError(error);
  }
}
