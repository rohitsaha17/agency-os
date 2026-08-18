-- ============================================================
-- Phase 6 (Packages & quotas) — manual migration for production.
-- Idempotent; apply with prisma db push OR paste into SQL editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS "client_packages" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startMonth" TIMESTAMP(3) NOT NULL,
  "endMonth" TIMESTAMP(3),
  "billingAmount" DECIMAL(12,2),
  "currency" TEXT,
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_packages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "client_packages_clientId_isActive_idx" ON "client_packages" ("clientId","isActive");
CREATE INDEX IF NOT EXISTS "client_packages_organizationId_idx" ON "client_packages" ("organizationId");
DO $$ BEGIN
  ALTER TABLE "client_packages" ADD CONSTRAINT "client_packages_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "client_packages" ADD CONSTRAINT "client_packages_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "package_quotas" (
  "id" TEXT NOT NULL,
  "packageId" TEXT NOT NULL,
  "creativeTypeId" TEXT NOT NULL,
  "monthlyQty" INTEGER NOT NULL,
  CONSTRAINT "package_quotas_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "package_quotas_packageId_creativeTypeId_key" ON "package_quotas" ("packageId","creativeTypeId");
DO $$ BEGIN
  ALTER TABLE "package_quotas" ADD CONSTRAINT "package_quotas_packageId_fkey"
    FOREIGN KEY ("packageId") REFERENCES "client_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "package_quotas" ADD CONSTRAINT "package_quotas_creativeTypeId_fkey"
    FOREIGN KEY ("creativeTypeId") REFERENCES "creative_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
