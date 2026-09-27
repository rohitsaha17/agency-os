-- Which of the two Glo workspaces is the real one?
--
-- STRICTLY READ-ONLY. Every statement is a SELECT. Nothing is updated,
-- merged, deleted or themed. Safe to run on production as many times as you
-- like.
--
-- No secrets are selected. passwordHash is never read — question 2 reports
-- whether a password EXISTS as a boolean, which is the signal that matters
-- (somebody has actually signed in and set one) without exposing anything.
--
-- Run the four blocks in order in the Supabase SQL editor. Block 4 is the one
-- that answers the question; the first three are the evidence behind it.

-- ═══════════════════════════════════════════════════════════════
-- 1. THE TWO ORGANIZATION RECORDS, SIDE BY SIDE
-- ═══════════════════════════════════════════════════════════════
SELECT
  id,
  name,
  slug,
  email,
  "createdAt",
  "onboardingCompleted",
  "onboardedAt",          -- null = nobody ever completed setup
  plan,
  "trialEndsAt",
  theme,                  -- must be 'default' for both, for now
  currency,
  timezone,
  "logoUrl" IS NOT NULL   AS has_logo,
  "letterheadColor"
FROM organizations
WHERE id IN ('cmrszywkf000004ihwe788fcc', 'cmrpe5d4h000004jsgu243xji')
ORDER BY "createdAt";

-- ═══════════════════════════════════════════════════════════════
-- 2. WHO IS IN EACH ONE
--
-- has_password is the important column. A user who has set a password has
-- signed in at least once; a workspace whose users all have NULL is one
-- nobody ever logged into.
-- ═══════════════════════════════════════════════════════════════
SELECT
  u."organizationId",
  u.name,
  u.email,
  u.role,
  u."isActive",
  (u."passwordHash" IS NOT NULL) AS has_password,
  u."passwordSetAt",
  u."createdAt",
  u."updatedAt"
FROM users u
WHERE u."organizationId" IN ('cmrszywkf000004ihwe788fcc', 'cmrpe5d4h000004jsgu243xji')
ORDER BY u."organizationId", u.role, u.name;

-- ═══════════════════════════════════════════════════════════════
-- 3. OPERATIONAL DATA — HOW MUCH REAL WORK IS IN EACH
--
-- Note: there is no Quote/Quotation table in this schema. Quoting is done
-- through contracts and invoices, so those are counted instead rather than
-- reporting a number for something that does not exist.
-- ═══════════════════════════════════════════════════════════════
SELECT 'users'          AS entity, "organizationId" AS org, count(*) FROM users          WHERE "organizationId" IN ('cmrszywkf000004ihwe788fcc','cmrpe5d4h000004jsgu243xji') GROUP BY "organizationId"
UNION ALL SELECT 'clients',        "organizationId", count(*) FROM clients        WHERE "organizationId" IN ('cmrszywkf000004ihwe788fcc','cmrpe5d4h000004jsgu243xji') GROUP BY "organizationId"
UNION ALL SELECT 'projects',       "organizationId", count(*) FROM projects       WHERE "organizationId" IN ('cmrszywkf000004ihwe788fcc','cmrpe5d4h000004jsgu243xji') GROUP BY "organizationId"
UNION ALL SELECT 'tasks',          "organizationId", count(*) FROM tasks          WHERE "organizationId" IN ('cmrszywkf000004ihwe788fcc','cmrpe5d4h000004jsgu243xji') GROUP BY "organizationId"
UNION ALL SELECT 'invoices',       "organizationId", count(*) FROM invoices       WHERE "organizationId" IN ('cmrszywkf000004ihwe788fcc','cmrpe5d4h000004jsgu243xji') GROUP BY "organizationId"
UNION ALL SELECT 'contracts',      "organizationId", count(*) FROM contracts      WHERE "organizationId" IN ('cmrszywkf000004ihwe788fcc','cmrpe5d4h000004jsgu243xji') GROUP BY "organizationId"
UNION ALL SELECT 'expenses',       "organizationId", count(*) FROM expenses       WHERE "organizationId" IN ('cmrszywkf000004ihwe788fcc','cmrpe5d4h000004jsgu243xji') GROUP BY "organizationId"
UNION ALL SELECT 'receipts',       "organizationId", count(*) FROM receipts       WHERE "organizationId" IN ('cmrszywkf000004ihwe788fcc','cmrpe5d4h000004jsgu243xji') GROUP BY "organizationId"
UNION ALL SELECT 'files',          "organizationId", count(*) FROM files          WHERE "organizationId" IN ('cmrszywkf000004ihwe788fcc','cmrpe5d4h000004jsgu243xji') GROUP BY "organizationId"
UNION ALL SELECT 'channels',       "organizationId", count(*) FROM channels       WHERE "organizationId" IN ('cmrszywkf000004ihwe788fcc','cmrpe5d4h000004jsgu243xji') GROUP BY "organizationId"
UNION ALL SELECT 'content_items',  "organizationId", count(*) FROM content_items  WHERE "organizationId" IN ('cmrszywkf000004ihwe788fcc','cmrpe5d4h000004jsgu243xji') GROUP BY "organizationId"
UNION ALL SELECT 'attendance',     "organizationId", count(*) FROM attendance     WHERE "organizationId" IN ('cmrszywkf000004ihwe788fcc','cmrpe5d4h000004jsgu243xji') GROUP BY "organizationId"
UNION ALL SELECT 'leave_requests', "organizationId", count(*) FROM leave_requests WHERE "organizationId" IN ('cmrszywkf000004ihwe788fcc','cmrpe5d4h000004jsgu243xji') GROUP BY "organizationId"
UNION ALL SELECT 'notifications',  "organizationId", count(*) FROM notifications  WHERE "organizationId" IN ('cmrszywkf000004ihwe788fcc','cmrpe5d4h000004jsgu243xji') GROUP BY "organizationId"
UNION ALL SELECT 'status_history', "organizationId", count(*) FROM status_history WHERE "organizationId" IN ('cmrszywkf000004ihwe788fcc','cmrpe5d4h000004jsgu243xji') GROUP BY "organizationId"
ORDER BY entity, org;

