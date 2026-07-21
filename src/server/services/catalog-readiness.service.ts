import { getDb } from '@/server/database/client';

interface CatalogReadinessIssue {
  type: 'empty_category' | 'product_no_required_group_options';
  message: string;
  entityId: string;
  entityName: string;
}

/**
 * Analisa o catálogo da loja e retorna uma lista de problemas que podem
 * impedir clientes de finalizar pedidos ou encontrar produtos.
 */
export async function analyzeCatalogReadiness(
  tenantId: string,
  storeId: string,
): Promise<CatalogReadinessIssue[]> {
  const issues: CatalogReadinessIssue[] = [];

  // 1. Categorias ativas sem nenhum produto ativo
  const emptyCategories = await getDb().category.findMany({
    where: {
      tenantId,
      storeId,
      isActive: true,
      archivedAt: null,
      products: {
        none: {
          archivedAt: null,
          isAvailable: true,
        },
      },
    },
    select: { id: true, name: true },
  });

  for (const cat of emptyCategories) {
    issues.push({
      type: 'empty_category',
      entityId: cat.id,
      entityName: cat.name,
      message: `Categoria "${cat.name}" está ativa mas não tem produtos disponíveis.`,
    });
  }

  // 2. Produtos disponíveis com grupos obrigatórios que não têm opções ativas
  const productsWithRequiredGroups = await getDb().product.findMany({
    where: {
      tenantId,
      storeId,
      archivedAt: null,
      isAvailable: true,
      optionGroups: {
        some: {
          isRequired: true,
          isActive: true,
          archivedAt: null,
        },
      },
    },
    select: {
      id: true,
      name: true,
      optionGroups: {
        where: {
          isRequired: true,
          isActive: true,
          archivedAt: null,
        },
        select: {
          id: true,
          title: true,
          _count: {
            select: {
              options: {
                where: { isAvailable: true, archivedAt: null },
              },
            },
          },
        },
      },
    },
  });

  for (const product of productsWithRequiredGroups) {
    for (const group of product.optionGroups) {
      if (group._count.options === 0) {
        issues.push({
          type: 'product_no_required_group_options',
          entityId: product.id,
          entityName: product.name,
          message: `Produto "${product.name}" tem grupo obrigatório "${group.title}" sem nenhuma opção disponível.`,
        });
      }
    }
  }

  return issues;
}
