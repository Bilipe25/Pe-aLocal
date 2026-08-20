-- Pedido por QR Code no Salão: enums precisam ser confirmados antes de uso em constraints.

ALTER TYPE "OrderModality" ADD VALUE IF NOT EXISTS 'DINE_IN';
ALTER TYPE "PaymentMethodType" ADD VALUE IF NOT EXISTS 'CARD_IN_PERSON';
