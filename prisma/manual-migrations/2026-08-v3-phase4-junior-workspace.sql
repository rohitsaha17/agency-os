-- V3 Phase 4 — the junior's workspace.
--
-- Structure (Task.kind/revision/approverId/submittedAt/approvedAt/cycleId and
-- the CHANGES_REQUESTED task status) is applied by `prisma db push`. This
-- mirrors it and carries the data movement.
-- Idempotent — safe to re-run.

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. Custom task lists are retired: v3 has My List plus one
--    automatic list per project. Fold every personal item that
--    lived in a custom list back into My List so nothing is lost
--    (the list rows themselves stay for one release, unused).
-- ─────────────────────────────────────────────────────────────
UPDATE personal_items
   SET "listId" = NULL
 WHERE "listId" IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 2. Tasks that already point at a content item are content work
--    by definition, so they read correctly in the new lists.
-- ─────────────────────────────────────────────────────────────
UPDATE tasks
   SET kind = 'CONTENT_WORK'
 WHERE kind = 'GENERAL'
   AND "contentItemId" IS NOT NULL
   AND "deletedAt" IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 3. Attach existing project tasks to the cycle their due date
--    falls in, so Phase 6's cycle close sees them.
-- ─────────────────────────────────────────────────────────────
UPDATE tasks t
   SET "cycleId" = pc.id
  FROM project_cycles pc
 WHERE t."cycleId" IS NULL
   AND t."projectId" = pc."projectId"
   AND t."dueDate" IS NOT NULL
   AND t."dueDate" >= pc."startDate"
   AND t."dueDate" <= pc."endDate";

COMMIT;
