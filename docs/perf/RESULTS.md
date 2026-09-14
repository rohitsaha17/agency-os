# Performance audit — what was wrong, what changed, what it cost

Measured 2026-09-14 against production from a residential connection in India.
Method for both rounds: `curl`, a fresh connection per request, spaced 2s, with
a browser user-agent, median of 10–12. Every response was checked to be a real
app response (401/200) — Vercel's bot challenge answers a fast burst with a 403
HTML page, and a run that gets challenged measures the edge firewall rather
than the application. One earlier round had to be thrown away for exactly that.

## Root causes

**1. The function ran in the wrong hemisphere.** `X-Vercel-Id` read
`bom1::iad1` — requests entered at the Mumbai edge and executed in Washington
DC. Every user of this product is in India, and the database was not in the US
either, so the function sat in the middle of two things that were near each
other. Every request crossed the Atlantic twice, and every query crossed it
again.

**2. A database round trip cost 193 ms, and the code spent them like they were
free.** The dashboard issued fourteen queries in six groups awaited one after
another, none of which needed anything from the group before it.

**3. `Promise.all` was decorative.** `pg` serialises queries over a connection
and the pool was capped at `max: 1`. Every parallel group in the codebase was a
queue wearing a costume — including the ones already written correctly.

**4. Identity was fetched repeatedly, and blocked everything behind it.**
`useCurrentUser` cached the settled value but not the in-flight promise, so on a
fresh load the sidebar, the notification bell, the capability guard and the page
each fired their own identical `/api/users/me`. That endpoint then authenticated
with one `user.findUnique` and immediately ran a second, wider one for the same
row. And pages are written `useEffect(() => { if (user) load() }, [user])`, which
put the whole thing in front of every page's real data as a blocking hop.

**5. Two 60-second polls ran forever in every background tab.** `useLiveRefresh`
already checked `document.visibilityState`; the sidebar's unread count and the
notification bell did not.

## Before / after

The edge asset is the control — it measures my own connection, which was not
identical between the two rounds. Subtracting it isolates what the application
actually costs.

| | Before | After |
|---|---:|---:|
| Edge static asset (control) | 254 ms | 143 ms |
| API, 0 database queries | 480 ms | 165 ms |
| API, 1 database query | 673 ms | 317 ms |
| **Reaching the function** (API − edge) | **226 ms** | **22 ms** |
| **One database round trip** (1q − 0q) | **193 ms** | **152 ms** |

Server-side cost of the simplest possible authenticated request —
reach the function, do one query: **419 ms → 174 ms, a 58% cut**, before any
reduction in the number of queries.

The query-count work multiplies on top of that:

| Endpoint | Round trips before | After |
|---|---|---|
| `/api/dashboard/v3` | 14, strictly sequential | 1 auth + 1 parallel wave |
| `/api/files/stats` | 6, strictly sequential | 1 auth + 2 waves |
| `/api/users/me` | 2 | 1 |
| First page load, identity | 2–4 duplicate calls | 0 — seeded by the server |

At the old 193 ms, the dashboard's fourteen sequential trips were ~2.7 s of
pure waiting. That is the number the page everybody opens first was paying.

## Changes

- `vercel.json` pins functions to `bom1`. Largest single change, one line to undo.
- `lib/prisma.ts` — pool size decided by the pooler port: 5 on Supabase's
  transaction pooler (6543), which multiplexes onto far fewer real backends; 2
  on the session pooler or a direct connection (5432), where each connection is
  a real Postgres backend and five per instance across a dozen warm lambdas
  would exhaust a small one. `DB_POOL_MAX` overrides.
- `app/api/dashboard/v3` — six awaited groups into one parallel group, keyed
  rather than positional. Capability guards still decide what is *built*, so
  money is still never computed for anyone without `financials.view`. The
  response shape is byte-identical (diffed).
- `app/api/files/stats` — six sequential queries into two waves. Only the name
  lookups ever depended on anything.
- `lib/current-user.ts` — the org is joined into the auth lookup instead of
  fetched separately. `/api/users/me` is now one round trip, and every route has
  the tenant's currency, timezone and date format without asking again.
- `lib/useCurrentUser.ts` — caches the in-flight promise, not just the answer.
- `components/layout/CurrentUserSeed.tsx` — the layout already resolved this
  user from the cookie to decide whether to let you in, so it hands the answer
  to the client during render. Same user, same cookie, same server code; it
  changes when the answer arrives, not what it is.
- Sidebar and notification bell poll only while the tab is visible.
- Eight indexes on foreign keys and join columns that are filtered daily and had
  none (`docs/MIGRATION_PERF_INDEXES.sql`). `project_members` is keyed
  `(projectId, userId)` and the daily question is "which projects am I the SMM
  on" — by `userId`, the second column, so it had no usable index at all.
- `app/api/platform/perf` — behind the existing platform admin key, times
  `SELECT 1` once, five times in series and five in parallel.

## Deliberately not changed

**Bundles.** Largest route 188 kB first load, shared baseline 102 kB. Nothing is
bundle-bound. Code-splitting work here would be effort spent where there is
nothing to win.

**`/api/reports/v3`.** A static scan counted five sequential queries; reading it
showed five mutually exclusive `if (report === …)` branches, one query per
request. Nothing to fix.

**The tasks board's payload.** `/api/tasks?includeCompleted=true&all=1` returns
every task in the org including completed ones, with `include:` rather than
`select:` so every scalar column comes too, and refetches every 25 s while the
tab is visible. This is the one genuine over-fetch left. Narrowing it changes
what the board can render and what a refetch costs, and I could not measure the
payload without a session — so it is a recommendation below, not a guess applied
to production.

## Still open

**Indexes are P2, and saying otherwise would be dishonest.** At ten small
tenants a sequential scan over a few hundred rows is worth single-digit
milliseconds against a 152 ms round trip. They are in because Postgres never
indexes a foreign key for you and these tables only grow.

**152 ms per query is still high** for a function and a database that should be
near each other. `/api/platform/perf` answers whether that is distance or the
pooler; it needs the `PLATFORM_ADMIN_KEY` set in Vercel.

**Parallelism is unverified in production.** The code is correct and the pool is
wide enough on 6543, but `fiveParallel` vs `fiveSerial` from the probe is what
proves it rather than assumes it.

**Authenticated page timings are unmeasured.** Everything above is the
unauthenticated path, which isolates the infrastructure cleanly but is not what
a user experiences. The console snippet in the handover measures real pages.
