-- Holidays that run over more than one day.
--
-- Diwali is not one day and a shutdown week is not five separate rows. A
-- closure gets an optional last day, so it stays one row with one name.
--
-- One nullable column. NULL means a single-day closure, which is every row
-- already in the table, so nothing existing changes meaning.
--
-- Additive and guarded: safe to run before the deploy, and safe to run more
-- than once.

ALTER TABLE holidays
  ADD COLUMN IF NOT EXISTS "endDate" DATE;

-- Should report every existing holiday as a single day, and the column
-- present. If this SELECT errors, the ALTER above did not run.
SELECT
  count(*)                                    AS holidays,
  count("endDate")                            AS spanning_several_days,
  count(*) FILTER (WHERE "endDate" IS NULL)   AS single_day
FROM holidays;
