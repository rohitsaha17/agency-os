-- ============================================================================
--  RESET GLOO ORGS TO EMPTY  (keeps org + config + the admin[s])
--  Supabase SQL editor.  BACK UP FIRST (Database ▸ Backups) — cannot be undone.
--
--  Plain statements only (no DO / no $$), so the editor runs them as-is.
--
--  RUN IN TWO STEPS:
--    STEP 1 — select the STEP 1 query, press Run. Confirm it shows EXACTLY your
--             two gloo orgs and the right admin email(s). If not, STOP.
--    STEP 2 — select the whole STEP 2 block (BEGIN … COMMIT), press Run.
--  Do NOT use the editor's AI/"Fix" button — just the green Run.
--
--  Keeps, per gloo org: the org, its config (creative_types + designations),
--  and every OWNER/ADMIN user. Deletes everything else.
-- ============================================================================


-- ─── STEP 1 — preview (read-only) ───────────────────────────────────────────
SELECT o.name,
       (SELECT count(*) FROM users u WHERE u."organizationId" = o.id) AS users_total,
       (SELECT string_agg(u.email, ', ') FROM users u
          WHERE u."organizationId" = o.id AND u.role IN ('OWNER','ADMIN')) AS admins_kept
FROM organizations o
WHERE o.name ILIKE '%gloo%'
ORDER BY o."createdAt";


-- ─── STEP 2 — delete (run after STEP 1 looks right) ─────────────────────────
BEGIN;
DELETE FROM personal_items WHERE "userId" IN (SELECT id FROM users WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%'));
DELETE FROM task_lists     WHERE "userId" IN (SELECT id FROM users WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%'));
DELETE FROM attendance       WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM billable_items   WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM calendar_events  WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM channels         WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM client_packages  WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM content_items    WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM contracts        WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM expenses         WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM files            WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM folders          WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM follow_ups       WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM holidays         WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM invoices         WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM leave_requests   WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM notifications    WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM projects         WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM receipts         WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM review_batches   WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM salary_payments  WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM staff_advances   WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM staff_profiles   WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM status_history   WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM task_templates   WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM tasks            WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM unavailability   WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM clients          WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%');
DELETE FROM users            WHERE "organizationId" IN (SELECT id FROM organizations WHERE name ILIKE '%gloo%') AND role NOT IN ('OWNER','ADMIN');
COMMIT;
