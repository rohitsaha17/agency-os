-- V3 Phase 7 — invoicing from closed cycles.
--
-- Structure (InvoiceLineItem.billableItemId, and COMPLIMENTARY / ADHOC_TASK
-- added to LineItemKind) is applied by `prisma db push`. This mirrors it.
-- Idempotent — safe to re-run.
--
-- Existing invoices are untouched: their lines keep kind CUSTOM/PACKAGE/EXTRA
-- and a null billableItemId, which is exactly right — they predate the
-- billing bridge and were never built from one.

BEGIN;

-- v2 marked complimentary lines with isFree and a zero price. v3 gives them
-- their own kind so the PDF can section them under "Complimentary" and show
-- the token amount rather than a silent zero. Only touches lines that are
-- unmistakably complimentary: free, but not a deliberate zero-rated custom
-- line the user typed themselves.
UPDATE invoice_line_items
   SET kind = 'COMPLIMENTARY'
 WHERE "isFree" = TRUE
   AND kind = 'EXTRA';

COMMIT;
