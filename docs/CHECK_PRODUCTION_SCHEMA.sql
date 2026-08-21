-- Is the production database ready for the code that's now deployed?
--
-- READ-ONLY. Selects only; changes nothing. Safe to run any time.
--
-- The app was deployed from a branch carrying all of v2 and v3, but nobody
-- has confirmed the database moved with it. Logging in proves nothing: that
-- path only touches `users`, which has existed since the beginning. These are
-- the tables the new screens actually read.
--
-- Run it, then send back the output.

SELECT
  t.name                                        AS table_name,
  CASE WHEN to_regclass('public.' || t.name) IS NULL
       THEN 'MISSING'
       ELSE 'ok'
  END                                           AS state,
  t.needed_by
FROM (VALUES
  -- v3: planning, the review loop, and billing off a closed cycle
  ('content_items',        'the Plan tab and every calendar'),
  ('project_cycles',       'cycles, quotas, cycle close'),
  ('project_deliverables', 'what a project owes per cycle'),
  ('creative_types',       'Reel / Post / Photo Shoot'),
  ('task_deliveries',      'proof attached when work is handed in'),
  ('task_reviews',         'the approve / request-changes decision'),
  ('billable_items',       'extras flagged for invoicing'),
  ('designations',         'job titles, separate from roles'),
  ('review_batches',       'client review links'),
  -- v2: things the task and calendar screens rely on
  ('status_history',       'the History tab'),
  ('notifications',        'the bell'),
  ('personal_items',       'My List reminders'),
  ('task_lists',           'saved task lists'),
  ('calendar_events',      'org events on the calendar'),
  ('change_requests',      'changes requested on a task'),
  ('follow_ups',           'client follow-ups'),
  ('package_quotas',       'monthly quota per creative type'),
  ('client_packages',      'the retainer package')
) AS t(name, needed_by)
ORDER BY state DESC, t.name;

-- Second question: does the UserRole enum know the v3 roles? If SMM or TEAM
-- are missing, the app cannot write a role it now assigns.
SELECT
  'UserRole enum' AS check,
  string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS values
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname = 'UserRole';

-- Third: the account you sign in with, and whether it still has a password.
SELECT
  email,
  role::text                                     AS role,
  CASE WHEN "passwordHash" IS NULL
       THEN 'no password - site will prompt you to set one'
       ELSE 'password set'
  END                                            AS login_state,
  "isActive"                                     AS active
FROM users
ORDER BY email;
