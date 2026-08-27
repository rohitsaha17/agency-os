-- Availability: days somebody cannot be given work.
--
-- Run against PRODUCTION before deploying the code that uses it.
-- Safe to run twice: every statement is guarded.
--
-- Purely additive. One new table and one new enum; nothing existing is
-- altered, so the currently-deployed app keeps working either side of it.
-- There is no backfill to do — nobody has blocked any days yet, and an empty
-- table is the correct starting state.
--
-- Expect: CREATE TYPE, CREATE TABLE, two indexes, one foreign-key set, and a
-- final SELECT returning 0 rows.

BEGIN;

-- 1. Why somebody is out. CREATE TYPE has no IF NOT EXISTS.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UnavailabilityKind') THEN
    CREATE TYPE "UnavailabilityKind" AS ENUM ('SHOOT', 'LEAVE', 'SICK', 'OTHER_CLIENT', 'OTHER');
  END IF;
END
$$;

-- 2. One row per person per blocked day.
--
--    Per day rather than per range on purpose: "is this person free on the
--    4th" is asked on every single assignment, and against ranges that is an
--    overlap query every time. This makes it a lookup, and lets the unique
--    constraint stop the same day being blocked twice.
CREATE TABLE IF NOT EXISTS "unavailability" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  -- Midnight UTC on the blocked day. Always written through
  -- lib/availability.ts dayKey(), so two spellings of the same date can never
  -- become two rows.
  "date"           TIMESTAMP(3) NOT NULL,
  "kind"           "UnavailabilityKind" NOT NULL DEFAULT 'OTHER',
  "reason"         TEXT NOT NULL,
  "createdById"    TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "unavailability_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "unavailability_userId_date_key"
  ON "unavailability" ("userId", "date");

CREATE INDEX IF NOT EXISTS "unavailability_organizationId_date_idx"
  ON "unavailability" ("organizationId", "date");

-- 3. Foreign keys.
--    org and user CASCADE: a deleted person's blocked days are meaningless.
--    createdById SET NULL: losing the admin who recorded it must not take the
--    block with it, or somebody quietly becomes bookable again.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unavailability_organizationId_fkey') THEN
    ALTER TABLE "unavailability" ADD CONSTRAINT "unavailability_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unavailability_userId_fkey') THEN
    ALTER TABLE "unavailability" ADD CONSTRAINT "unavailability_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unavailability_createdById_fkey') THEN
    ALTER TABLE "unavailability" ADD CONSTRAINT "unavailability_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

COMMIT;

-- Check it landed. Expect one row, count 0.
SELECT count(*) AS blocked_days FROM "unavailability";
