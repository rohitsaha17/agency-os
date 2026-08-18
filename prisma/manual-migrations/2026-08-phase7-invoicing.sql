-- ============================================================
-- Phase 7 (Invoicing from packages) — manual migration for production.
-- Idempotent; apply with prisma db push OR paste into SQL editor.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE "LineItemKind" AS ENUM ('PACKAGE','EXTRA','CUSTOM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "invoice_line_items" ADD COLUMN IF NOT EXISTS "kind" "LineItemKind" NOT NULL DEFAULT 'CUSTOM';
ALTER TABLE "invoice_line_items" ADD COLUMN IF NOT EXISTS "isFree" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "invoice_line_items" ADD COLUMN IF NOT EXISTS "contentItemId" TEXT;

DO $$ BEGIN
  ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_contentItemId_fkey"
    FOREIGN KEY ("contentItemId") REFERENCES "content_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
