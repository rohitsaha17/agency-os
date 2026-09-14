-- Indexes for foreign keys and join columns that queries filter on daily.
--
-- Run against PRODUCTION, in the Supabase SQL editor.
-- Safe to run twice: every statement is IF NOT EXISTS.
-- Purely additive — no column, constraint or row is touched, so the currently
-- deployed app keeps working either side of it.
--
-- These were CREATE INDEX CONCURRENTLY, which is the careful way to add an
-- index to a live table: it doesn't block writes. It also cannot run inside a
-- transaction block, and the Supabase SQL editor puts everything in one — so
-- that version fails on arrival with "CREATE INDEX CONCURRENTLY cannot run
-- inside a transaction block" and nothing gets created.
--
-- Plain CREATE INDEX takes a SHARE lock instead: reads carry on, writes to
-- that one table wait until the index is built. On these tables — a few
-- hundred to a few thousand rows each — that is a fraction of a second. If you
-- ever run this against a table with millions of rows, go back to
-- CONCURRENTLY and run it through psql rather than the editor.
--
-- Honest expectation: at current volumes this is worth single-digit
-- milliseconds per query. It is not why the app felt slow — a database round
-- trip costs ~152ms (docs/perf/RESULTS.md), which dwarfs a sequential scan
-- over a few hundred rows. It is here because Postgres never indexes a
-- foreign key for you and these tables only grow. Cheap now, not later.
--
-- The names match Prisma's own convention, so `prisma db push` will see these
-- as already present rather than trying to create them again.
--
-- Expect: 8 × CREATE INDEX, then a final table of 8 rows.

BEGIN;

-- "Which projects am I the SMM on" gates the dashboard, the team calendar and
-- reports. project_members is keyed (projectId, userId), so asking by userId
-- alone — the second column — could not use that index at all.
CREATE INDEX IF NOT EXISTS "project_members_userId_idx"
  ON "project_members" ("userId");

-- The sidebar's unread badge asks by userId, once a minute, for every user.
CREATE INDEX IF NOT EXISTS "channel_members_userId_idx"
  ON "channel_members" ("userId");

-- No invoice is ever loaded without its lines.
CREATE INDEX IF NOT EXISTS "invoice_line_items_invoiceId_idx"
  ON "invoice_line_items" ("invoiceId");

-- Message history, in order, within a channel.
CREATE INDEX IF NOT EXISTS "chat_messages_channelId_createdAt_idx"
  ON "chat_messages" ("channelId", "createdAt");

-- Opening a task reads its comments in order.
CREATE INDEX IF NOT EXISTS "comments_taskId_createdAt_idx"
  ON "comments" ("taskId", "createdAt");

CREATE INDEX IF NOT EXISTS "file_comments_fileId_idx"
  ON "file_comments" ("fileId");

CREATE INDEX IF NOT EXISTS "client_contacts_clientId_idx"
  ON "client_contacts" ("clientId");

CREATE INDEX IF NOT EXISTS "time_entries_taskId_idx"
  ON "time_entries" ("taskId");

COMMIT;

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
