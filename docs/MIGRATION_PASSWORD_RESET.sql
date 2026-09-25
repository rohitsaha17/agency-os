-- Admin-initiated password resets.
--
-- Run against PRODUCTION, in the Supabase SQL editor. Paste the whole file.
-- Safe to run twice: the statement is guarded.
--
-- PURELY ADDITIVE. One column with a default on one existing table. No row is
-- rewritten and nothing is backfilled, so the currently-deployed app keeps
-- working either side of it — an app that has never heard of this column
-- simply never sets it, and every existing account reads as false.
--
-- WHY IT EXISTS
--
-- There was no forgot-password flow at all. A locked-out user needed somebody
-- with database access to run an UPDATE by hand
-- (scripts/make-password-reset.ts prints one). That is fine for the owner
-- once; it is not a way to run a team.
--
-- WHY NOT JUST CLEAR passwordHash
--
-- Because that is an account takeover waiting to happen. POST
-- /api/auth/set-password lets ANYONE who knows the email address set a
-- password on an account that has none — which is correct for a fresh invite,
-- where the account holds nothing yet, and dangerous for a reset, where it
-- holds a year of somebody's work. Clearing the hash would leave a live
-- account claimable by a stranger until the real user happened to get there
-- first.
--
-- So a reset sets a real temporary password instead, generated on the server
-- and shown to the admin once. Nothing is claimable; you need the credential.
--
-- WHAT THIS COLUMN IS FOR
--
-- A temporary password means that, for a while, somebody other than the
-- account holder knows how to sign in as them. This closes that window: the
-- temporary password works exactly once, and the screen straight after it is
-- "choose a new one". Sign-in sets the flag in the response, and changing the
-- password clears it.
--
-- Expect: 1 column added, then a final row reading 0.

BEGIN;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

COMMIT;

-- Check it landed. Expect one row, count 0 — nobody has been reset yet.
SELECT count(*) AS accounts_awaiting_a_password_change
FROM "users"
WHERE "mustChangePassword" = true;
