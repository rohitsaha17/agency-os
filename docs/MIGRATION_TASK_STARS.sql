-- Starring a task.
--
-- Run against PRODUCTION, in the Supabase SQL editor. Paste the whole file.
-- Safe to run twice: every statement is guarded.
--
-- PURELY ADDITIVE. One new table. No existing table, column or row is
-- touched, so the currently-deployed app keeps working either side of it.
--
-- WHY A TABLE AND NOT A COLUMN
--
-- The Starred page existed with nothing that could be starred. Only personal
-- reminders had a `starred` flag, so anybody whose My List was empty saw a
-- permanent empty page and no way to fill it.
--
-- The obvious fix — a `starred` boolean on `tasks` — would have been wrong. A
-- task is assigned to several people, and a pin is not a property of the
-- work: it is a note one person made to themselves about it. A boolean on the
-- task would mean the editor starring a shoot also starred it for the
-- photographer, whose own list would then rearrange itself for no reason they
-- could see.
--
-- So: one row per person per pinned task. Personal reminders keep their own
-- `starred` column, because those belong to one person already and there is
-- nobody to confuse.
--
-- ON DELETE CASCADE both ways. A deleted task takes its pins with it, and so
-- does a deleted person — a pin belonging to nobody, on nothing, is a row
-- that can only ever be confusing.
--
-- Nothing is backfilled. Nobody has pinned anything yet, and inventing pins
-- would put work on people's lists that they never chose to put there.
--
-- Expect: 1 table, 1 index, 2 foreign keys, then a final row reading 0.

BEGIN;

CREATE TABLE IF NOT EXISTS "task_stars" (
  "taskId"    TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_stars_pkey" PRIMARY KEY ("taskId", "userId")
);

-- "What have I pinned" is the only question this table is ever asked.
CREATE INDEX IF NOT EXISTS "task_stars_userId_idx" ON "task_stars" ("userId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'task_stars_taskId_fkey') THEN
    ALTER TABLE "task_stars" ADD CONSTRAINT "task_stars_taskId_fkey"
      FOREIGN KEY ("taskId") REFERENCES "tasks"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'task_stars_userId_fkey') THEN
    ALTER TABLE "task_stars" ADD CONSTRAINT "task_stars_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

COMMIT;

-- Check it landed. Expect one row, count 0.
SELECT count(*) AS pinned_tasks FROM "task_stars";
