-- ============================================================================
--  RESET GLOO ORGS TO EMPTY (keep org + config + one admin each)
--  Paste into the Supabase SQL editor.  TAKE A BACKUP FIRST.
--  (Supabase ▸ Database ▸ Backups — this cannot be undone.)
-- ============================================================================
--
--  Clears all DATA for every organization whose name contains "gloo"
--  (case-insensitive) — both of yours — while KEEPING, per org:
--    • the organization itself (name, theme, settings)
--    • its workspace config: creative_types + designations (job titles/roles)
--    • one admin user (the OWNER, or the single ADMIN if there is no owner)
--  Everything else is deleted: clients, projects, tasks, content, invoices,
--  billables, expenses, HR, availability, files, channels, notifications, all
--  other users, and the kept admin's own personal lists/reminders.
--
--  It is scoped strictly to the gloo orgs — no other tenant is touched.
--
--  HOW TO USE:
--    1. Run STEP 1 on its own. Confirm it lists EXACTLY your two gloo orgs and
--       the right admin kept for each. If it lists anything else, STOP.
--    2. Then run STEP 2.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────
-- STEP 1 — DRY RUN (read-only, deletes nothing). Check the output first.
-- ─────────────────────────────────────────────────────────────────────────
SELECT o.id,
       o.name,
       (SELECT count(*) FROM users u WHERE u."organizationId" = o.id) AS users_total,
       COALESCE(
         (SELECT email FROM users u WHERE u."organizationId" = o.id AND u.role = 'OWNER' ORDER BY u."createdAt" LIMIT 1),
         (SELECT email FROM users u WHERE u."organizationId" = o.id AND u.role = 'ADMIN' ORDER BY u."createdAt" LIMIT 1)
       ) AS admin_kept
FROM organizations o
WHERE o.name ILIKE '%gloo%'
ORDER BY o."createdAt";


-- ─────────────────────────────────────────────────────────────────────────
-- STEP 2 — EXECUTE THE DELETE. Run only after STEP 1 looks right.
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_org    record;
  v_admin  text;
  v_owners int;
  v_admins int;
  v_users  text[];
  v_remaining   text[];
  v_remaining_u text[];
  v_still   text[];
  v_still_u text[];
  v_progress boolean;
  v_pass   int;
  v_tbl    text;
BEGIN
  FOR v_org IN SELECT id, name FROM organizations WHERE name ILIKE '%gloo%' ORDER BY "createdAt" LOOP

    -- Choose the ONE admin to keep: the single OWNER, else the single ADMIN.
    SELECT count(*) INTO v_owners FROM users WHERE "organizationId" = v_org.id AND role = 'OWNER';
    SELECT count(*) INTO v_admins FROM users WHERE "organizationId" = v_org.id AND role = 'ADMIN';
    IF v_owners = 1 THEN
      SELECT id INTO v_admin FROM users WHERE "organizationId" = v_org.id AND role = 'OWNER';
    ELSIF v_owners = 0 AND v_admins = 1 THEN
      SELECT id INTO v_admin FROM users WHERE "organizationId" = v_org.id AND role = 'ADMIN';
    ELSE
      RAISE EXCEPTION 'Org "%" (%) has % owner(s) and % admin(s); cannot auto-pick one admin to keep. Decide which to keep and adjust this script.',
        v_org.name, v_org.id, v_owners, v_admins;
    END IF;

    SELECT array_agg(id) INTO v_users FROM users WHERE "organizationId" = v_org.id;

    -- All tenant-scoped tables, minus the config we keep.
    SELECT array_agg(table_name) INTO v_remaining
      FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'organizationId'
        AND table_name NOT IN ('organizations', 'creative_types', 'designations');

    -- User-owned child tables with no organizationId (personal lists/reminders).
    SELECT array_agg(c.table_name) INTO v_remaining_u
      FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.column_name = 'userId'
        AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns o
          WHERE o.table_schema = 'public' AND o.table_name = c.table_name AND o.column_name = 'organizationId');

    -- Delete in repeated passes; a table blocked by a foreign key this pass is
    -- retried next pass once its dependants are gone. Order doesn't matter.
    v_pass := 0;
    WHILE array_length(v_remaining, 1) IS NOT NULL OR array_length(v_remaining_u, 1) IS NOT NULL LOOP
      v_pass := v_pass + 1;
      v_still := ARRAY[]::text[]; v_still_u := ARRAY[]::text[]; v_progress := false;

      IF v_remaining IS NOT NULL THEN
        FOREACH v_tbl IN ARRAY v_remaining LOOP
          BEGIN
            IF v_tbl = 'users' THEN
              EXECUTE format('DELETE FROM %I WHERE "organizationId" = $1 AND id <> $2', v_tbl) USING v_org.id, v_admin;
            ELSE
              EXECUTE format('DELETE FROM %I WHERE "organizationId" = $1', v_tbl) USING v_org.id;
            END IF;
            v_progress := true;
          EXCEPTION WHEN foreign_key_violation THEN v_still := array_append(v_still, v_tbl); END;
        END LOOP;
      END IF;

      IF v_remaining_u IS NOT NULL THEN
        FOREACH v_tbl IN ARRAY v_remaining_u LOOP
          BEGIN
            EXECUTE format('DELETE FROM %I WHERE "userId" = ANY($1)', v_tbl) USING v_users;
            v_progress := true;
          EXCEPTION WHEN foreign_key_violation THEN v_still_u := array_append(v_still_u, v_tbl); END;
        END LOOP;
      END IF;

      IF (array_length(v_still, 1) IS NOT NULL OR array_length(v_still_u, 1) IS NOT NULL) AND NOT v_progress THEN
        RAISE EXCEPTION 'Could not clear org % — blocked tables: % / %', v_org.id, v_still, v_still_u;
      END IF;
      v_remaining   := NULLIF(v_still,   ARRAY[]::text[]);
      v_remaining_u := NULLIF(v_still_u, ARRAY[]::text[]);
      IF v_pass > 50 THEN RAISE EXCEPTION 'Too many passes on org %', v_org.id; END IF;
    END LOOP;

    RAISE NOTICE 'Cleared "%" (%) in % pass(es); kept admin %', v_org.name, v_org.id, v_pass, v_admin;
  END LOOP;
END $$;
