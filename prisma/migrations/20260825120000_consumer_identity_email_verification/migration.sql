-- Add verified email credentials and PedidoLocal-owned email OTPs without
-- removing legacy phone identities or Bird challenges.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE "consumer_identities"
  ALTER COLUMN "phoneNormalized" DROP NOT NULL,
  ALTER COLUMN "phoneVerifiedAt" DROP NOT NULL,
  ADD COLUMN "emailNormalized" VARCHAR(254),
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

ALTER TABLE "consumer_identities"
  DROP CONSTRAINT "consumer_identities_phone_format_check",
  ADD CONSTRAINT "consumer_identities_phone_format_check" CHECK (
    "phoneNormalized" IS NULL OR "phoneNormalized" ~ '^55[0-9]{10,11}$'
  ),
  ADD CONSTRAINT "consumer_identities_credential_shape_check" CHECK (
    (("phoneNormalized" IS NULL) = ("phoneVerifiedAt" IS NULL))
    AND (("emailNormalized" IS NULL) = ("emailVerifiedAt" IS NULL))
    AND ("phoneNormalized" IS NOT NULL OR "emailNormalized" IS NOT NULL)
  ),
  ADD CONSTRAINT "consumer_identities_email_normalized_check" CHECK (
    "emailNormalized" IS NULL
    OR (
      "emailNormalized" = lower("emailNormalized")
      AND octet_length("emailNormalized") <= 254
      AND "emailNormalized" ~ '^[!-~]+@[!-~]+$'
    )
  );

CREATE UNIQUE INDEX "consumer_identities_emailNormalized_key"
  ON "consumer_identities"("emailNormalized");
CREATE INDEX "consumer_identities_emailVerifiedAt_idx"
  ON "consumer_identities"("emailVerifiedAt");

ALTER TABLE "consumer_verification_challenges"
  ALTER COLUMN "phoneNormalized" DROP NOT NULL,
  ADD COLUMN "emailNormalized" VARCHAR(254),
  ADD COLUMN "otpHash" CHAR(64);

ALTER TABLE "consumer_verification_challenges"
  DROP CONSTRAINT "consumer_verification_challenges_phone_check",
  ADD CONSTRAINT "consumer_verification_challenges_phone_check" CHECK (
    "phoneNormalized" IS NULL OR "phoneNormalized" ~ '^55[0-9]{10,11}$'
  ),
  ADD CONSTRAINT "consumer_verification_challenges_email_check" CHECK (
    "emailNormalized" IS NULL
    OR (
      "emailNormalized" = lower("emailNormalized")
      AND octet_length("emailNormalized") <= 254
      AND "emailNormalized" ~ '^[!-~]+@[!-~]+$'
    )
  ),
  ADD CONSTRAINT "consumer_verification_challenges_otp_hash_check" CHECK (
    "otpHash" IS NULL OR "otpHash" ~ '^[a-f0-9]{64}$'
  ),
  ADD CONSTRAINT "consumer_verification_challenges_provider_shape_check" CHECK (
    (
      "provider" = 'bird'
      AND "phoneNormalized" IS NOT NULL
      AND "emailNormalized" IS NULL
      AND "otpHash" IS NULL
    )
    OR (
      "provider" IN ('resend', 'development')
      AND "emailNormalized" IS NOT NULL
      AND "otpHash" IS NOT NULL
    )
    OR (
      -- Compatibility for already-expired development challenges created by V1.
      "provider" = 'development'
      AND "phoneNormalized" IS NOT NULL
      AND "emailNormalized" IS NULL
      AND "otpHash" IS NULL
    )
  );

CREATE INDEX "consumer_verification_challenges_scope_email_idx"
  ON "consumer_verification_challenges"("tenantId", "storeId", "emailNormalized", "createdAt");

COMMIT;
