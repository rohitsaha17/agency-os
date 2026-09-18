-- How much of an advance comes back each month.
--
-- Run against PRODUCTION, in the Supabase SQL editor. Paste the whole file.
-- Safe to run twice: the statement is guarded.
--
-- PURELY ADDITIVE. One nullable column on one existing table. No row is
-- touched and nothing is backfilled, so the currently-deployed app keeps
-- working either side of it.
--
-- WHY IT EXISTS
--
-- The Advances screen could say what was lent and what is left, but not the
-- one thing anybody asks next: how long until it is clear. The answer needs a
-- monthly recovery figure, and there was nowhere to put one — so the screen
-- either stayed silent or the number had to be invented, and an invented
-- repayment plan is worse than none.
--
-- WHY NULLABLE, WITH NO DEFAULT
--
-- "Take it out of the next payroll" is a real arrangement and the commonest
-- one for a small advance. A default of any kind would write a repayment
-- schedule onto every existing row that nobody agreed to, and the UI would
-- then present it as fact. Null means exactly what it should: nobody set one.
-- The Advances table shows an em dash for those, and the estimate is simply
-- not offered.
--
-- WHAT IT IS NOT
--
-- It does not move money. Payroll still asks what to deduct for the month and
-- caps it at what is actually outstanding and at the gross — see payslip() in
-- lib/hr.ts, which is unchanged. This column is the figure the payroll screen
-- offers as a starting point, not a standing instruction that runs on its own.
-- Automating recovery is a decision about somebody's pay, and it should stay a
-- decision a person makes each month.
--
-- Expect: 1 column added, then a final row reading 0 (nobody has set one yet).

BEGIN;

ALTER TABLE "staff_advances"
  ADD COLUMN IF NOT EXISTS "recoveryAmount" DECIMAL(12,2);

COMMIT;

-- Check it landed. Expect one row, count 0.
SELECT count(*) AS advances_with_a_recovery_plan
FROM "staff_advances"
WHERE "recoveryAmount" IS NOT NULL;
