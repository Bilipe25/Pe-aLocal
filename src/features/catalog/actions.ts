'use server';

import { revalidateTag } from 'next/cache';
import { requireTenantMember } from '@/server/auth';
import { CACHE_TAGS } from '@/server/cache';
import { actionSuccess, actionError, NotFoundError, type ActionResult } from '@/server/errors';
import { createCategorySchema, createProductSchema, createOptionGroupSchema, createOptionSchema, updateOptionGroupSchema, updateOptionSchema } from '@/schemas/catalog';
import * as categoryRepo from '@/server/repositories/category.repository';
import * as productRepo from '@/server/repositories/product.repository';
import * as optionGroupRepo from '@/server/repositories/option-group.repository';
import * as storeRepo from '@/server/repositories/store.repository';

// =============================================================================
// Category Actions
// =============================================================================

export async function listCategoriesAction() {
  const ctx = await requireTenantMember();
  const store = await storeRepo.findStoreByTenantId(ctx.tenantId);
  if (!store) throw new NotFoundError('Loja');
  return categoryRepo.listCategories(ctx.tenantId, store.id);
}

export async function getCategoryAction(id: string) {
  const ctx = await requireTenantMember();
  return categoryRepo.findCategoryById(id, ctx.tenantId);
}

export async function createCategoryAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requireTenantMember();
    const store = await storeRepo.findStoreByTenantId(ctx.tenantId);
    if (!store) return actionError(new NotFoundError('Loja'));

    const raw = Object.fromEntries(formData);
    const parsed = createCategorySchema.safeParse(raw);
    if (!parsed.success) {
      return actionError({ code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message });
    }

    const category = await categoryRepo.createCategory({
      tenantId: ctx.tenantId,
      storeId: store.id,
      ...parsed.data,
    });

    revalidateTag(CACHE_TAGS.catalog(ctx.tenantId));
    return actionSuccess({ id: category.id });
  } catch (error) {
    return actionError(error);
  }
}

export async function updateCategoryAction(id: string, formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireTenantMember();

    const raw = Object.fromEntries(formData);
    const parsed = createCategorySchema.safeParse(raw);
    if (!parsed.success) {
      return actionError({ code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message });
    }

    await categoryRepo.updateCategory(id, ctx.tenantId, parsed.data);
    revalidateTag(CACHE_TAGS.catalog(ctx.tenantId));
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteCategoryAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireTenantMember();
    await categoryRepo.deleteCategory(id, ctx.tenantId);
    revalidateTag(CACHE_TAGS.catalog(ctx.tenantId));
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}

// =============================================================================
// Product Actions
// =============================================================================

export async function listProductsAction() {
  const ctx = await requireTenantMember();
  const store = await storeRepo.findStoreByTenantId(ctx.tenantId);
  if (!store) throw new NotFoundError('Loja');
  return productRepo.listProducts(ctx.tenantId, store.id);
}

export async function getProductAction(id: string) {
  const ctx = await requireTenantMember();
  return productRepo.findProductById(id, ctx.tenantId);
}

export async function createProductAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requireTenantMember();
    const store = await storeRepo.findStoreByTenantId(ctx.tenantId);
    if (!store) return actionError(new NotFoundError('Loja'));

    const raw = Object.fromEntries(formData);
    const parsed = createProductSchema.safeParse(raw);
    if (!parsed.success) {
      return actionError({ code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message });
    }

    // Converter preço de reais para centavos
    const product = await productRepo.createProduct({
      tenantId: ctx.tenantId,
      storeId: store.id,
      ...parsed.data,
      basePrice: Math.round(parsed.data.basePrice * 100),
    });

    revalidateTag(CACHE_TAGS.catalog(ctx.tenantId));
    return actionSuccess({ id: product.id });
  } catch (error) {
    return actionError(error);
  }
}

export async function updateProductAction(id: string, formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireTenantMember();

    const raw = Object.fromEntries(formData);
    const parsed = createProductSchema.safeParse(raw);
    if (!parsed.success) {
      return actionError({ code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message });
    }

    await productRepo.updateProduct(id, ctx.tenantId, {
      ...parsed.data,
      basePrice: Math.round(parsed.data.basePrice * 100),
    });

    revalidateTag(CACHE_TAGS.catalog(ctx.tenantId));
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteProductAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireTenantMember();
    await productRepo.deleteProduct(id, ctx.tenantId);
    revalidateTag(CACHE_TAGS.catalog(ctx.tenantId));
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}

// =============================================================================
// Option Group & Option Actions
// =============================================================================

export async function createOptionGroupAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    await requireTenantMember();

    const raw = Object.fromEntries(formData);
    const parsed = createOptionGroupSchema.safeParse(raw);
    if (!parsed.success) {
      return actionError({ code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message });
    }

    const group = await optionGroupRepo.createOptionGroup(parsed.data);
    return actionSuccess({ id: group.id });
  } catch (error) {
    return actionError(error);
  }
}

export async function updateOptionGroupAction(id: string, formData: FormData): Promise<ActionResult> {
  try {
    await requireTenantMember();

    const raw = Object.fromEntries(formData);
    const parsed = updateOptionGroupSchema.safeParse(raw);
    if (!parsed.success) {
      return actionError({ code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message });
    }

    await optionGroupRepo.updateOptionGroup(id, parsed.data);
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteOptionGroupAction(id: string): Promise<ActionResult> {
  try {
    await requireTenantMember();
    await optionGroupRepo.deleteOptionGroup(id);
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}

export async function createOptionAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    await requireTenantMember();

    const raw = Object.fromEntries(formData);
    const parsed = createOptionSchema.safeParse(raw);
    if (!parsed.success) {
      return actionError({ code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message });
    }

    const option = await optionGroupRepo.createOption({
      ...parsed.data,
      price: Math.round(parsed.data.price * 100),
    });
    return actionSuccess({ id: option.id });
  } catch (error) {
    return actionError(error);
  }
}

export async function updateOptionAction(id: string, formData: FormData): Promise<ActionResult> {
  try {
    await requireTenantMember();

    const raw = Object.fromEntries(formData);
    const parsed = updateOptionSchema.safeParse(raw);
    if (!parsed.success) {
      return actionError({ code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message });
    }

    await optionGroupRepo.updateOption(id, {
      ...parsed.data,
      price: Math.round(parsed.data.price * 100),
    });
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteOptionAction(id: string): Promise<ActionResult> {
  try {
    await requireTenantMember();
    await optionGroupRepo.deleteOption(id);
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}
