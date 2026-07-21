'use server';

import { updateTag } from 'next/cache';
import { Permission } from '@/server/permissions';
import { CACHE_TAGS } from '@/server/cache';
import { actionSuccess, actionError, NotFoundError, type ActionResult } from '@/server/errors';
import {
  createCategorySchema,
  createProductSchema,
  createOptionGroupSchema,
  createOptionSchema,
  updateOptionGroupSchema,
  updateOptionSchema,
} from '@/schemas/catalog';
import * as categoryRepo from '@/server/repositories/category.repository';
import * as productRepo from '@/server/repositories/product.repository';
import * as optionGroupRepo from '@/server/repositories/option-group.repository';
import { getDb } from '@/server/database/client';
import { requireActiveStoreContext } from '@/server/services/store-context.service';

type MoveDirection = 'up' | 'down';

// =============================================================================
// Category Actions
// =============================================================================

export async function listCategoriesAction() {
  const { session, store } = await requireActiveStoreContext();
  return categoryRepo.listCategories(session.tenantId, store.id);
}

export async function getCategoryAction(id: string) {
  const { session, store } = await requireActiveStoreContext();
  const category = await categoryRepo.findCategoryById(id, session.tenantId);
  return category?.storeId === store.id ? category : null;
}

export async function createCategoryAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { session, store } = await requireActiveStoreContext(Permission.MANAGE_CATALOG);

    const raw = Object.fromEntries(formData);
    const parsed = createCategorySchema.safeParse(raw);
    if (!parsed.success) {
      return actionError(new Error(parsed.error.issues[0].message));
    }

    const category = await categoryRepo.createCategory({
      tenantId: session.tenantId,
      storeId: store.id,
      ...parsed.data,
    });

    updateTag(CACHE_TAGS.catalog(store.id));
    return actionSuccess({ id: category.id });
  } catch (error) {
    return actionError(error);
  }
}

