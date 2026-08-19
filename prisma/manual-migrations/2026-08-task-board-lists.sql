-- ============================================================
-- Task board lists (Google-Tasks-style /tasks page) — production mirror.
-- Idempotent; apply with prisma db push OR paste into SQL editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS "task_lists" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_lists_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "task_lists_userId_sortOrder_idx" ON "task_lists" ("userId","sortOrder");
DO $$ BEGIN
  ALTER TABLE "task_lists" ADD CONSTRAINT "task_lists_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "personal_items" ADD COLUMN IF NOT EXISTS "listId" TEXT;
ALTER TABLE "personal_items" ADD COLUMN IF NOT EXISTS "starred" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "personal_items_userId_listId_idx" ON "personal_items" ("userId","listId");
DO $$ BEGIN
  ALTER TABLE "personal_items" ADD CONSTRAINT "personal_items_listId_fkey"
    FOREIGN KEY ("listId") REFERENCES "task_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
