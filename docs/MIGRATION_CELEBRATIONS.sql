-- Birthday and work-anniversary notices.
--
-- Additive and guarded. One nullable column and one unique index; every
-- existing notification keeps a NULL there, and Postgres treats NULLs as
-- distinct, so nothing already in the table can collide.
--
-- Safe to run more than once. Safe to run BEFORE the deploy: the currently
-- running code does not know the column exists.

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS "dedupeKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "notifications_dedupeKey_key"
  ON notifications ("dedupeKey");

-- Should report every existing row with a NULL key, and the index present.
SELECT
  count(*)                                   AS notifications,
  count("dedupeKey")                         AS with_a_key,
  count(*) FILTER (WHERE "dedupeKey" IS NULL) AS without_one
FROM notifications;
