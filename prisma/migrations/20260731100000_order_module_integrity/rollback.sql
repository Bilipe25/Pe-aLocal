-- Prefer an operational rollback by deploying the previous application. It is
-- compatible with the additive security hardening below.
-- If the composite constraint must be reverted, execute this only after a
-- read-only preflight confirms that every order still matches its store tenant.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE public.orders
  ADD CONSTRAINT "orders_storeId_fkey"
  FOREIGN KEY ("storeId")
  REFERENCES public.stores("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE
  NOT VALID;

ALTER TABLE public.orders
  VALIDATE CONSTRAINT "orders_storeId_fkey";

ALTER TABLE public.orders
  DROP CONSTRAINT "orders_storeId_tenantId_fkey";

-- RLS and revoked public grants intentionally remain enabled: weakening access
-- control is not required for application rollback.

COMMIT;
