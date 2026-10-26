-- Shoots: named, timed outings (a photo/video shoot) a team member goes on,
-- for a window of a day, usually with one or more colleagues.
--
-- Run against PRODUCTION before deploying the code that uses it.
-- Safe to run twice: every statement is guarded with IF NOT EXISTS.
--
-- Purely additive. Two new tables; nothing existing is altered, so the
-- currently-deployed app keeps working either side of it. There is no backfill
-- to do — an empty table is the correct starting state.
--
-- WHY NO "DO $$ ... $$" BLOCKS: the Supabase SQL editor rewrites PL/pgSQL
-- blocks (it injects RLS statements into them) and that breaks the dollar
-- quoting. So this file is plain statements only. Foreign keys are declared
-- INLINE in CREATE TABLE rather than as a later ALTER TABLE ADD CONSTRAINT
-- (which has no IF NOT EXISTS), so the whole file is idempotent without a
-- single procedural block.
--
-- HOW TO RUN: paste the whole file into the Supabase SQL editor and press the
-- green Run. Do NOT use the editor's AI / "Fix" button.
--
-- Expect: two CREATE TABLE, three CREATE INDEX, and a final SELECT returning 0.

BEGIN;

-- 1. The shoot itself.
--
--    date        is a day key (midnight UTC), the same convention the rest of
--                availability uses, so "the 4th" is the 4th in the agency's
--                calendar whatever timezone the server runs in.
--    startMinute / endMinute are MINUTES from local midnight (0..1439). Stored
--                as plain integers, not timestamps, so a wall-clock window does
--                not drift across a UTC boundary.
CREATE TABLE IF NOT EXISTS "shoots" (
  "id"             TEXT        NOT NULL,
  "organizationId" TEXT        NOT NULL,
  "title"          TEXT        NOT NULL,
  "date"           TIMESTAMP(3) NOT NULL,
  "startMinute"    INTEGER     NOT NULL,
  "endMinute"      INTEGER     NOT NULL,
  "location"       TEXT,
  "createdById"    TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shoots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shoots_organizationId_fkey" FOREIGN KEY ("organizationId")
    REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "shoots_createdById_fkey" FOREIGN KEY ("createdById")
    REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- 2. Who is on a shoot. Many people to one shoot; a person on many shoots.
CREATE TABLE IF NOT EXISTS "shoot_participants" (
  "id"      TEXT NOT NULL,
  "shootId" TEXT NOT NULL,
  "userId"  TEXT NOT NULL,
  CONSTRAINT "shoot_participants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shoot_participants_shootId_fkey" FOREIGN KEY ("shootId")
    REFERENCES "shoots" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "shoot_participants_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 3. Indexes.
--    "is this person on a shoot on this day" is asked on every assignment, so
--    the org+date index makes that a lookup. The unique index stops the same
--    person being added to one shoot twice.
CREATE INDEX IF NOT EXISTS "shoots_organizationId_date_idx"
  ON "shoots" ("organizationId", "date");
CREATE UNIQUE INDEX IF NOT EXISTS "shoot_participants_shootId_userId_key"
  ON "shoot_participants" ("shootId", "userId");
CREATE INDEX IF NOT EXISTS "shoot_participants_userId_idx"
  ON "shoot_participants" ("userId");

COMMIT;

-- Sanity check: should return 0 — nobody has booked a shoot yet.
SELECT count(*) AS shoots_so_far FROM "shoots";
