-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'CATEGORY_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'CATEGORY_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'CATEGORY_ARCHIVED';
ALTER TYPE "AuditAction" ADD VALUE 'CATEGORY_RESTORED';
ALTER TYPE "AuditAction" ADD VALUE 'PRODUCT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'PRODUCT_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'PRODUCT_ARCHIVED';
ALTER TYPE "AuditAction" ADD VALUE 'PRODUCT_RESTORED';
ALTER TYPE "AuditAction" ADD VALUE 'PRODUCT_DUPLICATED';
ALTER TYPE "AuditAction" ADD VALUE 'PRODUCT_AVAILABILITY_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'PRODUCT_PRICE_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'PRODUCT_IMAGE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'OPTION_GROUP_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'OPTION_GROUP_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'OPTION_GROUP_ARCHIVED';
ALTER TYPE "AuditAction" ADD VALUE 'OPTION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'OPTION_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'OPTION_ARCHIVED';
ALTER TYPE "AuditAction" ADD VALUE 'CATALOG_REORDERED';

-- AlterEnum
ALTER TYPE "StoreAssetType" ADD VALUE 'PRODUCT_IMAGE';

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "archiveReason" TEXT,
ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "archivedById" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "product_option_groups" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "archivedById" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "product_options" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "archivedById" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "archiveReason" TEXT,
ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "archivedById" TEXT,
ADD COLUMN     "imageAssetId" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "catalogVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "categories_tenantId_storeId_archivedAt_sortOrder_idx" ON "categories"("tenantId", "storeId", "archivedAt", "sortOrder");

-- CreateIndex
CREATE INDEX "categories_storeId_isActive_archivedAt_idx" ON "categories"("storeId", "isActive", "archivedAt");

-- CreateIndex
CREATE INDEX "product_option_groups_productId_archivedAt_sortOrder_idx" ON "product_option_groups"("productId", "archivedAt", "sortOrder");

-- CreateIndex
CREATE INDEX "product_options_groupId_archivedAt_sortOrder_idx" ON "product_options"("groupId", "archivedAt", "sortOrder");

-- CreateIndex
CREATE INDEX "products_tenantId_storeId_categoryId_archivedAt_sortOrder_idx" ON "products"("tenantId", "storeId", "categoryId", "archivedAt", "sortOrder");

-- CreateIndex
CREATE INDEX "products_storeId_isAvailable_isSoldOut_archivedAt_idx" ON "products"("storeId", "isAvailable", "isSoldOut", "archivedAt");

-- CreateIndex
CREATE INDEX "products_categoryId_archivedAt_sortOrder_idx" ON "products"("categoryId", "archivedAt", "sortOrder");

-- CreateIndex
CREATE INDEX "products_storeId_updatedAt_idx" ON "products"("storeId", "updatedAt");

-- RenameForeignKey
ALTER TABLE "store_customization_revisions" RENAME CONSTRAINT "store_customization_revisions_customizationId_tenantId_storeId_" TO "store_customization_revisions_customizationId_tenantId_sto_fkey";
