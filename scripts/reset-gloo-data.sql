-- ============================================================================
--  RESET GLOO ORGS TO EMPTY  (keep org + config + the admin[s])
--  For the Supabase SQL editor.  TAKE A BACKUP FIRST — cannot be undone.
--  (Supabase ▸ Database ▸ Backups)
-- ============================================================================
--
--  The Supabase SQL editor rewrites PL/pgSQL (DO $$ …) blocks and breaks them,
--  so this uses only plain statements. STEP 2 is a "generator": it prints the
--  exact DELETE script for YOUR live database (so it automatically skips any
--  table your schema doesn't have). You copy that output and run it as STEP 3.
--
--  For every org whose name contains "gloo" (both of yours) it KEEPS the org,
--  its config (creative_types + designations) and the admin user(s) — everyone
--  with role OWNER or ADMIN — and deletes everything else, including the kept
--  admins' own personal lists/reminders. Scoped strictly to the gloo orgs.
--
--  ── HOW TO RUN (three quick steps, each its own Run) ──
--   STEP 1  Run it. Confirm it lists EXACTLY your two gloo orgs + the right
--           admin email(s). If anything else shows, STOP.
--   STEP 2  Run it. It returns ONE cell of text ("run_this"). Click that cell
--           and copy its full contents.
--   STEP 3  Open a new query, paste what you copied, and Run it.
-- ============================================================================


-- ─── STEP 1 — DRY RUN (read-only) ───────────────────────────────────────────
SELECT o.id,
       o.name,
       (SELECT count(*) FROM users u WHERE u."organizationId" = o.id) AS users_total,
       (SELECT count(*) FROM users u WHERE u."organizationId" = o.id AND u.role IN ('OWNER','ADMIN')) AS admins_kept,
       (SELECT string_agg(u.email, ', ') FROM users u WHERE u."organizationId" = o.id AND u.role IN ('OWNER','ADMIN')) AS admin_emails
FROM organizations o
WHERE o.name ILIKE '%gloo%'
ORDER BY o."createdAt";


-- ─── STEP 2 — GENERATE THE DELETE SCRIPT (read-only; prints SQL to run) ──────
--  Run this, then copy the single "run_this" cell it returns.
SELECT 'BEGIN;' || E'\n'
  || string_agg(stmt, E'\n' ORDER BY ord, stmt)
  || E'\nCOMMIT;' AS run_this
FROM (
  -- user-owned child rows (personal lists/reminders etc.) for the gloo users
  SELECT -2 AS ord,
    'DELETE FROM public.' || quote_ident(c.table_name)
    || ' WHERE "userId" IN (SELECT id FROM users WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE ''%gloo%''));' AS stmt
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.column_name = 'userId'
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns o
                    WHERE o.table_schema = 'public' AND o.table_name = c.table_name AND o.column_name = 'organizationId')
  UNION ALL
  -- every tenant-scoped table except the config we keep, users, and clients
  SELECT 0,
    'DELETE FROM public.' || quote_ident(table_name)
    || ' WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE ''%gloo%'');'
  FROM information_schema.columns
  WHERE table_schema = 'public' AND column_name = 'organizationId'
    AND table_name NOT IN ('organizations','creative_types','designations','users','clients')
  UNION ALL
  -- clients last (invoices & projects reference it)
  SELECT 1, 'DELETE FROM public.clients WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE ''%gloo%'');'
  UNION ALL
  -- finally the non-admin users (keeps OWNER + ADMIN)
  SELECT 2, 'DELETE FROM public.users WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE ''%gloo%'') AND role NOT IN (''OWNER'',''ADMIN'');'
) s;


-- ─── STEP 3 — paste the copied "run_this" text into a NEW query and Run it ───
--  (It is a BEGIN; … COMMIT; block of plain DELETEs — safe for the editor.)
