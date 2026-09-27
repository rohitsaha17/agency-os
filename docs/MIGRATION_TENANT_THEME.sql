-- Per-workspace visual theme.
--
-- Run against PRODUCTION, in the Supabase SQL editor. Paste the whole file.
-- Safe to run twice: the statement is guarded.
--
-- PURELY ADDITIVE, AND DELIBERATELY INERT. One column with a default. Every
-- existing organization gets 'default', which renders exactly what shipped
-- before this column existed. Running this changes nothing anybody can see.
--
-- WHY A KEY AND NOT A PALETTE
--
-- The obvious shape is a JSON blob — { primaryColor, accentColor,
-- backgroundColor }. It does not work here, and it is worth writing down why
-- so nobody re-proposes it.
--
-- This app has no design tokens. It writes Tailwind's literal utilities into
-- components: bg-white, text-gray-900, bg-indigo-600. Those compile to fixed
-- hex values inside the stylesheet, so there is no variable to hand a runtime
-- colour to. Making arbitrary colours work means first replacing every literal
-- utility in the codebase with a semantic token — a very large change to
-- shared components, for one client.
--
-- A named theme needs none of that. It is one CSS block, written once and
-- reviewed once, scoped by a class on <html> — precisely the mechanism dark
-- mode already uses here, where 230 rules remap 175 utility classes without a
-- single !important and without touching a component.
--
-- If five tenants each want arbitrary colours one day, THAT is the moment to
-- invest in tokens. Not before.
--
-- WHAT THIS DOES NOT DO
--
-- It does not switch anybody to a new theme. No organization is named here,
-- no id is hardcoded anywhere in the codebase, and nothing keys off a
-- workspace's name or its owner's email. Opting a tenant in is a separate,
-- deliberate UPDATE run by a person who knows which row they mean.
--
-- Expect: 1 column added, then a final row reading 0.

BEGIN;

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "theme" TEXT NOT NULL DEFAULT 'default';

COMMIT;

-- Check it landed, and that nothing was switched on.
-- Expect one row: non_default_themes = 0.
SELECT count(*) FILTER (WHERE "theme" <> 'default') AS non_default_themes,
       count(*)                                     AS total_organizations
FROM "organizations";
