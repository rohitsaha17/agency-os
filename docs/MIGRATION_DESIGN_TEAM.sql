-- Which job titles the Head of Design leads.
--
-- One boolean per job title, defaulting to false, so nothing changes until
-- somebody ticks a title in Settings.
--
-- Additive and guarded: safe before the deploy, safe to run twice.

ALTER TABLE designations
  ADD COLUMN IF NOT EXISTS "isDesign" BOOLEAN NOT NULL DEFAULT false;

-- Should list every job title with its new flag, all false to begin with.
SELECT name, slug, "isDesign", "isActive"
FROM designations
ORDER BY "sortOrder", name;
