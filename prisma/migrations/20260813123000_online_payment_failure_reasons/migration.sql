-- Distinguish provider setup/expiry failures from a payment the store could not identify.
ALTER TYPE "OrderCancellationReasonCode"
  ADD VALUE IF NOT EXISTS 'ONLINE_PAYMENT_CREATION_FAILED';

ALTER TYPE "OrderCancellationReasonCode"
  ADD VALUE IF NOT EXISTS 'PIX_EXPIRED';

ALTER TYPE "OrderCancellationReasonCode"
  ADD VALUE IF NOT EXISTS 'PROVIDER_CANCELLED';
