-- Approved leave becomes a real block on the diary.
--
-- Run against PRODUCTION, in the Supabase SQL editor. Paste the whole file.
-- Safe to run twice: every statement is guarded.
--
-- PURELY ADDITIVE. One nullable column, one index, one foreign key. No data
-- is read, moved or deleted, and nothing existing changes shape — so the
-- currently-deployed app keeps working either side of it.
--
-- WHY THIS COLUMN EXISTS
--
-- Two tables already meant "this person cannot work that day":
--
--   unavailability   the shoot crew blocking their own diary. Already
--                    enforced — assigning a task on a blocked day is refused
--                    with a 409 — and already shown in the assignee picker.
--   leave_requests   applied for, approved by an admin, and enforced NOWHERE.
--
-- So the route with no approval had all the teeth, and the route with
-- approval changed a status field and nothing else: leave could be approved
-- and the person stayed bookable, with nothing anywhere saying they were off.
--
-- Rather than teaching the assignment guard, the picker and the calendar to
-- each check a second table — three new checks, and a tax on every feature
-- built afterwards — approving leave now writes its days into
-- `unavailability`. Everything downstream already reads that table, so it all
-- works without being told anything new.
--
-- `leaveRequestId` is what makes that reversible. Revoking an approved leave
-- deletes exactly the days that leave created, and never a day a photographer
-- blocked for a shoot of their own. Without the link, undoing an approval
-- would mean guessing which rows to remove.
--
-- ON DELETE CASCADE: if a leave request is ever deleted outright, the days it
-- blocked go with it. A block pointing at a request that no longer exists
-- would keep somebody off work with no way left to find out why.
--
-- Nothing is backfilled. Leave approved before this runs blocked no days at
-- the time and will not retroactively start: re-approving is not a thing, and
-- inventing blocks for trips that may already have happened would be worse
-- than leaving history as it was. New approvals block from here on.
--
-- Expect: 1 column, 1 index, 1 foreign key, then a final row reading 0.

BEGIN;

ALTER TABLE "unavailability" ADD COLUMN IF NOT EXISTS "leaveRequestId" TEXT;

CREATE INDEX IF NOT EXISTS "unavailability_leaveRequestId_idx"
  ON "unavailability" ("leaveRequestId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unavailability_leaveRequestId_fkey') THEN
    ALTER TABLE "unavailability" ADD CONSTRAINT "unavailability_leaveRequestId_fkey"
      FOREIGN KEY ("leaveRequestId") REFERENCES "leave_requests"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

COMMIT;

-- Check it landed. Expect one row: the column exists, and no day is yet
-- attributed to a leave request.
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name = 'unavailability' AND column_name = 'leaveRequestId') AS column_added,
  (SELECT count(*) FROM "unavailability" WHERE "leaveRequestId" IS NOT NULL) AS days_from_leave;
