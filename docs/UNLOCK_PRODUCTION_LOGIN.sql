-- Unlock the owner account on studio-flow.vibrnd.in
--
-- Run this against the PRODUCTION database (the one Vercel's DATABASE_URL
-- points at), not your local one.
--
-- What it does: clears the stored password. It does NOT set a new one.
--
-- app/api/auth/login/route.ts returns { needsPasswordSetup: true } when
-- passwordHash is null, and app/login/page.tsx switches to its setup step —
-- so the next time you enter your email, the site asks you to choose a new
-- password yourself. Nobody has to invent one for you, and it never travels
-- through a chat window or a support ticket.
--
-- Verified against a local copy: clearing the hash produced
--   200 {"needsPasswordSetup":true,"email":"…"}
--
-- Safe: touches one column on one row, and no other data.

BEGIN;

UPDATE users
   SET "passwordHash" = NULL
 WHERE lower(email) = lower('vibrnd2@gmail.com');

-- Expect: UPDATE 1
--   UPDATE 0  -> that email isn't in this database. ROLLBACK and check
--                which database you're connected to.
--   UPDATE 2+ -> duplicate accounts. ROLLBACK and look before continuing.

COMMIT;

-- Then: open https://studio-flow.vibrnd.in/login, enter vibrnd2@gmail.com,
-- and the site will prompt you to set a new password.
