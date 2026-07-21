'use server';

import { updateTag } from 'next/cache';
import type { Prisma } from '@prisma/client';
import { Permission } from '@/server/permissions';
import { CACHE_TAGS } from '@/server/cache';
import {
  actionSuccess,
  actionError,
  NotFoundError,
  ConflictError,
  type ActionResult,
} from '@/server/errors';
import {
  createCategorySchema,
  createProductSchema,
  createOptionGroupSchema,
  createOptionSchema,
  updateOptionGroupSchema,
  updateOptionSchema,
  type UpdateCategoryInput,
} from '@/schemas/catalog';
import * as categoryRepo from '@/server/repositories/category.repository';
import * as productRepo from '@/server/repositories/product.repository';
import * as optionGroupRepo from '@/server/repositories/option-group.repository';
import * as auditRepo from '@/server/repositories/audit-log.repository';
import { getDb } from '@/server/database/client';
import { requireActiveStoreContext } from '@/server/services/store-context.service';

type MoveDirection = 'up' | 'down';

// =============================================================================
// Helpers internos
// =============================================================================

function getFieldErrors(error: { issues: Array<{ path: (string | number)[]; message: string }> }) {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form';
    if (!fieldErrors[key]) fieldErrors[key] = [];
    fieldErrors[key].push(issue.message);
  }
  return fieldErrors;
}


// =============================================================================
// Category Actions
// =============================================================================

export async function listCategoriesAction() {
  const { session, store } = await requireActiveStoreContext(Permission.VIEW_CATALOG);
  return categoryRepo.listCategories(session.tenantId, store.id);
}

export async function getCategoryAction(id: string) {
  const { session, store } = await requireActiveStoreContext(Permission.VIEW_CATALOG);
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
      return actionError(new Error(parsed.error.issues.map((i) => i.message).join('; ')));
    }

    const category = await getDb().$transaction(async (tx) => {
      const cat = await categoryRepo.createCategory(
        {
          tenantId: session.tenantId,
          storeId: store.id,
          name: parsed.data.name,
          description: parsed.data.description,
          isActive: parsed.data.isActive,
        },
        tx,
      );

      await auditRepo.createAuditLog(
        {
          tenantId: session.tenantId,
          storeId: store.id,
          userId: session.userId,
          action: 'CATEGORY_CREATED',
          entity: 'Category',
          entityId: cat.id,
          metadata: { name: cat.name, isActive: cat.isActive },
        },
        tx,
      );

      return cat;
    });

    updateTag(CACHE_TAGS.catalog(store.id));
    return actionSuccess({ id: category.id });
  } catch (error) {
    return actionError(error);
  }
}

export async function updateCategoryAction(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const { session, store } = await requireActiveStoreContext(Permission.MANAGE_CATALOG);

    const raw = Object.fromEntries(formData);
    const parsed = createCategorySchema.safeParse(raw);
    if (!parsed.success) {
      return actionError(new Error(parsed.error.issues.map((i) => i.message).join('; ')));
    }

    const category = await categoryRepo.findCategoryById(id, session.tenantId);
    if (!category || category.storeId !== store.id)
      return actionError(new NotFoundError('Categoria'));

    await getDb().$transaction(async (tx) => {
      await categoryRepo.updateCategory(
        id,
        session.tenantId,
        {
          name: parsed.data.name,
          description: parsed.data.description,
          isActive: parsed.data.isActive,
        },
        tx,
      );

      await auditRepo.createAuditLog(
        {
          tenantId: session.tenantId,
          storeId: store.id,
          userId: session.userId,
          action: 'CATEGORY_UPDATED',
          entity: 'Category',
          entityId: id,
          metadata: {
            changedFields: Object.keys(parsed.data),
            isActiveBefore: category.isActive,
            isActiveAfter: parsed.data.isActive,
          },
        },
        tx,
      );
    });

    updateTag(CACHE_TAGS.catalog(category.storeId));
    return actionSuccess();
  } catch (error) {
    return actionError(error);
  }
}

