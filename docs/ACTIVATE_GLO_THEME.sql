-- Turn the Gloo theme on for the two Gloo workspaces.
--
-- Additive and reversible. It writes one TEXT column on two rows and touches
-- no other workspace, no user, and no operational data. Every other tenant
-- stays on 'default' and renders exactly as it does today.
--
-- PREREQUISITE: the deploy carrying the .theme-glo stylesheet must be live
-- first. Flipping the column ahead of that is harmless but does nothing --
-- the server writes the class and no rule matches it.
--
-- Both IDs are intentional. The earlier inspection could not separate the two
-- Gloo records into a real one and a stray one, so both are themed; whichever
-- the team signs in to, it looks right.

BEGIN;

UPDATE organizations
SET theme = 'glo'
WHERE id IN (
  'cmrpe5d4h000004jsgu243xji',
  'cmrszywkf000004ihwe788fcc'
);

-- Should report exactly 2 rows, both 'glo', and nothing else changed.
SELECT id, name, theme FROM organizations WHERE theme <> 'default' ORDER BY name;

COMMIT;

-- ── Rollback, if it needs to come off ────────────────────────────────
-- UPDATE organizations SET theme = 'default'
-- WHERE id IN ('cmrpe5d4h000004jsgu243xji','cmrszywkf000004ihwe788fcc');
