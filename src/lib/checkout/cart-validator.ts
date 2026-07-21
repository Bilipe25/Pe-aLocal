import { BusinessRuleError } from '@/server/errors';

// =============================================================================
// Checkout Option Group Validator
// =============================================================================
// Valida as regras de negócio dos adicionais no servidor:
//   - Grupos obrigatórios preenchidos
//   - minSelections / maxSelections respeitados
//   - Opções duplicadas rejeitadas
//   - allowNotes respeitado
//   - Apenas opções ativas e disponíveis aceitas
// =============================================================================

interface ValidatedGroup {
  id: string;
  title: string;
  isRequired: boolean;
  isMultiple: boolean;
  minSelections: number;
  maxSelections: number;
  isActive: boolean;
  archivedAt: Date | null;
  options: {
    id: string;
    isAvailable: boolean;
    archivedAt: Date | null;
  }[];
}

interface ValidatedProduct {
  id: string;
  allowNotes: boolean;
  isAvailable: boolean;
  isSoldOut: boolean;
  archivedAt: Date | null;
  optionGroups: ValidatedGroup[];
}

interface CartItem {
  productId: string;
  optionIds: string[];
  notes?: string;
}

/**
 * Valida um item do carrinho contra os dados reais do banco.
 * Lança BusinessRuleError em caso de violação das regras de negócio.
 *
 * @throws {BusinessRuleError} em qualquer violação
 */
export function validateCartItem(product: ValidatedProduct, cartItem: CartItem): void {
  // 1. Produto disponível
  if (!product.isAvailable) {
    throw new BusinessRuleError(`Produto "${cartItem.productId}" não está disponível.`);
  }
  if (product.isSoldOut) {
    throw new BusinessRuleError(`Produto "${cartItem.productId}" está esgotado.`);
  }
  if (product.archivedAt) {
    throw new BusinessRuleError(`Produto "${cartItem.productId}" não está disponível.`);
  }

  // 2. Observações — respeitar allowNotes
  if (!product.allowNotes && cartItem.notes && cartItem.notes.trim().length > 0) {
    throw new BusinessRuleError(
      `O produto "${cartItem.productId}" não aceita observações.`,
    );
  }

  // 3. Verificar duplicatas em optionIds
  const optionIdSet = new Set(cartItem.optionIds);
  if (optionIdSet.size !== cartItem.optionIds.length) {
    throw new BusinessRuleError(
      `O pedido contém adicionais duplicados para o produto "${cartItem.productId}".`,
    );
  }

  // 4. Mapeia todas as opções disponíveis do produto (flat)
  const availableOptionMap = new Map<string, { groupId: string }>();
  for (const group of product.optionGroups) {
    if (!group.isActive || group.archivedAt) continue;
    for (const option of group.options) {
      if (option.isAvailable && !option.archivedAt) {
        availableOptionMap.set(option.id, { groupId: group.id });
      }
    }
  }

  // 5. Verifica que todos os optionIds enviados são válidos
  for (const optionId of cartItem.optionIds) {
    if (!availableOptionMap.has(optionId)) {
      throw new BusinessRuleError(
        `Adicional "${optionId}" não está disponível.`,
      );
    }
  }

  // 6. Agrupa as opções selecionadas por groupId
  const selectedByGroup = new Map<string, string[]>();
  for (const optionId of cartItem.optionIds) {
    const mapped = availableOptionMap.get(optionId)!;
    if (!selectedByGroup.has(mapped.groupId)) {
      selectedByGroup.set(mapped.groupId, []);
    }
    selectedByGroup.get(mapped.groupId)!.push(optionId);
  }

  // 7. Valida cada grupo ativo
  for (const group of product.optionGroups) {
    if (!group.isActive || group.archivedAt) continue;

    const selected = selectedByGroup.get(group.id) ?? [];
    const count = selected.length;

    // Grupo obrigatório e mínimo de seleções
    if (group.isRequired && count === 0) {
      throw new BusinessRuleError(
        `O grupo de adicionais "${group.title}" é obrigatório.`,
      );
    }

    if (count > 0 && count < group.minSelections) {
      throw new BusinessRuleError(
        `Selecione pelo menos ${group.minSelections} opção(ões) em "${group.title}".`,
      );
    }

    // Grupo não-múltiplo: apenas 1 opção
    if (!group.isMultiple && count > 1) {
      throw new BusinessRuleError(
        `Selecione apenas 1 opção em "${group.title}".`,
      );
    }

    // Limite máximo (grupos múltiplos)
    if (group.isMultiple && count > group.maxSelections) {
      throw new BusinessRuleError(
        `Selecione no máximo ${group.maxSelections} opção(ões) em "${group.title}".`,
      );
    }
  }
}

/**
 * Valida todos os itens do carrinho.
 * O mapa de produtos já deve estar filtrado por storeId e disponibilidade básica.
 */
export function validateCartItems(
  productMap: Map<string, ValidatedProduct>,
  cartItems: CartItem[],
): void {
  // Verifica itens duplicados no carrinho (mesmo produto duas vezes)
  const productIdsSeen = new Set<string>();
  for (const item of cartItems) {
    if (productIdsSeen.has(item.productId)) {
      throw new BusinessRuleError(
        `O produto "${item.productId}" aparece mais de uma vez no pedido.`,
      );
    }
    productIdsSeen.add(item.productId);
  }

  for (const cartItem of cartItems) {
    const product = productMap.get(cartItem.productId);
    if (!product) {
      throw new BusinessRuleError(`Produto "${cartItem.productId}" não está disponível.`);
    }
    validateCartItem(product, cartItem);
  }
}