export async function archiveCategoryAction(
  id: string,
  archiveReason?: string,
): Promise<ActionResult> {
  try {
    const { session, store } = await requireActiveStoreContext(Permission.ARCHIVE_CATALOG_ITEMS);
    const category = await categoryRepo.findCategoryById(id, session.tenantId);
    if (!category || category.storeId !== store.id)
      return actionError(new NotFoundError('Categoria'));

    if (category.archivedAt) {
      return actionError(new Error('Categoria já está arquivada.'));
    }

    await getDb().$transaction(async (tx) => {
      await categoryRepo.archiveCategory(id, session.tenantId, session.userId, archiveReason, tx);

      await auditRepo.createAuditLog(
        {
          tenantId: session.tenantId,
          storeId: store.id,
          userId: session.userId,
          action: 'CATEGORY_ARCHIVED',
          entity: 'Category',
          entityId: id,
          metadata: { reason: archiveReason ?? null },
        },
        tx,
      );
    });

    updateTag(CACHE_TAGS.catalog(category.storeId));
    return actionSuccess();
  } catch (error) {
    return actionError(error);
  }
}

export async function restoreCategoryAction(id: string): Promise<ActionResult> {
  try {
    const { session, store } = await requireActiveStoreContext(Permission.ARCHIVE_CATALOG_ITEMS);
    const category = await categoryRepo.findCategoryById(id, session.tenantId);
    if (!category || category.storeId !== store.id)
      return actionError(new NotFoundError('Categoria'));

    await getDb().$transaction(async (tx) => {
      await categoryRepo.restoreCategory(id, session.tenantId, tx);

      await auditRepo.createAuditLog(
        {
          tenantId: session.tenantId,
          storeId: store.id,
          userId: session.userId,
          action: 'CATEGORY_RESTORED',
          entity: 'Category',
          entityId: id,
        },
        tx,
      );
    });

    updateTag(CACHE_TAGS.catalog(category.storeId));
    return actionSuccess();
  } catch (error) {
    return actionError(error);
  }
}

/** @deprecated Use archiveCategoryAction */
export async function deleteCategoryAction(id: string): Promise<ActionResult> {
  return archiveCategoryAction(id, 'Excluído pelo usuário (legado)');
}

