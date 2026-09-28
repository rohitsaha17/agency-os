-- Holidays that run over more than one day.
--
-- One nullable column. NULL means a single-day closure, which is every row
-- already there, so nothing existing changes meaning.
--
-- Additive and guarded. Safe before the deploy, safe to run twice.

ALTER TABLE holidays
  ADD COLUMN IF NOT EXISTS "endDate" DATE;

-- Should report every existing holiday as a single day.
SELECT
  count(*)                                    AS holidays,
  count("endDate")                            AS spanning_several_days,
  count(*) FILTER (WHERE "endDate" IS NULL)   AS single_day
FROM holidays;
