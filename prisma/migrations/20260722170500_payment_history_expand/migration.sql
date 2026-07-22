BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.payments
  ADD COLUMN "reportedAt" TIMESTAMP(3),
  ADD COLUMN "failedAt" TIMESTAMP(3),
  ADD COLUMN "failureReasonCode" VARCHAR(64),
  ADD COLUMN "failureNote" VARCHAR(500),
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "refundedAt" TIMESTAMP(3),
  ADD COLUMN "refundedBy" TEXT,
  ADD COLUMN "refundReasonCode" VARCHAR(64),
  ADD COLUMN "refundNote" VARCHAR(500),
  ADD COLUMN "refundAmount" INTEGER;

CREATE UNIQUE INDEX "payments_id_orderId_key"
  ON public.payments(id, "orderId");

CREATE TABLE public.payment_status_history (
  id TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "fromStatus" "PaymentStatus",
  "toStatus" "PaymentStatus" NOT NULL,
  "changedById" TEXT,
  "actorNameSnapshot" TEXT,
  source "OrderChangeSource" NOT NULL,
  "reasonCode" VARCHAR(64),
  note VARCHAR(500),
  "orderVersionFrom" INTEGER,
  "orderVersionTo" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_status_history_pkey" PRIMARY KEY (id),
  CONSTRAINT "payment_status_history_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES public.tenants(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payment_status_history_storeId_tenantId_fkey"
    FOREIGN KEY ("storeId", "tenantId") REFERENCES public.stores(id, "tenantId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payment_status_history_orderId_tenantId_storeId_fkey"
    FOREIGN KEY ("orderId", "tenantId", "storeId") REFERENCES public.orders(id, "tenantId", "storeId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payment_status_history_paymentId_orderId_fkey"
    FOREIGN KEY ("paymentId", "orderId") REFERENCES public.payments(id, "orderId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payment_status_history_changedById_fkey"
    FOREIGN KEY ("changedById") REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "payment_status_history_paymentId_createdAt_id_idx"
  ON public.payment_status_history("paymentId", "createdAt", id);
CREATE INDEX "payment_status_history_orderId_createdAt_id_idx"
  ON public.payment_status_history("orderId", "createdAt", id);
CREATE INDEX "payment_status_history_changedById_createdAt_idx"
  ON public.payment_status_history("changedById", "createdAt");
CREATE INDEX "payment_status_history_tenantId_storeId_idx"
  ON public.payment_status_history("tenantId", "storeId");
CREATE UNIQUE INDEX "payment_status_history_paymentId_orderVersionTo_toStatus_key"
  ON public.payment_status_history("paymentId", "orderVersionTo", "toStatus");

CREATE FUNCTION public.populate_legacy_payment_lifecycle_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.status = 'CANCELLED' AND NEW."cancelledAt" IS NULL THEN
    NEW."cancelledAt" := COALESCE(NEW."updatedAt", CURRENT_TIMESTAMP);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.populate_legacy_payment_lifecycle_metadata() FROM PUBLIC;

CREATE TRIGGER "payments_populate_legacy_lifecycle_metadata"
BEFORE UPDATE OF status ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.populate_legacy_payment_lifecycle_metadata();

-- Captura transições feitas pelo Worker anterior durante a janela entre a
-- migration e o deploy. O writer novo antecipa sua linha rica e este trigger
-- não cria uma segunda entrada para a mesma versão.
CREATE FUNCTION public.capture_legacy_payment_status_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_order public.orders%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
    RETURN NULL;
  END IF;

  SELECT * INTO target_order
  FROM public.orders
  WHERE id = NEW."orderId";

  IF target_order.id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.payment_status_history (
    id,
    "tenantId",
    "storeId",
    "orderId",
    "paymentId",
    "fromStatus",
    "toStatus",
    "actorNameSnapshot",
    source,
    note,
    "orderVersionFrom",
    "orderVersionTo",
    "createdAt"
  ) VALUES (
    gen_random_uuid()::text,
    target_order."tenantId",
    target_order."storeId",
    target_order.id,
    NEW.id,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
    NEW.status,
    CASE WHEN TG_OP = 'INSERT' THEN 'Cliente' ELSE 'Sistema legado' END,
    CASE WHEN TG_OP = 'INSERT' THEN 'CUSTOMER'::public."OrderChangeSource" ELSE 'SYSTEM'::public."OrderChangeSource" END,
    CASE
      WHEN TG_OP = 'INSERT' THEN 'Estado financeiro inicial criado durante o checkout.'
      ELSE 'Transição capturada durante a janela de compatibilidade do rollout.'
    END,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE GREATEST(target_order.version - 1, 0) END,
    target_order.version,
    NEW."updatedAt"
  )
  ON CONFLICT ("paymentId", "orderVersionTo", "toStatus") DO NOTHING;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_legacy_payment_status_history() FROM PUBLIC;

CREATE TRIGGER "payments_capture_legacy_status_history"
AFTER INSERT OR UPDATE OF status ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.capture_legacy_payment_status_history();

CREATE FUNCTION public.reject_payment_status_history_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() > 1 THEN
      RETURN OLD;
    END IF;
  ELSIF OLD."changedById" IS DISTINCT FROM NEW."changedById"
    AND pg_trigger_depth() > 1
    AND (to_jsonb(OLD) - 'changedById') = (to_jsonb(NEW) - 'changedById') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'payment_status_history content is immutable'
    USING ERRCODE = '55000';
END;
$$;

REVOKE ALL ON FUNCTION public.reject_payment_status_history_update() FROM PUBLIC;

CREATE TRIGGER "payment_status_history_reject_update"
BEFORE UPDATE OR DELETE ON public.payment_status_history
FOR EACH ROW
EXECUTE FUNCTION public.reject_payment_status_history_update();

ALTER TABLE public.payment_status_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.payment_status_history FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.payment_status_history FROM authenticated;
  END IF;
END $$;

COMMIT;

-- Campos financeiros permanecem nullable para o Worker anterior.
