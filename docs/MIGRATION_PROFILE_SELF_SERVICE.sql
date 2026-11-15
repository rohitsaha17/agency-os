-- Self-service profile: let employees maintain their own personal details
-- (photo, blood group, emergency contact, …) from My Account.
--
-- Run against PRODUCTION before (or with) deploying the code that uses it.
-- Safe to run twice: ADD COLUMN IF NOT EXISTS is a no-op the second time.
--
-- Purely additive — two new nullable columns, so every existing row is
-- unchanged and the app behaves as before until someone fills them in.
--
-- Plain statements, no DO/$$ block, so the Supabase SQL editor runs them
-- verbatim. Paste and press the green Run (not the AI / "Fix" button).
--
-- Expect: two ALTER TABLE, then a SELECT showing 0 filled-in so far.

-- The storage object key behind a profile photo (avatarUrl is the route URL).
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "avatarKey" TEXT;

-- Blood group, maintained by the employee.
ALTER TABLE "staff_profiles"
  ADD COLUMN IF NOT EXISTS "bloodGroup" TEXT;

-- Sanity check: should return 0 / 0 — nobody has set these yet.
SELECT
  (SELECT count(*) FROM "users" WHERE "avatarKey" IS NOT NULL)            AS photos_set,
  (SELECT count(*) FROM "staff_profiles" WHERE "bloodGroup" IS NOT NULL)  AS blood_groups_set;
