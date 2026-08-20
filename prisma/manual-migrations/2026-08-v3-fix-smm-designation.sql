-- V3 correction — "SMM" was never a designation.
--
-- Phase 1 seeded a designation called SMM alongside a ROLE called SMM, so the
-- same word appeared in two adjacent columns meaning two different things.
-- An admin could read as "Admin / SMM" and nobody could say which was true.
--
-- The distinction v3 actually draws (docs/V3_CONTEXT.md §2):
--   Role        what you may DO      — OWNER, ADMIN, MANAGER, SMM, TEAM
--   Designation what you DO          — Editor, Photographer, Copywriter, …
--
-- Planning projects and reviewing work is an access tier, not a craft, so it
-- belongs to Role alone. Anyone who plans is role SMM; the label is redundant.
-- Idempotent — safe to re-run.

BEGIN;

-- Release anyone holding it. Their ROLE already says whether they plan.
UPDATE users u
   SET "designationId" = NULL
  FROM designations d
 WHERE u."designationId" = d.id
   AND d.slug = 'smm';

-- Then remove the label itself.
DELETE FROM designations WHERE slug = 'smm';

-- The same reasoning applies to "Head of Design": it IS a real job, so it
-- stays. Only SMM collided with a role name.

COMMIT;
