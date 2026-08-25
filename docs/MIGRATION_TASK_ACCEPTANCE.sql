-- Task acceptance: assignees accept work, or decline it with a reason.
--
-- Run this against PRODUCTION before deploying the code that uses it.
-- Safe to run twice: every statement is guarded.
--
-- WHY THE BACKFILL MATTERS
--
-- The new column defaults to PENDING, which is right for assignments made
-- from now on. Applied to rows that already exist, it would mean every task
-- currently being worked on across all ten agencies simultaneously asks its
-- assignee to accept work they started days ago — and until they did, the
-- banner would sit on top of every task in the app.
--
-- So existing rows are set to ACCEPTED in the same transaction that adds the
-- column. Work already under way has, in the only sense that matters, been
-- accepted.
--
-- Expect: ALTER TABLE, then an UPDATE whose row count equals the number of
-- existing assignments. A count of 0 means the table was empty, which is only
-- plausible on a brand-new database.

BEGIN;

-- 1. The enum. CREATE TYPE has no IF NOT EXISTS, so it is guarded by hand.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AssignmentAcceptance') THEN
    CREATE TYPE "AssignmentAcceptance" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');
  END IF;
END
$$;

-- 2. The columns.
ALTER TABLE "task_assignees"
  ADD COLUMN IF NOT EXISTS "acceptance"    "AssignmentAcceptance" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "respondedAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "declineReason" TEXT,
  ADD COLUMN IF NOT EXISTS "assignedById"  TEXT;

-- 3. Everything that existed before this feature is already under way.
--    Scoped to rows that have never been answered, so re-running cannot
--    overwrite a real decline somebody has since made.
UPDATE "task_assignees"
   SET "acceptance" = 'ACCEPTED'
 WHERE "acceptance" = 'PENDING'
   AND "respondedAt" IS NULL;

-- 4. Who assigned it. ON DELETE SET NULL: losing the assigner's account must
--    never take the assignment with it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'task_assignees_assignedById_fkey'
  ) THEN
    ALTER TABLE "task_assignees"
      ADD CONSTRAINT "task_assignees_assignedById_fkey"
      FOREIGN KEY ("assignedById") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- 5. The index behind "what am I waiting to answer".
CREATE INDEX IF NOT EXISTS "task_assignees_userId_acceptance_idx"
  ON "task_assignees" ("userId", "acceptance");

COMMIT;

-- Check it landed. Expect every existing row ACCEPTED and none PENDING.
SELECT "acceptance", count(*) AS rows
  FROM "task_assignees"
 GROUP BY "acceptance"
 ORDER BY "acceptance";
