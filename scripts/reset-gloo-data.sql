-- ============================================================================
--  RESET GLOO ORGS TO EMPTY  (keep org + config + the admin[s])
--  Paste into the Supabase SQL editor.  TAKE A BACKUP FIRST — cannot be undone.
--  (Supabase ▸ Database ▸ Backups)
-- ============================================================================
--
--  Clears all DATA for every organization whose name contains "gloo"
--  (case-insensitive) — both of yours — while KEEPING, per org:
--    • the organization row (name, theme, settings)
--    • workspace config: creative_types + designations (content types, job
--      titles/roles)
--    • the admin user(s): everyone with role OWNER or ADMIN stays; all other
--      users are removed
--  Everything else owned by the org is deleted, and the kept admins' own
--  personal lists/reminders too.
--
--  This version reads the LIVE list of tables, so it adapts to your database
--  automatically (it skips tables your schema doesn't have) and deletes in a
--  foreign-key-safe order. Scoped strictly to the gloo orgs — no other tenant
--  is touched.
--
--  HOW TO RUN — two separate runs in the SQL editor:
--    1) Run STEP 1 (the SELECT). Confirm it lists EXACTLY your two gloo orgs
--       and the right admin email(s). If anything else shows, STOP.
--    2) Run STEP 2 (the whole DO … block) with the green Run button.
--       Do NOT use the editor's "Fix with Assistant" — just Run it as-is.
-- ============================================================================


-- ─── STEP 1 — DRY RUN (read-only; deletes nothing) ──────────────────────────
SELECT o.id,
       o.name,
       (SELECT count(*) FROM users u WHERE u."organizationId" = o.id) AS users_total,
       (SELECT count(*) FROM users u WHERE u."organizationId" = o.id AND u.role IN ('OWNER','ADMIN')) AS admins_kept,
       (SELECT string_agg(u.email, ', ') FROM users u WHERE u."organizationId" = o.id AND u.role IN ('OWNER','ADMIN')) AS admin_emails
FROM organizations o
WHERE o.name ILIKE '%gloo%'
ORDER BY o."createdAt";


-- ─── STEP 2 — EXECUTE (run after STEP 1 looks right) ────────────────────────
DO $reset$
DECLARE
  v_org   record;
  v_users text[];
  v_tbl   text;
  v_remaining   text[];   -- tenant-scoped tables still to clear
  v_remaining_u text[];   -- user-owned child tables still to clear
  v_still   text[];
  v_still_u text[];
  v_progress boolean;
  v_pass int;
BEGIN
  FOR v_org IN SELECT id, name FROM organizations WHERE name ILIKE '%gloo%' ORDER BY "createdAt" LOOP
    SELECT array_agg(id) INTO v_users FROM users WHERE "organizationId" = v_org.id;

    -- Tenant-scoped tables that actually exist, minus the config we keep.
    SELECT array_agg(table_name) INTO v_remaining
      FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'organizationId'
        AND table_name NOT IN ('organizations','creative_types','designations');

    -- User-owned child tables with no organizationId (personal lists/reminders).
    SELECT array_agg(c.table_name) INTO v_remaining_u
      FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.column_name = 'userId'
        AND NOT EXISTS (SELECT 1 FROM information_schema.columns o
                        WHERE o.table_schema = 'public' AND o.table_name = c.table_name AND o.column_name = 'organizationId');

    -- Delete in repeated passes; a table blocked by a foreign key this pass is
    -- retried next pass once its dependants are gone. Order-independent.
    v_pass := 0;
    WHILE array_length(v_remaining,1) IS NOT NULL OR array_length(v_remaining_u,1) IS NOT NULL LOOP
      v_pass := v_pass + 1;
      v_still := ARRAY[]::text[]; v_still_u := ARRAY[]::text[]; v_progress := false;

      IF v_remaining IS NOT NULL THEN
        FOREACH v_tbl IN ARRAY v_remaining LOOP
          BEGIN
            IF v_tbl = 'users' THEN
              EXECUTE format('DELETE FROM public.%I WHERE "organizationId"=$1 AND role NOT IN (''OWNER'',''ADMIN'')', v_tbl) USING v_org.id;
            ELSE
              EXECUTE format('DELETE FROM public.%I WHERE "organizationId"=$1', v_tbl) USING v_org.id;
            END IF;
            v_progress := true;
          EXCEPTION WHEN foreign_key_violation THEN v_still := array_append(v_still, v_tbl); END;
        END LOOP;
      END IF;

      IF v_remaining_u IS NOT NULL THEN
        FOREACH v_tbl IN ARRAY v_remaining_u LOOP
          BEGIN
            EXECUTE format('DELETE FROM public.%I WHERE "userId" = ANY($1)', v_tbl) USING v_users;
            v_progress := true;
          EXCEPTION WHEN foreign_key_violation THEN v_still_u := array_append(v_still_u, v_tbl); END;
        END LOOP;
      END IF;

      IF (array_length(v_still,1) IS NOT NULL OR array_length(v_still_u,1) IS NOT NULL) AND NOT v_progress THEN
        RAISE EXCEPTION 'Could not clear org % — blocked tables: % / %', v_org.id, v_still, v_still_u;
      END IF;
      v_remaining   := NULLIF(v_still,   ARRAY[]::text[]);
      v_remaining_u := NULLIF(v_still_u, ARRAY[]::text[]);
      IF v_pass > 50 THEN RAISE EXCEPTION 'Too many passes on org %', v_org.id; END IF;
    END LOOP;

    RAISE NOTICE 'Cleared "%" (%) in % pass(es)', v_org.name, v_org.id, v_pass;
  END LOOP;
END
$reset$;
