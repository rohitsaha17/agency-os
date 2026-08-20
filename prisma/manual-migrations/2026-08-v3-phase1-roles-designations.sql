-- V3 Phase 1 — four-role model + dynamic designations.
--
-- The structural half (UserRole gains SMM/TEAM, the designations table,
-- users.designationId, organizations.requireAssignmentApproval) is applied by
-- `prisma db push`. This file is the DATA half: it moves existing users onto
-- the new tiers and gives every organization a starting set of job labels.
-- Idempotent — safe to re-run.

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. v2's MEMBER tier becomes v3's TEAM. MEMBER stays in the enum
--    as a deprecated value so any row this misses still reads.
-- ─────────────────────────────────────────────────────────────
UPDATE users SET role = 'TEAM' WHERE role = 'MEMBER';

-- ─────────────────────────────────────────────────────────────
-- 2. Seed the default job labels for every organization.
--    SME and POC can't have work assigned to them — they're advisory
--    roles, so they're excluded from assignment pickers.
-- ─────────────────────────────────────────────────────────────
INSERT INTO designations ("id", "organizationId", "name", "slug", "isActive", "canBeAssignedWork", "sortOrder", "createdAt", "updatedAt")
SELECT
  'desg_' || o.id || '_' || d.slug,
  o.id, d.name, d.slug, TRUE, d.assignable, d.ord, NOW(), NOW()
FROM organizations o
CROSS JOIN (VALUES
  ('Editor',       'editor',       TRUE,  0),
  ('Photographer', 'photographer', TRUE,  1),
  ('Videographer', 'videographer', TRUE,  2),
  ('Copywriter',   'copywriter',   TRUE,  3),
  ('Designer',     'designer',     TRUE,  4),
  ('Head of Design','head-of-design', TRUE, 6),
  ('SME',          'sme',          FALSE, 7),
  ('POC',          'poc',          FALSE, 8)
) AS d(name, slug, assignable, ord)
ON CONFLICT ("organizationId", "slug") DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 3. Carry each user's old enum designation onto the new FK, so
--    nobody loses their job label in the move.
--
--    v2's enum had an SMM value, but v3 makes SMM a ROLE — planning
--    is an access tier, not a craft — so it has no designation to
--    map onto and is deliberately absent below.
-- ─────────────────────────────────────────────────────────────
UPDATE users u
   SET "designationId" = d.id
  FROM designations d
 WHERE d."organizationId" = u."organizationId"
   AND u."designationId" IS NULL
   AND u.designation IS NOT NULL
   AND d.slug = CASE u.designation::text
                  WHEN 'DESIGNER'       THEN 'designer'
                  WHEN 'EDITOR'         THEN 'editor'
                  WHEN 'HEAD_OF_DESIGN' THEN 'head-of-design'
                  WHEN 'PHOTOGRAPHER'   THEN 'photographer'
                  WHEN 'SME'            THEN 'sme'
                  WHEN 'POC'            THEN 'poc'
                  ELSE NULL
                END;

COMMIT;
