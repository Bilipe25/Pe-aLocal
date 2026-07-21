import { describe, it, expect } from 'vitest';
import { validateCartItem, validateCartItems } from '@/lib/checkout/cart-validator';
import { BusinessRuleError } from '@/server/errors';

describe('cart-validator', () => {
  const baseProduct = {
    id: 'prod-1',
    allowNotes: true,
    isAvailable: true,
    isSoldOut: false,
    archivedAt: null,
    optionGroups: [
      {
        id: 'group-required',
        title: 'Molho Obrigatório',
        isRequired: true,
        isMultiple: false,
        minSelections: 1,
        maxSelections: 1,
        isActive: true,
        archivedAt: null,
        options: [
          { id: 'opt-1', isAvailable: true, archivedAt: null },
          { id: 'opt-2', isAvailable: true, archivedAt: null },
        ],
      },
      {
        id: 'group-optional-multiple',
        title: 'Adicionais Extra',
        isRequired: false,
        isMultiple: true,
        minSelections: 0,
        maxSelections: 2,
        isActive: true,
        archivedAt: null,
        options: [
          { id: 'opt-3', isAvailable: true, archivedAt: null },
          { id: 'opt-4', isAvailable: true, archivedAt: null },
          { id: 'opt-5', isAvailable: false, archivedAt: null },
        ],
      },
    ],
  };

  describe('validateCartItem', () => {
    it('aceita item válido com grupo obrigatório preenchido', () => {
      expect(() =>
        validateCartItem(baseProduct, {
          productId: 'prod-1',
          optionIds: ['opt-1'],
          notes: 'Sem cebola',
        }),
      ).not.toThrow();
    });

    it('rejeita se produto estiver indisponível', () => {
      const prod = { ...baseProduct, isAvailable: false };
      expect(() =>
        validateCartItem(prod, { productId: 'prod-1', optionIds: ['opt-1'] }),
      ).toThrow(BusinessRuleError);
    });

    it('rejeita se produto estiver esgotado', () => {
      const prod = { ...baseProduct, isSoldOut: true };
      expect(() =>
        validateCartItem(prod, { productId: 'prod-1', optionIds: ['opt-1'] }),
      ).toThrow(BusinessRuleError);
    });

    it('rejeita se o produto não aceita observação mas uma é informada', () => {
      const prod = { ...baseProduct, allowNotes: false };
      expect(() =>
        validateCartItem(prod, {
          productId: 'prod-1',
          optionIds: ['opt-1'],
          notes: 'Capricha no molho',
        }),
      ).toThrow('O produto "prod-1" não aceita observações.');
    });

    it('rejeita se houver optionIds duplicados', () => {
      expect(() =>
        validateCartItem(baseProduct, {
          productId: 'prod-1',
          optionIds: ['opt-1', 'opt-1'],
        }),
      ).toThrow('O pedido contém adicionais duplicados');
    });

    it('rejeita se o grupo obrigatório não for preenchido', () => {
      expect(() =>
        validateCartItem(baseProduct, {
          productId: 'prod-1',
          optionIds: ['opt-3'],
        }),
      ).toThrow('O grupo de adicionais "Molho Obrigatório" é obrigatório.');
    });

    it('rejeita se selecionar mais de 1 opção em grupo não-múltiplo', () => {
      expect(() =>
        validateCartItem(baseProduct, {
          productId: 'prod-1',
          optionIds: ['opt-1', 'opt-2'],
        }),
      ).toThrow('Selecione apenas 1 opção em "Molho Obrigatório".');
    });

    it('rejeita se selecionar mais opções que o maxSelections em grupo múltiplo', () => {
      const prodWith3Opts = {
        ...baseProduct,
        optionGroups: [
          baseProduct.optionGroups[0],
          {
            ...baseProduct.optionGroups[1],
            options: [
              { id: 'opt-3', isAvailable: true, archivedAt: null },
              { id: 'opt-4', isAvailable: true, archivedAt: null },
              { id: 'opt-6', isAvailable: true, archivedAt: null },
            ],
          },
        ],
      };
      expect(() =>
        validateCartItem(prodWith3Opts, {
          productId: 'prod-1',
          optionIds: ['opt-1', 'opt-3', 'opt-4', 'opt-6'],
        }),
      ).toThrow('Selecione no máximo 2 opção(ões) em "Adicionais Extra".');
    });

    it('rejeita adicional indisponível', () => {
      expect(() =>
        validateCartItem(baseProduct, {
          productId: 'prod-1',
          optionIds: ['opt-1', 'opt-5'],
        }),
      ).toThrow('Adicional "opt-5" não está disponível.');
    });
  });

  describe('validateCartItems', () => {
    it('rejeita carrinho com produtos duplicados', () => {
      const productMap = new Map([['prod-1', baseProduct]]);
      const items = [
        { productId: 'prod-1', optionIds: ['opt-1'] },
        { productId: 'prod-1', optionIds: ['opt-2'] },
      ];
      expect(() => validateCartItems(productMap, items)).toThrow(
        'O produto "prod-1" aparece mais de uma vez no pedido.',
      );
    });
  });
});
