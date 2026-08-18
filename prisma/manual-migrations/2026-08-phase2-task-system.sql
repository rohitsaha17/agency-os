-- ============================================================
-- Phase 2 (Task System 2.0) — manual migration for production.
-- Idempotent; apply with prisma db push OR paste into SQL editor.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE "AssignmentStatus" AS ENUM ('NONE','PENDING_HEAD_APPROVAL','APPROVED','REASSIGNED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "DeliveryMethod" AS ENUM ('FILE_UPLOAD','LINK','WHATSAPP','SLACK','OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "ChangeRequestStatus" AS ENUM ('OPEN','RESOLVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Task: loosen projectId + new columns
ALTER TABLE "tasks" ALTER COLUMN "projectId" DROP NOT NULL;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "topic" TEXT;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "content" TEXT;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "referenceUrl" TEXT;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "referenceFileId" TEXT;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "extraNote" TEXT;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "clientId" TEXT;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "contentItemId" TEXT;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "preferredAssigneeId" TEXT;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "assignmentStatus" "AssignmentStatus" NOT NULL DEFAULT 'NONE';
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "isAdHoc" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "tasks_clientId_idx" ON "tasks" ("clientId");
CREATE INDEX IF NOT EXISTS "tasks_contentItemId_idx" ON "tasks" ("contentItemId");
CREATE INDEX IF NOT EXISTS "tasks_organizationId_assignmentStatus_idx" ON "tasks" ("organizationId","assignmentStatus");

DO $$ BEGIN
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_referenceFileId_fkey"
    FOREIGN KEY ("referenceFileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_preferredAssigneeId_fkey"
    FOREIGN KEY ("preferredAssigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Delivery proof
CREATE TABLE IF NOT EXISTS "task_deliveries" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "method" "DeliveryMethod" NOT NULL,
  "fileId" TEXT,
  "url" TEXT,
  "note" TEXT,
  "deliveredById" TEXT,
  "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_deliveries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "task_deliveries_taskId_idx" ON "task_deliveries" ("taskId");
DO $$ BEGIN
  ALTER TABLE "task_deliveries" ADD CONSTRAINT "task_deliveries_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "task_deliveries" ADD CONSTRAINT "task_deliveries_fileId_fkey"
    FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "task_deliveries" ADD CONSTRAINT "task_deliveries_deliveredById_fkey"
    FOREIGN KEY ("deliveredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Change requests
CREATE TABLE IF NOT EXISTS "change_requests" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "requestedById" TEXT,
  "note" TEXT NOT NULL,
  "status" "ChangeRequestStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "change_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "change_requests_taskId_status_idx" ON "change_requests" ("taskId","status");
DO $$ BEGIN
  ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_requestedById_fkey"
    FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
