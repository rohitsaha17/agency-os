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
--  Everything else owned by the org is deleted: clients, projects, tasks,
--  content, invoices, billables, expenses, HR, availability, files, channels,
--  notifications, and the kept admins' own personal lists/reminders.
--
--  Scoped strictly to the gloo orgs — no other tenant is touched.
--  Plain DELETEs (no PL/pgSQL) so the SQL editor runs it as-is.
--
--  HOW TO USE — two separate runs:
--    1) Select the STEP 1 query below and Run it. Confirm it lists EXACTLY your
--       two gloo orgs and the right admin for each. If anything else shows, STOP.
--    2) Select everything from "STEP 2" (the BEGIN … COMMIT block) and Run it.
-- ============================================================================


-- ─── STEP 1 — DRY RUN (read-only; deletes nothing) ──────────────────────────
SELECT o.id,
       o.name,
       (SELECT count(*) FROM users u WHERE u."organizationId" = o.id) AS users_total,
       (SELECT count(*) FROM users u WHERE u."organizationId" = o.id
          AND u.role IN ('OWNER','ADMIN')) AS admins_kept,
       (SELECT string_agg(u.email, ', ') FROM users u WHERE u."organizationId" = o.id
          AND u.role IN ('OWNER','ADMIN')) AS admin_emails
FROM organizations o
WHERE o.name ILIKE '%gloo%'
ORDER BY o."createdAt";


-- ─── STEP 2 — EXECUTE (run after STEP 1 looks right) ────────────────────────
BEGIN;

-- the kept admins' own personal lists/reminders (no organizationId column)
DELETE FROM personal_items WHERE "userId" IN (SELECT id FROM users WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%'));
DELETE FROM task_lists     WHERE "userId" IN (SELECT id FROM users WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%'));

-- all tenant data (children clear via ON DELETE CASCADE); clients is last
-- because invoices & projects reference it.
DELETE FROM "attendance"         WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM "billable_items"     WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM "calendar_events"    WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM "channels"           WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM "client_packages"    WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM "content_items"      WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM "contracts"          WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM "expenses"           WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM "files"              WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM "folders"            WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM "follow_ups"         WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM "holidays"           WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM "invoices"           WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM "leave_requests"     WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM "notifications"      WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM "projects"           WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM "push_subscriptions" WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM "receipts"           WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM "review_batches"     WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM "salary_payments"    WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM "staff_advances"     WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM "staff_profiles"     WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM "status_history"     WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM "task_templates"     WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM "tasks"              WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM "unavailability"     WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM "clients"            WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');

-- every non-admin user (keeps OWNER + ADMIN)
DELETE FROM users
WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%')
  AND role NOT IN ('OWNER','ADMIN');

COMMIT;
