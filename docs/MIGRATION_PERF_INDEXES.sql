-- Indexes for foreign keys and join columns that queries filter on daily.
--
-- Run against PRODUCTION. Safe to run twice: every statement is guarded.
-- Purely additive — no column, constraint or row is touched, so the currently
-- deployed app keeps working either side of it.
--
-- CONCURRENTLY, and therefore NO transaction: a plain CREATE INDEX takes an
-- exclusive lock on the table for its duration. These tables are small enough
-- that it would be over in milliseconds, but "milliseconds" is a guess about
-- someone else's data and this runs against ten live agencies. CONCURRENTLY
-- cannot run inside BEGIN/COMMIT, which is why there isn't one here.
--
-- Honest expectation: at current volumes this is worth single-digit
-- milliseconds per query. It is not the reason the app felt slow — a database
-- round trip from the function's region costs ~193ms (docs/perf/BASELINE.md),
-- which dwarfs any sequential scan over a few hundred rows. This is here
-- because Postgres never indexes a foreign key for you and these tables only
-- grow. Fix it now while it is cheap, not when it is urgent.
--
-- Expect: 8 × CREATE INDEX, then a listing of the new indexes.

-- "Which projects am I the SMM on" gates the dashboard, the team calendar and
-- reports. project_members is keyed (projectId, userId), so asking by userId
-- alone could not use that index at all.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "project_members_userId_idx"
  ON "project_members" ("userId");

-- The sidebar's unread badge asks by userId, once a minute, for every user.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "channel_members_userId_idx"
  ON "channel_members" ("userId");

-- No invoice is ever loaded without its lines.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "invoice_line_items_invoiceId_idx"
  ON "invoice_line_items" ("invoiceId");

-- Message history, newest-first within a channel.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "chat_messages_channelId_createdAt_idx"
  ON "chat_messages" ("channelId", "createdAt");

-- Opening a task reads its comments in order.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "comments_taskId_createdAt_idx"
  ON "comments" ("taskId", "createdAt");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "file_comments_fileId_idx"
  ON "file_comments" ("fileId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "client_contacts_clientId_idx"
  ON "client_contacts" ("clientId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "time_entries_taskId_idx"
  ON "time_entries" ("taskId");

-- Check they landed. Expect 8 rows.
SELECT tablename, indexname
FROM pg_indexes
WHERE indexname IN (
  'project_members_userId_idx',
  'channel_members_userId_idx',
  'invoice_line_items_invoiceId_idx',
  'chat_messages_channelId_createdAt_idx',
  'comments_taskId_createdAt_idx',
  'file_comments_fileId_idx',
  'client_contacts_clientId_idx',
  'time_entries_taskId_idx'
)
ORDER BY tablename;
