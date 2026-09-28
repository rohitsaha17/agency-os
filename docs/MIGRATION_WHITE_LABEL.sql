-- Whose logo a workspace's chrome wears.
--
-- Additive and guarded: one column, defaulted false, so every existing
-- workspace keeps the Vibrnd mark and nothing changes until the flag is
-- turned on for somebody from the platform admin panel.
--
-- Safe to run more than once.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS "whiteLabel" BOOLEAN NOT NULL DEFAULT false;

-- Should report every workspace on false, and any that already have a logo
-- ready to show if we grant it.
SELECT
  count(*)                                        AS workspaces,
  count(*) FILTER (WHERE "whiteLabel")            AS white_labelled,
  count(*) FILTER (WHERE "logoUrl" IS NOT NULL)   AS have_a_logo
FROM organizations;