export async function moveCategoryAction(
  id: string,
  direction: MoveDirection,
): Promise<ActionResult> {
  try {
    const { session, store } = await requireActiveStoreContext(Permission.REORDER_CATALOG);
    const category = await categoryRepo.findCategoryById(id, session.tenantId);
    if (!category || category.storeId !== store.id)
      return actionError(new NotFoundError('Categoria'));

    const categories = await getDb().category.findMany({
      where: { tenantId: session.tenantId, storeId: store.id, archivedAt: null },
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
        getDb().category.update({ where: { id: item.id }, data: { sortOrder: (sortOrder + 1) * 1000 } }),
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
  const { session, store } = await requireActiveStoreContext(Permission.VIEW_CATALOG);
  return productRepo.listProducts(session.tenantId, store.id);
}

export async function getProductAction(id: string) {
  const { session, store } = await requireActiveStoreContext(Permission.VIEW_CATALOG);
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
      return actionError(new Error(parsed.error.issues.map((i) => i.message).join('; ')));
    }

    // Verificar que a categoria pertence à mesma loja
    const category = await categoryRepo.findCategoryById(parsed.data.categoryId, session.tenantId);
    if (!category || category.storeId !== store.id) {
      return actionError(new NotFoundError('Categoria'));
    }

    const product = await getDb().$transaction(async (tx) => {
      const prod = await productRepo.createProduct(
        {
          tenantId: session.tenantId,
          storeId: store.id,
          categoryId: parsed.data.categoryId,
          name: parsed.data.name,
          description: parsed.data.description,
          basePrice: Math.round(parsed.data.basePrice * 100),
          isAvailable: parsed.data.isAvailable,
          isFeatured: parsed.data.isFeatured,
          allowNotes: parsed.data.allowNotes,
        },
        tx,
      );

      await auditRepo.createAuditLog(
        {
          tenantId: session.tenantId,
          storeId: store.id,
          userId: session.userId,
          action: 'PRODUCT_CREATED',
          entity: 'Product',
          entityId: prod.id,
          metadata: {
            name: prod.name,
            basePrice: prod.basePrice,
            categoryId: prod.categoryId,
          },
        },
        tx,
      );

      return prod;
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
      return actionError(new Error(parsed.error.issues.map((i) => i.message).join('; ')));
    }

    const product = await productRepo.findProductById(id, session.tenantId);
    if (!product || product.storeId !== store.id) return actionError(new NotFoundError('Produto'));

    // Verificar que a nova categoria pertence à mesma loja
    const category = await categoryRepo.findCategoryById(parsed.data.categoryId, session.tenantId);
    if (!category || category.storeId !== store.id) {
      return actionError(new NotFoundError('Categoria'));
    }

    const basePriceBefore = product.basePrice;
    const basePriceAfter = Math.round(parsed.data.basePrice * 100);

    await getDb().$transaction(async (tx) => {
      await productRepo.updateProduct(
        id,
        session.tenantId,
        {
          categoryId: parsed.data.categoryId,
          name: parsed.data.name,
          description: parsed.data.description,
          basePrice: basePriceAfter,
          isAvailable: parsed.data.isAvailable,
          isFeatured: parsed.data.isFeatured,
          allowNotes: parsed.data.allowNotes,
        },
        tx,
      );

      const auditMetadata: Prisma.InputJsonValue = {
        changedFields: Object.keys(parsed.data),
      } as Prisma.InputJsonValue;

      if (basePriceBefore !== basePriceAfter) {
        (auditMetadata as Record<string, unknown>).basePriceBefore = basePriceBefore;
        (auditMetadata as Record<string, unknown>).basePriceAfter = basePriceAfter;
      }

      await auditRepo.createAuditLog(
        {
          tenantId: session.tenantId,
          storeId: store.id,
          userId: session.userId,
          action: basePriceBefore !== basePriceAfter ? 'PRODUCT_PRICE_CHANGED' : 'PRODUCT_UPDATED',
          entity: 'Product',
          entityId: id,
          metadata: auditMetadata,
        },
        tx,
      );
    });

    updateTag(CACHE_TAGS.catalog(product.storeId));
    return actionSuccess();
  } catch (error) {
    return actionError(error);
  }
}

/** Atualiza disponibilidade — permitido para ATTENDANT. */
export async function setProductAvailabilityAction(
  id: string,
  data: { isAvailable?: boolean; isSoldOut?: boolean },
): Promise<ActionResult> {
  try {
    const { session, store } = await requireActiveStoreContext(
      Permission.MANAGE_PRODUCT_AVAILABILITY,
    );

    const product = await productRepo.findProductById(id, session.tenantId);
    if (!product || product.storeId !== store.id) return actionError(new NotFoundError('Produto'));

    await getDb().$transaction(async (tx) => {
      await productRepo.setProductAvailability(id, session.tenantId, data, tx);

      await auditRepo.createAuditLog(
        {
          tenantId: session.tenantId,
          storeId: store.id,
          userId: session.userId,
          action: 'PRODUCT_AVAILABILITY_CHANGED',
          entity: 'Product',
          entityId: id,
          metadata: {
            isAvailableBefore: product.isAvailable,
            isAvailableAfter: data.isAvailable ?? product.isAvailable,
            isSoldOutBefore: product.isSoldOut,
            isSoldOutAfter: data.isSoldOut ?? product.isSoldOut,
          },
        },
        tx,
      );
    });

    updateTag(CACHE_TAGS.catalog(product.storeId));
    return actionSuccess();
  } catch (error) {
    return actionError(error);
  }
}

export async function archiveProductAction(
  id: string,
  archiveReason?: string,
): Promise<ActionResult> {
  try {
    const { session, store } = await requireActiveStoreContext(Permission.ARCHIVE_CATALOG_ITEMS);
    const product = await productRepo.findProductById(id, session.tenantId);
    if (!product || product.storeId !== store.id) return actionError(new NotFoundError('Produto'));

    if (product.archivedAt) {
      return actionError(new Error('Produto já está arquivado.'));
    }

    await getDb().$transaction(async (tx) => {
      await productRepo.archiveProduct(id, session.tenantId, session.userId, archiveReason, tx);

      await auditRepo.createAuditLog(
        {
          tenantId: session.tenantId,
          storeId: store.id,
          userId: session.userId,
          action: 'PRODUCT_ARCHIVED',
          entity: 'Product',
          entityId: id,
          metadata: { reason: archiveReason ?? null },
        },
        tx,
      );
    });

    updateTag(CACHE_TAGS.catalog(product.storeId));
    return actionSuccess();
  } catch (error) {
    return actionError(error);
  }
}

export async function restoreProductAction(id: string): Promise<ActionResult> {
  try {
    const { session, store } = await requireActiveStoreContext(Permission.ARCHIVE_CATALOG_ITEMS);
    const product = await productRepo.findProductById(id, session.tenantId);
    if (!product || product.storeId !== store.id) return actionError(new NotFoundError('Produto'));

    await getDb().$transaction(async (tx) => {
      await productRepo.restoreProduct(id, session.tenantId, product.categoryId, tx);

      await auditRepo.createAuditLog(
        {
          tenantId: session.tenantId,
          storeId: store.id,
          userId: session.userId,
          action: 'PRODUCT_RESTORED',
          entity: 'Product',
          entityId: id,
        },
        tx,
      );
    });

    updateTag(CACHE_TAGS.catalog(product.storeId));
    return actionSuccess();
  } catch (error) {
    return actionError(error);
  }
}

/** @deprecated Use archiveProductAction */
export async function deleteProductAction(id: string): Promise<ActionResult> {
  return archiveProductAction(id, 'Excluído pelo usuário (legado)');
}

export async function moveProductAction(
  id: string,
  direction: MoveDirection,
): Promise<ActionResult> {
  try {
    const { session, store } = await requireActiveStoreContext(Permission.REORDER_CATALOG);
    const product = await productRepo.findProductById(id, session.tenantId);
    if (!product || product.storeId !== store.id) return actionError(new NotFoundError('Produto'));

    const products = await getDb().product.findMany({
      where: { tenantId: session.tenantId, categoryId: product.categoryId, archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });

    const index = products.findIndex((item) => item.id === id);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= products.length) return actionSuccess();

    const reordered = [...products];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];

    await getDb().$transaction(
      reordered.map((item, i) =>
        getDb().product.update({
          where: { id: item.id },
          data: { sortOrder: (i + 1) * 1000 },
        }),
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
    // Normaliza minSelections/maxSelections para grupos não-múltiplos
    if (raw.isMultiple !== 'true') {
      raw.minSelections = raw.isRequired === 'true' ? '1' : '0';
      raw.maxSelections = '1';
    }

    const parsed = createOptionGroupSchema.safeParse(raw);
    if (!parsed.success) {
      return actionError(new Error(parsed.error.issues.map((i) => i.message).join('; ')));
    }
    if (parsed.data.minSelections > parsed.data.maxSelections) {
      return actionError(new Error('O mínimo de escolhas não pode ser maior que o máximo.'));
    }

    const product = await productRepo.findProductById(parsed.data.productId, session.tenantId);
    if (!product || product.storeId !== store.id) return actionError(new NotFoundError('Produto'));

    const group = await getDb().$transaction(async (tx) => {
      const g = await optionGroupRepo.createOptionGroup(
        {
          productId: parsed.data.productId,
          title: parsed.data.title,
          description: parsed.data.description,
          isRequired: parsed.data.isRequired,
          isMultiple: parsed.data.isMultiple,
          minSelections: parsed.data.minSelections,
          maxSelections: parsed.data.maxSelections,
          isActive: parsed.data.isActive,
        },
        tx,
      );

      await auditRepo.createAuditLog(
        {
          tenantId: session.tenantId,
          storeId: store.id,
          userId: session.userId,
          action: 'OPTION_GROUP_CREATED',
          entity: 'ProductOptionGroup',
          entityId: g.id,
          metadata: { title: g.title, productId: g.productId },
        },
        tx,
      );

      return g;
    });

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
      return actionError(new Error(parsed.error.issues.map((i) => i.message).join('; ')));
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

    await getDb().$transaction(async (tx) => {
      await optionGroupRepo.updateOptionGroup(id, parsed.data, tx);

      await auditRepo.createAuditLog(
        {
          tenantId: session.tenantId,
          storeId: store.id,
          userId: session.userId,
          action: 'OPTION_GROUP_UPDATED',
          entity: 'ProductOptionGroup',
          entityId: id,
          metadata: { changedFields: Object.keys(parsed.data) },
        },
        tx,
      );
    });

    updateTag(CACHE_TAGS.catalog(group.product.storeId));
    return actionSuccess();
  } catch (error) {
    return actionError(error);
  }
}

export async function archiveOptionGroupAction(id: string): Promise<ActionResult> {
  try {
    const { session, store } = await requireActiveStoreContext(Permission.ARCHIVE_CATALOG_ITEMS);
    const group = await optionGroupRepo.findOptionGroupById(id);
    if (
      !group ||
      group.product.tenantId !== session.tenantId ||
      group.product.storeId !== store.id
    ) {
      return actionError(new NotFoundError('Grupo de opções'));
    }

    await getDb().$transaction(async (tx) => {
      await optionGroupRepo.archiveOptionGroup(id, session.userId, tx);

      await auditRepo.createAuditLog(
        {
          tenantId: session.tenantId,
          storeId: store.id,
          userId: session.userId,
          action: 'OPTION_GROUP_ARCHIVED',
          entity: 'ProductOptionGroup',
          entityId: id,
        },
        tx,
      );
    });

    updateTag(CACHE_TAGS.catalog(group.product.storeId));
    return actionSuccess();
  } catch (error) {
    return actionError(error);
  }
}

/** @deprecated Use archiveOptionGroupAction */
export async function deleteOptionGroupAction(id: string): Promise<ActionResult> {
  return archiveOptionGroupAction(id);
}

export async function moveOptionGroupAction(
  id: string,
  direction: MoveDirection,
): Promise<ActionResult> {
  try {
    const { session, store } = await requireActiveStoreContext(Permission.REORDER_CATALOG);
    const group = await optionGroupRepo.findOptionGroupById(id);
    if (!group || group.product.tenantId !== session.tenantId || group.product.storeId !== store.id)
      return actionError(new NotFoundError('Grupo de opções'));

    const groups = await getDb().productOptionGroup.findMany({
      where: { productId: group.productId, archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });

    const index = groups.findIndex((item) => item.id === id);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= groups.length) return actionSuccess();

    const reordered = [...groups];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];

    await getDb().$transaction(
      reordered.map((item, i) =>
        getDb().productOptionGroup.update({
          where: { id: item.id },
          data: { sortOrder: (i + 1) * 1000 },
        }),
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
      return actionError(new Error(parsed.error.issues.map((i) => i.message).join('; ')));
    }

    const group = await optionGroupRepo.findOptionGroupById(parsed.data.groupId);
    if (
      !group ||
      group.product.tenantId !== session.tenantId ||
      group.product.storeId !== store.id
    ) {
      return actionError(new NotFoundError('Grupo de opções'));
    }

    const option = await getDb().$transaction(async (tx) => {
      const opt = await optionGroupRepo.createOption(
        {
          groupId: parsed.data.groupId,
          name: parsed.data.name,
          price: Math.round(parsed.data.price * 100),
          isAvailable: parsed.data.isAvailable,
        },
        tx,
      );

      await auditRepo.createAuditLog(
        {
          tenantId: session.tenantId,
          storeId: store.id,
          userId: session.userId,
          action: 'OPTION_CREATED',
          entity: 'ProductOption',
          entityId: opt.id,
          metadata: { name: opt.name, price: opt.price, groupId: opt.groupId },
        },
        tx,
      );

      return opt;
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
      return actionError(new Error(parsed.error.issues.map((i) => i.message).join('; ')));
    }

    const option = await optionGroupRepo.findOptionById(id);
    if (
      !option ||
      option.group.product.tenantId !== session.tenantId ||
      option.group.product.storeId !== store.id
    ) {
      return actionError(new NotFoundError('Opção'));
    }

    await getDb().$transaction(async (tx) => {
      await optionGroupRepo.updateOption(
        id,
        {
          name: parsed.data.name,
          price: Math.round(parsed.data.price * 100),
          isAvailable: parsed.data.isAvailable,
        },
        tx,
      );

      await auditRepo.createAuditLog(
        {
          tenantId: session.tenantId,
          storeId: store.id,
          userId: session.userId,
          action: 'OPTION_UPDATED',
          entity: 'ProductOption',
          entityId: id,
          metadata: { changedFields: Object.keys(parsed.data) },
        },
        tx,
      );
    });

    updateTag(CACHE_TAGS.catalog(option.group.product.storeId));
    return actionSuccess();
  } catch (error) {
    return actionError(error);
  }
}

export async function archiveOptionAction(id: string): Promise<ActionResult> {
  try {
    const { session, store } = await requireActiveStoreContext(Permission.ARCHIVE_CATALOG_ITEMS);
    const option = await optionGroupRepo.findOptionById(id);
    if (
      !option ||
      option.group.product.tenantId !== session.tenantId ||
      option.group.product.storeId !== store.id
    ) {
      return actionError(new NotFoundError('Opção'));
    }

    await getDb().$transaction(async (tx) => {
      await optionGroupRepo.archiveOption(id, session.userId, tx);

      await auditRepo.createAuditLog(
        {
          tenantId: session.tenantId,
          storeId: store.id,
          userId: session.userId,
          action: 'OPTION_ARCHIVED',
          entity: 'ProductOption',
          entityId: id,
        },
        tx,
      );
    });

    updateTag(CACHE_TAGS.catalog(option.group.product.storeId));
    return actionSuccess();
  } catch (error) {
    return actionError(error);
  }
}

/** @deprecated Use archiveOptionAction */
export async function deleteOptionAction(id: string): Promise<ActionResult> {
  return archiveOptionAction(id);
}

export async function moveOptionAction(
  id: string,
  direction: MoveDirection,
): Promise<ActionResult> {
  try {
    const { session, store } = await requireActiveStoreContext(Permission.REORDER_CATALOG);
    const option = await optionGroupRepo.findOptionById(id);
    if (
      !option ||
      option.group.product.tenantId !== session.tenantId ||
      option.group.product.storeId !== store.id
    )
      return actionError(new NotFoundError('Opção'));

    const options = await getDb().productOption.findMany({
      where: { groupId: option.groupId, archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });

    const index = options.findIndex((item) => item.id === id);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= options.length) return actionSuccess();

    const reordered = [...options];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];

    await getDb().$transaction(
      reordered.map((item, i) =>
        getDb().productOption.update({
          where: { id: item.id },
          data: { sortOrder: (i + 1) * 1000 },
        }),
      ),
    );

    updateTag(CACHE_TAGS.catalog(option.group.product.storeId));
    return actionSuccess();
  } catch (error) {
    return actionError(error);
  }
}
