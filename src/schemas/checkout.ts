import { z } from 'zod';

// =============================================================================
// Checkout Schema — PedidoLocal
// =============================================================================

const phoneRegex = /^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/;

export const checkoutItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(99),
  notes: z.string().max(500).optional().default(''),
  optionIds: z.array(z.string().uuid()).default([]),
});

export const checkoutSchema = z
  .object({
    customerName: z
      .string()
      .min(2, 'Nome deve ter pelo menos 2 caracteres')
      .max(100),
    customerPhone: z
      .string()
      .regex(phoneRegex, 'Telefone inválido. Ex: (11) 99999-9999'),
    modality: z.enum(['DELIVERY', 'PICKUP']),
    deliveryZoneId: z.string().uuid().optional(),
    deliveryAddress: z.string().max(500).optional(),
    paymentMethod: z.enum(['PIX', 'CASH', 'CARD_ON_DELIVERY']),
    changeFor: z.number().int().min(0).optional(),
    notes: z.string().max(500).optional().default(''),
    idempotencyKey: z.string().uuid(),
    items: z.array(checkoutItemSchema).min(1, 'O pedido deve ter pelo menos 1 item'),
  })
  .refine(
    (data) => {
      if (data.modality === 'DELIVERY') {
        return !!data.deliveryZoneId && !!data.deliveryAddress?.trim();
      }
      return true;
    },
    {
      message: 'Zona de entrega e endereço são obrigatórios para delivery',
      path: ['deliveryAddress'],
    },
  )
  .refine(
    (data) => {
      if (data.paymentMethod === 'CASH' && data.changeFor != null) {
        return data.changeFor > 0;
      }
      return true;
    },
    {
      message: 'Valor do troco deve ser maior que zero',
      path: ['changeFor'],
    },
  );

export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type CheckoutItemInput = z.infer<typeof checkoutItemSchema>;
