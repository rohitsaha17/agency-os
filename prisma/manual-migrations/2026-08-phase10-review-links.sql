-- ============================================================
-- Phase 10 (Client review links) — manual migration for production.
-- Idempotent; apply with prisma db push OR paste into SQL editor.
-- (ContentItem.reviewToken / reviewTokenExpiresAt shipped in Phase 3.)
-- ============================================================

CREATE TABLE IF NOT EXISTS "review_batches" (
  "id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "review_batches_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "review_batches_token_key" ON "review_batches" ("token");
CREATE INDEX IF NOT EXISTS "review_batches_clientId_idx" ON "review_batches" ("clientId");
DO $$ BEGIN
  ALTER TABLE "review_batches" ADD CONSTRAINT "review_batches_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "review_batches" ADD CONSTRAINT "review_batches_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "review_batches" ADD CONSTRAINT "review_batches_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
