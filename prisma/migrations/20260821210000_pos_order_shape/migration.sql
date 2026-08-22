BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- O PDV permite identificar o cliente somente quando isso ajuda a operação.
-- A constraint original do QR de mesa, porém, exigia telefone para toda
-- modalidade diferente de DINE_IN e também bloqueava cartão presencial na
-- retirada. Preserve as garantias do storefront/QR e abra somente a exceção
-- explícita para pedidos cuja origem autoritativa é o POS.
ALTER TABLE public.orders
  DROP CONSTRAINT "orders_dine_in_shape_check";

ALTER TABLE public.orders
  ADD CONSTRAINT "orders_dine_in_shape_check" CHECK (
    (
      "modality" = 'DINE_IN'
      AND "diningTableId" IS NOT NULL
      AND "diningTableLabelSnapshot" IS NOT NULL
      AND length(btrim("diningTableLabelSnapshot")) BETWEEN 1 AND 80
      AND (
        "origin" = 'POS'
        OR (
          "customerPhone" IS NULL
          AND "customerPhoneNormalized" IS NULL
          AND "changeFor" IS NULL
        )
      )
      AND "deliveryAddress" IS NULL
      AND "deliveryZoneName" IS NULL
      AND "deliveryPostalCode" IS NULL
      AND "deliveryStreet" IS NULL
      AND "deliveryNumber" IS NULL
      AND "deliveryComplement" IS NULL
      AND "deliveryNeighborhood" IS NULL
      AND "deliveryCity" IS NULL
      AND "deliveryState" IS NULL
      AND "deliveryReference" IS NULL
      AND "deliveryFee" = 0
      AND "paymentMethod" IN ('PIX', 'CASH', 'CARD_IN_PERSON')
      AND "status" <> 'OUT_FOR_DELIVERY'
      AND ("status" <> 'DELIVERED' OR "paymentStatus" = 'PAID')
    )
    OR
    (
      "modality" <> 'DINE_IN'
      AND "diningTableId" IS NULL
      AND "diningTableLabelSnapshot" IS NULL
      AND (
        "origin" = 'POS'
        OR (
          "customerPhone" IS NOT NULL
          AND "paymentMethod" <> 'CARD_IN_PERSON'
        )
      )
    )
  ) NOT VALID;

ALTER TABLE public.orders
  VALIDATE CONSTRAINT "orders_dine_in_shape_check";

COMMIT;

-- Rollback operacional: restaure a expressão anterior somente depois de
-- impedir novos pedidos POS sem telefone/cartão presencial e tratar os pedidos
-- POS já persistidos que não satisfazem a regra legada.
