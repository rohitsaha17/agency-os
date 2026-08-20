-- V3 Phase 2 — the project becomes the commercial unit.
--
-- Structure (Project.cycleAmount/cycleUnit/cycleStartDate/cycleEndDate,
-- project_deliverables, project_cycles, project_members.addedById,
-- Task.kind, the ProjectRole/CycleUnit/CycleStatus/TaskKind enums) is
-- applied by `prisma db push`. This mirrors it for other environments and
-- carries the one piece of data movement that push can't do.
-- Idempotent — safe to re-run.

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- Projects created before v3 have startDate/endDate but no cycle
-- window, so they'd generate no cycles and their Plan tab would be
-- empty. Seed the cycle period from the dates they already have.
-- ─────────────────────────────────────────────────────────────
UPDATE projects
   SET "cycleStartDate" = "startDate"
 WHERE "cycleStartDate" IS NULL
   AND "startDate" IS NOT NULL;

UPDATE projects
   SET "cycleEndDate" = "endDate"
 WHERE "cycleEndDate" IS NULL
   AND "endDate" IS NOT NULL
   -- A retainer with an end date is unusual; leave open-ended ones alone.
   AND type = 'ONE_TIME';

COMMIT;

-- Cycles themselves are generated lazily by lib/cycles.ts (ensureCycles),
-- which runs whenever a project's cycles are read, so there's nothing to
-- backfill here. Client packages are converted to retainer projects by
-- scripts/migrate-packages-to-projects.ts, which is idempotent and must be
-- run once per environment:
--
--   npx tsx scripts/migrate-packages-to-projects.ts --dry-run
--   npx tsx scripts/migrate-packages-to-projects.ts
