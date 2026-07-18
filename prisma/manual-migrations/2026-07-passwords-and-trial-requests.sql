-- ============================================================
-- Manual migration for the production (Supabase) database.
-- Safe to run more than once — every statement is idempotent.
--
-- Apply it either with:
--   export DATABASE_URL="<supabase session-pooler URL, port 5432>"
--   npx prisma db push
-- OR paste this whole file into the Supabase SQL Editor and run it.
--
-- This brings production in line with the schema after adding password
-- login, the free-trial request form, and per-organization document
-- numbering. Without it, User creates/reads fail with Prisma P2022
-- ("column does not exist").
-- ============================================================

-- 1. Password login columns on users -------------------------
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordHash"  TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordSetAt" TIMESTAMP(3);

-- 2. Free-trial requests -------------------------------------
DO $$ BEGIN
  CREATE TYPE "TrialRequestStatus" AS ENUM ('NEW', 'CONTACTED', 'CONVERTED', 'DECLINED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "trial_requests" (
  "id"          TEXT NOT NULL,
  "agencyName"  TEXT NOT NULL,
  "contactName" TEXT NOT NULL,
  "email"       TEXT NOT NULL,
  "phone"       TEXT,
  "location"    TEXT,
  "website"     TEXT,
  "teamSize"    TEXT,
  "services"    TEXT,
  "message"     TEXT,
  "status"      "TrialRequestStatus" NOT NULL DEFAULT 'NEW',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "trial_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "trial_requests_status_idx" ON "trial_requests" ("status");

-- 3. Per-organization document numbering ---------------------
-- Drop the old GLOBAL unique on quotation.number / invoice.invoiceNumber
-- and replace with a per-organization composite unique.
ALTER TABLE "quotations" DROP CONSTRAINT IF EXISTS "quotations_number_key";
DROP INDEX IF EXISTS "quotations_number_key";
CREATE UNIQUE INDEX IF NOT EXISTS "quotations_organizationId_number_key"
  ON "quotations" ("organizationId", "number");

ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_invoiceNumber_key";
DROP INDEX IF EXISTS "invoices_invoiceNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_organizationId_invoiceNumber_key"
  ON "invoices" ("organizationId", "invoiceNumber");
