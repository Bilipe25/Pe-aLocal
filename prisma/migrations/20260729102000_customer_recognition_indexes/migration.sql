-- PostgreSQL requires concurrent index builds to remain outside a transaction.
-- If one statement fails, inspect pg_index before resolving this migration.

CREATE UNIQUE INDEX CONCURRENTLY "customers_id_tenantId_key"
  ON "customers"("id", "tenantId");

CREATE UNIQUE INDEX CONCURRENTLY "customers_tenantId_phoneNormalized_key"
  ON "customers"("tenantId", "phoneNormalized");

CREATE UNIQUE INDEX CONCURRENTLY "customer_addresses_id_tenantId_key"
  ON "customer_addresses"("id", "tenantId");

CREATE UNIQUE INDEX CONCURRENTLY "customer_addresses_customerId_addressFingerprint_key"
  ON "customer_addresses"("customerId", "addressFingerprint");

CREATE UNIQUE INDEX CONCURRENTLY "customer_addresses_one_default_per_customer_key"
  ON "customer_addresses"("customerId")
  WHERE "isDefault";

CREATE INDEX CONCURRENTLY "customer_addresses_tenantId_idx"
  ON "customer_addresses"("tenantId");
