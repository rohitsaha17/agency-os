-- Limited-access job titles: shoot crew (photographers, videographers) see a
-- cut-down app — Dashboard, Tasks, My Calendar, Team Calendar, People — and
-- nothing else.
--
-- Run against PRODUCTION before (or with) deploying the code that uses it.
-- Safe to run twice: ADD COLUMN IF NOT EXISTS is a no-op the second time.
--
-- Purely additive. One new boolean column on the job-title table, defaulting to
-- false, so every existing job title is unchanged and the app behaves exactly
-- as before until an admin ticks "Limited access" on a title.
--
-- Plain statement, no DO/$$ block, so the Supabase SQL editor runs it verbatim.
-- Paste it and press the green Run (not the AI / "Fix" button).
--
-- Expect: ALTER TABLE, then a SELECT showing 0 limited titles so far.

ALTER TABLE "designations"
  ADD COLUMN IF NOT EXISTS "limitedAccess" BOOLEAN NOT NULL DEFAULT false;

-- Sanity check: should return 0 — no title is limited until an admin sets it.
SELECT count(*) AS limited_titles FROM "designations" WHERE "limitedAccess" = true;
