-- ============================================================
-- Phase 1 (v2 foundations) — manual migration for production.
-- Safe to run more than once: every statement is idempotent.
--
-- Adds: Client.currency / Client.importance, User.designation,
--       status_history (universal audit), notifications (in-app).
-- Apply with:  export DATABASE_URL=... && npx prisma db push
-- OR paste this file into the Supabase SQL Editor and run it.
-- ============================================================

-- 1. Enums ---------------------------------------------------
DO $$ BEGIN
  CREATE TYPE "ClientImportance" AS ENUM ('NORMAL', 'IMPORTANT', 'VIP');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "Designation" AS ENUM
    ('SMM', 'DESIGNER', 'EDITOR', 'HEAD_OF_DESIGN', 'PHOTOGRAPHER', 'SME', 'POC', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. New columns ---------------------------------------------
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "currency" TEXT;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "importance" "ClientImportance" NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "users"   ADD COLUMN IF NOT EXISTS "designation" "Designation";

-- 3. Status history ------------------------------------------
CREATE TABLE IF NOT EXISTS "status_history" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "entityType"     TEXT NOT NULL,
  "entityId"       TEXT NOT NULL,
  "fromStatus"     TEXT,
  "toStatus"       TEXT NOT NULL,
  "changedById"    TEXT,
  "changedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note"           TEXT,
  CONSTRAINT "status_history_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "status_history_entityType_entityId_idx" ON "status_history" ("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "status_history_organizationId_idx" ON "status_history" ("organizationId");

DO $$ BEGIN
  ALTER TABLE "status_history"
    ADD CONSTRAINT "status_history_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "status_history"
    ADD CONSTRAINT "status_history_changedById_fkey"
    FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. Notifications -------------------------------------------
CREATE TABLE IF NOT EXISTS "notifications" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "type"           TEXT NOT NULL,
  "title"          TEXT NOT NULL,
  "body"           TEXT,
  "link"           TEXT,
  "readAt"         TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "notifications_userId_readAt_idx" ON "notifications" ("userId", "readAt");
CREATE INDEX IF NOT EXISTS "notifications_userId_createdAt_idx" ON "notifications" ("userId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
