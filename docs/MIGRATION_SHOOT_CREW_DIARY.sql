-- Only the shoot crew block their own days.
--
-- Run against PRODUCTION, in the Supabase SQL editor. Paste the whole file.
-- Safe to run twice.
--
-- ONE COLUMN, plus a backfill you should check afterwards.
--
-- WHY
--
-- Blocking your own days used to be open to everyone, with "LEAVE" among the
-- reasons on offer. That made leave approval optional: an editor could block
-- a day instantly, and the route that needed an admin's approval was the slow
-- one nobody had to use.
--
-- Now only jobs marked `blocksOwnDays` manage their own diary. Photographers
-- and videographers get booked on shoots by other people and by other
-- agencies, so waiting on an approval would lose them the booking. Everybody
-- else takes time off through leave, and an approved leave blocks the days
-- for them automatically.
--
-- A flag per job title rather than a hardcoded "photographer", because job
-- titles are rows an agency creates: one calls them DOP, another Camera,
-- another Shoot Crew.
--
-- THE BACKFILL IS A GUESS, AND YOU SHOULD CHECK IT
--
-- The column defaults to false. Left at that, every photographer already on
-- the books would silently lose the ability to block their own days the
-- moment this deploys — so the statement below turns it on for job titles
-- whose name or slug looks like shoot crew.
--
-- It is pattern matching on names people typed, so it will miss anything
-- called something unexpected. It already excludes the obvious trap — a
-- "Video Editor" matches "video" but cuts the footage rather than going and
-- getting it — and there will be others it gets wrong.
--
-- The final SELECT prints exactly what it decided. Read it, then fix any of
-- it in Settings ▸ Job titles, where each title now has an "Own diary" /
-- "Leave only" toggle.
--
-- Nothing else changes. Days already blocked stay blocked whoever created
-- them; this only decides who may create new ones from here.

BEGIN;

ALTER TABLE "designations"
  ADD COLUMN IF NOT EXISTS "blocksOwnDays" BOOLEAN NOT NULL DEFAULT false;

-- Shoot crew, as far as their job title can tell. Deliberately only sets
-- true — it never turns the flag off, so re-running cannot undo a choice
-- somebody has since made in Settings.
UPDATE "designations"
SET "blocksOwnDays" = true
WHERE "blocksOwnDays" = false
  AND (
       lower("name") ~ '(photo|video|cinemat|camera|\mdop\M|shoot|videograph)'
    OR lower("slug") ~ '(photo|video|cinemat|camera|dop|shoot|videograph)'
  )
  -- A Video Editor matches "video" and is not shoot crew: they cut the
  -- footage, they do not go and get it. Same for a Photo Retoucher.
  AND lower("name") !~ '(editor|retouch|post[- ]?production)'
  AND lower("slug") !~ '(editor|retouch|post)';

COMMIT;

-- Read this before you close the tab. Anything in the wrong column is one
-- click to fix in Settings ▸ Job titles.
SELECT
  "name"                                           AS job_title,
  CASE WHEN "blocksOwnDays" THEN 'own diary'
       ELSE 'leave only' END                       AS diary,
  (SELECT count(*) FROM "users" u
    WHERE u."designationId" = d."id" AND u."isActive") AS people
FROM "designations" d
WHERE d."isActive"
ORDER BY d."blocksOwnDays" DESC, d."name";
