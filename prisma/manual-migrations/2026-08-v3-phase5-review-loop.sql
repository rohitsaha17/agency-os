-- V3 Phase 5 — submit → review → approve/changes → post.
--
-- Structure (TaskDelivery.revision, the task_reviews table, the
-- ReviewDecision enum) is applied by `prisma db push`. This mirrors it and
-- carries the fold-in of the older ChangeRequest rows.
-- Idempotent — safe to re-run.

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- v2's ChangeRequest could only say "please change this" — it had
-- no way to record an approval, which is why v3 replaces it with
-- TaskReview. Carry the existing rows across as round-1 change
-- requests so no feedback is lost. change_requests stays in place,
-- unused, for one release.
-- ─────────────────────────────────────────────────────────────
INSERT INTO task_reviews ("id", "taskId", "revision", "decision", "comments", "reviewedById", "reviewedAt")
SELECT
  'rev_' || cr.id,
  cr."taskId",
  1,
  'CHANGES_REQUESTED',
  cr.note,
  cr."requestedById",
  cr."createdAt"
FROM change_requests cr
WHERE NOT EXISTS (
  SELECT 1 FROM task_reviews tr WHERE tr.id = 'rev_' || cr.id
);

-- Every existing delivery was a first hand-in.
UPDATE task_deliveries SET revision = 1 WHERE revision IS NULL;

COMMIT;
