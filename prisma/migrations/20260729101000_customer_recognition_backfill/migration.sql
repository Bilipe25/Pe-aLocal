-- Backfill is intentionally isolated from schema expansion. It refuses to
-- guess ownership or merge ambiguous personal data.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15min';

CREATE FUNCTION public."_normalize_customer_phone"(value TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT CASE
    WHEN length(pg_catalog.regexp_replace(value, '\D', '', 'g')) IN (10, 11)
      THEN '55' || pg_catalog.regexp_replace(value, '\D', '', 'g')
    ELSE pg_catalog.regexp_replace(value, '\D', '', 'g')
  END
$$;

CREATE FUNCTION public."_customer_address_fingerprint"(
  street TEXT,
  number TEXT,
  complement TEXT,
  neighborhood TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT
)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
SET search_path = ''
AS $$
  SELECT pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        pg_catalog.concat_ws(
          pg_catalog.chr(31),
          pg_catalog.regexp_replace(
            pg_catalog.lower(
              pg_catalog.btrim(
                pg_catalog.regexp_replace(normalize(COALESCE(street, ''), NFKD), U&'[\0300-\036f]', '', 'g')
              )
            ),
            '\s+', ' ', 'g'
          ),
          pg_catalog.regexp_replace(
            pg_catalog.lower(
              pg_catalog.btrim(
                pg_catalog.regexp_replace(normalize(COALESCE(number, ''), NFKD), U&'[\0300-\036f]', '', 'g')
              )
            ),
            '\s+', ' ', 'g'
          ),
          pg_catalog.regexp_replace(
            pg_catalog.lower(
              pg_catalog.btrim(
                pg_catalog.regexp_replace(normalize(COALESCE(complement, ''), NFKD), U&'[\0300-\036f]', '', 'g')
              )
            ),
            '\s+', ' ', 'g'
          ),
          pg_catalog.regexp_replace(
            pg_catalog.lower(
              pg_catalog.btrim(
                pg_catalog.regexp_replace(normalize(COALESCE(neighborhood, ''), NFKD), U&'[\0300-\036f]', '', 'g')
              )
            ),
            '\s+', ' ', 'g'
          ),
          pg_catalog.regexp_replace(
            pg_catalog.lower(
              pg_catalog.btrim(
                pg_catalog.regexp_replace(normalize(COALESCE(city, ''), NFKD), U&'[\0300-\036f]', '', 'g')
              )
            ),
            '\s+', ' ', 'g'
          ),
          pg_catalog.regexp_replace(
            pg_catalog.lower(
              pg_catalog.btrim(
                pg_catalog.regexp_replace(normalize(COALESCE(state, ''), NFKD), U&'[\0300-\036f]', '', 'g')
              )
            ),
            '\s+', ' ', 'g'
          ),
          pg_catalog.regexp_replace(COALESCE(zip_code, ''), '\D', '', 'g')
        ),
        'UTF8'
      )
    ),
    'hex'
  )
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."customers" customer
    WHERE public."_normalize_customer_phone"(customer."phone")
      !~ '^55[1-9]{2}[2-9][0-9]{7,8}$'
  ) THEN
    RAISE EXCEPTION
      'Customer recognition backfill blocked: invalid legacy phone exists'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."customers" customer
    GROUP BY customer."tenantId", public."_normalize_customer_phone"(customer."phone")
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Customer recognition backfill blocked: normalized phone duplicates exist inside a tenant'
      USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."customer_addresses" address
    GROUP BY
      address."customerId",
      public."_customer_address_fingerprint"(
        address."street",
        address."number",
        address."complement",
        address."neighborhood",
        address."city",
        address."state",
        address."zipCode"
      )
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Customer recognition backfill blocked: duplicate legacy customer addresses exist'
      USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."customer_addresses" address
    WHERE address."isDefault"
    GROUP BY address."customerId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Customer recognition backfill blocked: multiple default addresses exist for a customer'
      USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."orders" orders
    JOIN public."customers" customer ON customer."id" = orders."customerId"
    WHERE orders."tenantId" <> customer."tenantId"
  ) THEN
    RAISE EXCEPTION
      'Customer recognition backfill blocked: an order references a customer from another tenant'
      USING ERRCODE = '23514';
  END IF;
END $$;

UPDATE "customers" customer
SET
  "phoneNormalized" = public."_normalize_customer_phone"(customer."phone"),
  "recognitionEnabled" = true;

UPDATE "customers" customer
SET "lastOrderAt" = latest."lastOrderAt"
FROM (
  SELECT orders."customerId", MAX(orders."createdAt") AS "lastOrderAt"
  FROM "orders" orders
  WHERE orders."customerId" IS NOT NULL
  GROUP BY orders."customerId"
) latest
WHERE customer."id" = latest."customerId";

UPDATE "customer_addresses" address
SET
  "tenantId" = customer."tenantId",
  "addressFingerprint" = public."_customer_address_fingerprint"(
    address."street",
    address."number",
    address."complement",
    address."neighborhood",
    address."city",
    address."state",
    address."zipCode"
  ),
  "updatedAt" = address."createdAt"
FROM "customers" customer
WHERE customer."id" = address."customerId";

DROP FUNCTION public."_customer_address_fingerprint"(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION public."_normalize_customer_phone"(TEXT);

COMMIT;