-- ═══════════════════════════════════════════════════════════════
-- 4. WHICH ONE IS ACTUALLY BEING USED
--
-- This is the decisive block. Counts alone can mislead — a workspace can be
-- seeded with clients and projects and then abandoned. Recency of activity
-- cannot: somebody checked in, moved a task, or was notified, and that
-- happened on a date.
--
-- status_history is the strongest single signal. It is written on every
-- status change of anything in the product, by a real person, with a
-- timestamp. attendance is the second: people only check in on the workspace
-- they actually open each morning.
-- ═══════════════════════════════════════════════════════════════
SELECT
  o.id,
  o.name,
  (SELECT count(*) FROM users u
     WHERE u."organizationId" = o.id AND u."isActive")                      AS active_users,
  (SELECT count(*) FROM users u
     WHERE u."organizationId" = o.id AND u."passwordHash" IS NOT NULL)      AS users_who_have_signed_in,
  (SELECT max(sh."changedAt") FROM status_history sh
     WHERE sh."organizationId" = o.id)                                      AS last_status_change,
  (SELECT count(*) FROM status_history sh
     WHERE sh."organizationId" = o.id
       AND sh."changedAt" > now() - interval '30 days')                     AS status_changes_last_30d,
  (SELECT max(a."checkedInAt") FROM attendance a
     WHERE a."organizationId" = o.id)                                       AS last_check_in,
  (SELECT count(*) FROM attendance a
     WHERE a."organizationId" = o.id
       AND a."checkedInAt" > now() - interval '30 days')                    AS check_ins_last_30d,
  (SELECT max(t."updatedAt") FROM tasks t
     WHERE t."organizationId" = o.id)                                       AS last_task_touched,
  (SELECT max(n."createdAt") FROM notifications n
     WHERE n."organizationId" = o.id)                                       AS last_notification,
  (SELECT max(f."createdAt") FROM files f
     WHERE f."organizationId" = o.id)                                       AS last_file_uploaded
FROM organizations o
WHERE o.id IN ('cmrszywkf000004ihwe788fcc', 'cmrpe5d4h000004jsgu243xji')
ORDER BY o."createdAt";
