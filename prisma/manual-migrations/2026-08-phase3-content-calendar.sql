-- ============================================================
-- Phase 3 (Client Content Calendar) — manual migration for production.
-- Idempotent; apply with prisma db push OR paste into SQL editor.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE "ContentStatus" AS ENUM
    ('PLANNED','ASSIGNED','IN_PROGRESS','IN_REVIEW','TEAM_APPROVED','CLIENT_APPROVED','SCHEDULED','POSTED','MISSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "creative_types" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "icon" TEXT,
  "color" TEXT,
  "countsAsShoot" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "creative_types_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "creative_types_organizationId_slug_key" ON "creative_types" ("organizationId","slug");
CREATE INDEX IF NOT EXISTS "creative_types_organizationId_isActive_idx" ON "creative_types" ("organizationId","isActive");
DO $$ BEGIN
  ALTER TABLE "creative_types" ADD CONSTRAINT "creative_types_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "content_items" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "projectId" TEXT,
  "date" TIMESTAMP(3) NOT NULL,
  "creativeTypeId" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "description" TEXT,
  "referenceUrl" TEXT,
  "referenceFileId" TEXT,
  "status" "ContentStatus" NOT NULL DEFAULT 'PLANNED',
  "isExtra" BOOLEAN NOT NULL DEFAULT false,
  "isAdHoc" BOOLEAN NOT NULL DEFAULT false,
  "carriedFromId" TEXT,
  "countAgainstPrevMonth" BOOLEAN NOT NULL DEFAULT false,
  "postedAt" TIMESTAMP(3),
  "teamApprovedAt" TIMESTAMP(3),
  "clientApprovedAt" TIMESTAMP(3),
  "invoicedInId" TEXT,
  "reviewToken" TEXT,
  "reviewTokenExpiresAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "content_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "content_items_reviewToken_key" ON "content_items" ("reviewToken");
CREATE INDEX IF NOT EXISTS "content_items_organizationId_clientId_date_idx" ON "content_items" ("organizationId","clientId","date");
CREATE INDEX IF NOT EXISTS "content_items_clientId_status_idx" ON "content_items" ("clientId","status");
CREATE INDEX IF NOT EXISTS "content_items_organizationId_date_idx" ON "content_items" ("organizationId","date");
DO $$ BEGIN
  ALTER TABLE "content_items" ADD CONSTRAINT "content_items_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "content_items" ADD CONSTRAINT "content_items_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "content_items" ADD CONSTRAINT "content_items_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "content_items" ADD CONSTRAINT "content_items_creativeTypeId_fkey"
    FOREIGN KEY ("creativeTypeId") REFERENCES "creative_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "content_items" ADD CONSTRAINT "content_items_referenceFileId_fkey"
    FOREIGN KEY ("referenceFileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "content_items" ADD CONSTRAINT "content_items_carriedFromId_fkey"
    FOREIGN KEY ("carriedFromId") REFERENCES "content_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "content_items" ADD CONSTRAINT "content_items_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Task.contentItemId becomes a real FK
DO $$ BEGIN
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_contentItemId_fkey"
    FOREIGN KEY ("contentItemId") REFERENCES "content_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
