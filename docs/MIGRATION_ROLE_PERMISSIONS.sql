-- Per-workspace role permissions.
--
-- One nullable column. NULL means "this workspace has changed nothing", which
-- is every workspace today, so nobody's access moves when this lands.
--
-- Additive and guarded. Safe before the deploy and safe to run twice.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS permissions JSONB;

-- Should report every workspace on the defaults.
SELECT
  count(*)                                        AS workspaces,
  count(permissions)                              AS with_custom_permissions,
  count(*) FILTER (WHERE permissions IS NULL)     AS on_the_defaults
FROM organizations;
