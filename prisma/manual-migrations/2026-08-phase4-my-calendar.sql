-- ============================================================
-- Phase 4 (My Calendar) — manual migration for production.
-- Idempotent; apply with prisma db push OR paste into SQL editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS "personal_items" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdById" TEXT,
  "title" TEXT NOT NULL,
  "note" TEXT,
  "date" TIMESTAMP(3) NOT NULL,
  "time" TEXT,
  "done" BOOLEAN NOT NULL DEFAULT false,
  "doneAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "personal_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "personal_items_userId_date_idx" ON "personal_items" ("userId","date");
DO $$ BEGIN
  ALTER TABLE "personal_items" ADD CONSTRAINT "personal_items_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "personal_items" ADD CONSTRAINT "personal_items_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
