-- The office holiday list.
--
-- A new table only. Nothing existing is altered, so this is safe to run
-- before the deploy and safe to run more than once.
--
-- `date` is DATE, not TIMESTAMP, on purpose: a holiday is a calendar day, and
-- storing it as an instant is how 2 October displays as the 1st for anybody
-- west of the workspace.

CREATE TABLE IF NOT EXISTS holidays (
  id               TEXT         PRIMARY KEY,
  "organizationId" TEXT         NOT NULL
                     REFERENCES organizations(id) ON DELETE CASCADE,
  date             DATE         NOT NULL,
  name             TEXT         NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "holidays_organizationId_date_name_key"
  ON holidays ("organizationId", date, name);

CREATE INDEX IF NOT EXISTS "holidays_organizationId_date_idx"
  ON holidays ("organizationId", date);

-- Should report the table present and empty.
SELECT count(*) AS holidays FROM holidays;