export async function updateCategoryAction(id: string, formData: FormData): Promise<ActionResult> {
  try {
    const { session, store } = await requireActiveStoreContext(Permission.MANAGE_CATALOG);

    const raw = Object.fromEntries(formData);
    const parsed = createCategorySchema.safeParse(raw);
    if (!parsed.success) {
      return actionError(new Error(parsed.error.issues[0].message));
    }

    const category = await categoryRepo.findCategoryById(id, session.tenantId);
    if (!category || category.storeId !== store.id)
      return actionError(new NotFoundError('Categoria'));
    await categoryRepo.updateCategory(id, session.tenantId, parsed.data);
    updateTag(CACHE_TAGS.catalog(category.storeId));
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteCategoryAction(id: string): Promise<ActionResult> {
  try {
    const { session, store } = await requireActiveStoreContext(Permission.MANAGE_CATALOG);
    const category = await categoryRepo.findCategoryById(id, session.tenantId);
    if (!category || category.storeId !== store.id)
      return actionError(new NotFoundError('Categoria'));
    await categoryRepo.deleteCategory(id, session.tenantId);
    updateTag(CACHE_TAGS.catalog(category.storeId));
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}

export async function moveCategoryAction(
  id: string,
  direction: MoveDirection,
): Promise<ActionResult> {
  try {
    const { session, store } = await requireActiveStoreContext(Permission.MANAGE_CATALOG);
    const category = await categoryRepo.findCategoryById(id, session.tenantId);
    if (!category || category.storeId !== store.id)
      return actionError(new NotFoundError('Categoria'));
    const categories = await getDb().category.findMany({
      where: { tenantId: session.tenantId, storeId: store.id },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    const index = categories.findIndex((item) => item.id === id);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= categories.length) return actionSuccess();
    const reordered = [...categories];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    await getDb().$transaction(
      reordered.map((item, sortOrder) =>
        getDb().category.update({ where: { id: item.id }, data: { sortOrder } }),
      ),
    );
    updateTag(CACHE_TAGS.catalog(category.storeId));
    return actionSuccess();
  } catch (error) {
    return actionError(error);
  }
}

// =============================================================================
// Product Actions
// =============================================================================

export async function listProductsAction() {
  const { session, store } = await requireActiveStoreContext();
  return productRepo.listProducts(session.tenantId, store.id);
}

export async function getProductAction(id: string) {
  const { session, store } = await requireActiveStoreContext();
  const product = await productRepo.findProductById(id, session.tenantId);
  return product?.storeId === store.id ? product : null;
}

export async function createProductAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { session, store } = await requireActiveStoreContext(Permission.MANAGE_CATALOG);

    const raw = Object.fromEntries(formData);
    const parsed = createProductSchema.safeParse(raw);
    if (!parsed.success) {
      return actionError(new Error(parsed.error.issues[0].message));
    }

    // Converter preço de reais para centavos
    const product = await productRepo.createProduct({
      tenantId: session.tenantId,
      storeId: store.id,
      ...parsed.data,
      basePrice: Math.round(parsed.data.basePrice * 100),
    });

    updateTag(CACHE_TAGS.catalog(store.id));
    return actionSuccess({ id: product.id });
  } catch (error) {
    return actionError(error);
  }
}

export async function updateProductAction(id: string, formData: FormData): Promise<ActionResult> {
  try {
    const { session, store } = await requireActiveStoreContext(Permission.MANAGE_CATALOG);

    const raw = Object.fromEntries(formData);
    const parsed = createProductSchema.safeParse(raw);
    if (!parsed.success) {
      return actionError(new Error(parsed.error.issues[0].message));
    }

    const product = await productRepo.findProductById(id, session.tenantId);
    if (!product || product.storeId !== store.id) return actionError(new NotFoundError('Produto'));
    await productRepo.updateProduct(id, session.tenantId, {
      ...parsed.data,
      basePrice: Math.round(parsed.data.basePrice * 100),
    });

    updateTag(CACHE_TAGS.catalog(product.storeId));
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteProductAction(id: string): Promise<ActionResult> {
  try {
    const { session, store } = await requireActiveStoreContext(Permission.MANAGE_CATALOG);
    const product = await productRepo.findProductById(id, session.tenantId);
    if (!product || product.storeId !== store.id) return actionError(new NotFoundError('Produto'));
    await productRepo.deleteProduct(id, session.tenantId);
    updateTag(CACHE_TAGS.catalog(product.storeId));
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}

export async function moveProductAction(
  id: string,
  direction: MoveDirection,
): Promise<ActionResult> {
  try {
    const { session, store } = await requireActiveStoreContext(Permission.MANAGE_CATALOG);
    const product = await productRepo.findProductById(id, session.tenantId);
    if (!product || product.storeId !== store.id) return actionError(new NotFoundError('Produto'));
    const products = await getDb().product.findMany({
      where: { tenantId: session.tenantId, categoryId: product.categoryId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    const index = products.findIndex((item) => item.id === id);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= products.length) return actionSuccess();
    const reordered = [...products];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    await getDb().$transaction(
      reordered.map((item, sortOrder) =>
        getDb().product.update({ where: { id: item.id }, data: { sortOrder } }),
      ),
    );
    updateTag(CACHE_TAGS.catalog(product.storeId));
    return actionSuccess();
  } catch (error) {
    return actionError(error);
  }
}

// =============================================================================
// Option Group & Option Actions
// =============================================================================

export async function createOptionGroupAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { session, store } = await requireActiveStoreContext(Permission.MANAGE_CATALOG);

    const raw = Object.fromEntries(formData);
    if (raw.isMultiple !== 'true') {
      raw.minSelections = raw.isRequired === 'true' ? '1' : '0';
      raw.maxSelections = '1';
    }
    const parsed = createOptionGroupSchema.safeParse(raw);
    if (!parsed.success) {
      return actionError(new Error(parsed.error.issues[0].message));
    }
    if (parsed.data.minSelections > parsed.data.maxSelections) {
      return actionError(new Error('O mínimo de escolhas não pode ser maior que o máximo.'));
    }

    const product = await productRepo.findProductById(parsed.data.productId, session.tenantId);
    if (!product || product.storeId !== store.id) return actionError(new NotFoundError('Produto'));

    const group = await optionGroupRepo.createOptionGroup(parsed.data);
    updateTag(CACHE_TAGS.catalog(product.storeId));
    return actionSuccess({ id: group.id });
  } catch (error) {
    return actionError(error);
  }
}

export async function updateOptionGroupAction(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const { session, store } = await requireActiveStoreContext(Permission.MANAGE_CATALOG);

    const raw = Object.fromEntries(formData);
    if (raw.isMultiple !== 'true') {
      raw.minSelections = raw.isRequired === 'true' ? '1' : '0';
      raw.maxSelections = '1';
    }
    const parsed = updateOptionGroupSchema.safeParse(raw);
    if (!parsed.success) {
      return actionError(new Error(parsed.error.issues[0].message));
    }
    if (parsed.data.minSelections > parsed.data.maxSelections) {
      return actionError(new Error('O mínimo de escolhas não pode ser maior que o máximo.'));
    }

    const group = await optionGroupRepo.findOptionGroupById(id);
    if (
      !group ||
      group.product.tenantId !== session.tenantId ||
      group.product.storeId !== store.id
    ) {
      return actionError(new NotFoundError('Grupo de opções'));
    }

    await optionGroupRepo.updateOptionGroup(id, parsed.data);
    updateTag(CACHE_TAGS.catalog(group.product.storeId));
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteOptionGroupAction(id: string): Promise<ActionResult> {
  try {
    const { session, store } = await requireActiveStoreContext(Permission.MANAGE_CATALOG);
    const group = await optionGroupRepo.findOptionGroupById(id);
    if (
      !group ||
      group.product.tenantId !== session.tenantId ||
      group.product.storeId !== store.id
    ) {
      return actionError(new NotFoundError('Grupo de opções'));
    }
    await optionGroupRepo.deleteOptionGroup(id);
    updateTag(CACHE_TAGS.catalog(group.product.storeId));
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}

export async function moveOptionGroupAction(
  id: string,
  direction: MoveDirection,
): Promise<ActionResult> {
  try {
    const { session, store } = await requireActiveStoreContext(Permission.MANAGE_CATALOG);
    const group = await optionGroupRepo.findOptionGroupById(id);
    if (!group || group.product.tenantId !== session.tenantId || group.product.storeId !== store.id)
      return actionError(new NotFoundError('Grupo de opções'));
    const groups = await getDb().productOptionGroup.findMany({
      where: { productId: group.productId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    const index = groups.findIndex((item) => item.id === id);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= groups.length) return actionSuccess();
    const reordered = [...groups];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    await getDb().$transaction(
      reordered.map((item, sortOrder) =>
        getDb().productOptionGroup.update({ where: { id: item.id }, data: { sortOrder } }),
      ),
    );
    updateTag(CACHE_TAGS.catalog(group.product.storeId));
    return actionSuccess();
  } catch (error) {
    return actionError(error);
  }
}

export async function createOptionAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { session, store } = await requireActiveStoreContext(Permission.MANAGE_CATALOG);

    const raw = Object.fromEntries(formData);
    const parsed = createOptionSchema.safeParse(raw);
    if (!parsed.success) {
      return actionError(new Error(parsed.error.issues[0].message));
    }

    const group = await optionGroupRepo.findOptionGroupById(parsed.data.groupId);
    if (
      !group ||
      group.product.tenantId !== session.tenantId ||
      group.product.storeId !== store.id
    ) {
      return actionError(new NotFoundError('Grupo de opções'));
    }

    const option = await optionGroupRepo.createOption({
      ...parsed.data,
      price: Math.round(parsed.data.price * 100),
    });
    updateTag(CACHE_TAGS.catalog(group.product.storeId));
    return actionSuccess({ id: option.id });
  } catch (error) {
    return actionError(error);
  }
}

export async function updateOptionAction(id: string, formData: FormData): Promise<ActionResult> {
  try {
    const { session, store } = await requireActiveStoreContext(Permission.MANAGE_CATALOG);

    const raw = Object.fromEntries(formData);
    const parsed = updateOptionSchema.safeParse(raw);
    if (!parsed.success) {
      return actionError(new Error(parsed.error.issues[0].message));
    }

    const option = await optionGroupRepo.findOptionById(id);
    if (
      !option ||
      option.group.product.tenantId !== session.tenantId ||
      option.group.product.storeId !== store.id
    ) {
      return actionError(new NotFoundError('Opção'));
    }

    await optionGroupRepo.updateOption(id, {
      ...parsed.data,
      price: Math.round(parsed.data.price * 100),
    });
    updateTag(CACHE_TAGS.catalog(option.group.product.storeId));
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteOptionAction(id: string): Promise<ActionResult> {
  try {
    const { session, store } = await requireActiveStoreContext(Permission.MANAGE_CATALOG);
    const option = await optionGroupRepo.findOptionById(id);
    if (
      !option ||
      option.group.product.tenantId !== session.tenantId ||
      option.group.product.storeId !== store.id
    ) {
      return actionError(new NotFoundError('Opção'));
    }
    await optionGroupRepo.deleteOption(id);
    updateTag(CACHE_TAGS.catalog(option.group.product.storeId));
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error);
  }
}

export async function moveOptionAction(
  id: string,
  direction: MoveDirection,
): Promise<ActionResult> {
  try {
    const { session, store } = await requireActiveStoreContext(Permission.MANAGE_CATALOG);
    const option = await optionGroupRepo.findOptionById(id);
    if (
      !option ||
      option.group.product.tenantId !== session.tenantId ||
      option.group.product.storeId !== store.id
    )
      return actionError(new NotFoundError('Opção'));
    const options = await getDb().productOption.findMany({
      where: { groupId: option.groupId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    const index = options.findIndex((item) => item.id === id);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= options.length) return actionSuccess();
    const reordered = [...options];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    await getDb().$transaction(
      reordered.map((item, sortOrder) =>
        getDb().productOption.update({ where: { id: item.id }, data: { sortOrder } }),
      ),
    );
    updateTag(CACHE_TAGS.catalog(option.group.product.storeId));
    return actionSuccess();
  } catch (error) {
    return actionError(error);
  }
}
