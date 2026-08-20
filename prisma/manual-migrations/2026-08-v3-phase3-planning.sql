-- V3 Phase 3 — the SMM planning surface.
--
-- Structure (ContentItem.cycleId/billingIntent/carryMode/submittedAt/
-- approvedAt, the BillingIntent and CarryMode enums, and the SUBMITTED /
-- APPROVED / CHANGES_REQUESTED / CARRIED_FORWARD content statuses) is
-- applied by `prisma db push`. This mirrors it and carries the backfill.
-- Idempotent — safe to re-run.

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- Items already flagged as extras under v2 carry that meaning
-- forward, so cycle close (Phase 6) sees them as billable rather
-- than silently folding them into the package.
-- ─────────────────────────────────────────────────────────────
UPDATE content_items
   SET "billingIntent" = 'EXTRA_BILLABLE'
 WHERE "isExtra" = TRUE
   AND "billingIntent" = 'INCLUDED';

-- ─────────────────────────────────────────────────────────────
-- Attach existing project-linked items to the cycle their date
-- falls in. Items planned against a client but no project keep a
-- null cycleId and still render — the client roll-up reads them
-- by date, not by cycle.
-- ─────────────────────────────────────────────────────────────
UPDATE content_items ci
   SET "cycleId" = pc.id
  FROM project_cycles pc
 WHERE ci."cycleId" IS NULL
   AND ci."projectId" = pc."projectId"
   AND ci.date >= pc."startDate"
   AND ci.date <= pc."endDate";

COMMIT;
