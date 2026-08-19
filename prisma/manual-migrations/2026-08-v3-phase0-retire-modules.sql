-- V3 Phase 0 — retire Quotations, Rate Cards, Stakeholders and Bookings.
--
-- The checked-in prisma/migrations history can't be replayed (see
-- docs/V3_CONTEXT.md "Naming corrections"), so schema changes are applied with
-- `prisma db push` and mirrored here as an idempotent script that can be run
-- against any environment. Safe to re-run.
--
-- Rows were exported to backups/retired-modules-<date>.json first
-- (scripts/export-retired-modules.ts).

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. Contract parties keep their meaning WITHOUT the Stakeholder
--    model: copy the stakeholder's name/email onto the party row
--    itself before the link disappears. Runs before any drop.
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'contract_parties' AND column_name = 'stakeholderId')
     AND EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_name = 'stakeholders') THEN
    UPDATE contract_parties cp
       SET name  = COALESCE(NULLIF(cp.name, ''), s.name),
           email = COALESCE(cp.email, s.email)
      FROM stakeholders s
     WHERE cp."stakeholderId" = s.id;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 2. Drop the foreign-key columns that point at retired models.
--    Existing invoices, expenses and contracts keep every other
--    field, so they still open and render.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE projects         DROP COLUMN IF EXISTS "quotationId";
ALTER TABLE invoices         DROP COLUMN IF EXISTS "quotationId";
ALTER TABLE expenses         DROP COLUMN IF EXISTS "stakeholderId";
ALTER TABLE contract_parties DROP COLUMN IF EXISTS "stakeholderId";

-- ─────────────────────────────────────────────────────────────
-- 3. Drop the tables. Order matters: children before parents.
-- ─────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS quotation_line_items;
DROP TABLE IF EXISTS quotations;
DROP TABLE IF EXISTS rate_cards;
DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS stakeholders;

-- ─────────────────────────────────────────────────────────────
-- 4. Drop the enums that no surviving column uses.
--    ContractPartyType keeps its STAKEHOLDER value — an external
--    party is now just a name/email on the contract_parties row.
-- ─────────────────────────────────────────────────────────────
DROP TYPE IF EXISTS "QuotationStatus";
DROP TYPE IF EXISTS "StakeholderType";
DROP TYPE IF EXISTS "StakeholderRole";
DROP TYPE IF EXISTS "BookingStatus";

COMMIT;
