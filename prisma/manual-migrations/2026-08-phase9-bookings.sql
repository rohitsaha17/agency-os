-- ============================================================
-- Phase 9 (Photographer bookings) — manual migration for production.
-- Idempotent; apply with prisma db push OR paste into SQL editor.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE "BookingStatus" AS ENUM ('REQUESTED','CONFIRMED','COMPLETED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "bookings" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "photographerId" TEXT NOT NULL,
  "clientId" TEXT,
  "projectId" TEXT,
  "contentItemId" TEXT,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "location" TEXT,
  "notes" TEXT,
  "status" "BookingStatus" NOT NULL DEFAULT 'REQUESTED',
  "isAdHoc" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "bookings_organizationId_startAt_idx" ON "bookings" ("organizationId","startAt");
CREATE INDEX IF NOT EXISTS "bookings_photographerId_startAt_idx" ON "bookings" ("photographerId","startAt");
DO $$ BEGIN
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_photographerId_fkey"
    FOREIGN KEY ("photographerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_contentItemId_fkey"
    FOREIGN KEY ("contentItemId") REFERENCES "content_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
