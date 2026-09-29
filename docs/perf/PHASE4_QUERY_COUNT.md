# Phase 4 — query-count hardening (measure-first)

Follows the 2026-09-14 latency work in `RESULTS.md`. That round cut the cost of
a single round trip (193 ms → 152 ms in production) and parallelised the big
endpoints. This round attacks a different axis: the *number* of round trips a
request makes, and the number of requests a background tab makes on its own.

## How this was measured, and what the numbers mean

Local, against a throwaway two-tenant PGlite instance, counting the
`prisma:query` lines the dev server logs around one warmed request. **Query
counts are deterministic and meaningful; the millisecond figures are not** —
PGlite is in-process and has none of the network cost that dominates
production. The value of removing a query is set by production's round-trip
cost, which `RESULTS.md` measured at **~152 ms**. So "N queries → 1" locally
reads as "(N−1) × ~152 ms" in production.

Evidence classes used below: **A** = confirmed against production; **B** =
reproduced locally with numbers; **C** = certain from the code (query shape /
control flow); **D** = hypothesis, not yet proven.

## Baseline (clean two-tenant seed)

| Endpoint | queries |
|---|---:|
| `unread-count` (editor, 1 channel) | 5 |
| `unread-count` (admin, 0 channels) | 4 |
| `dashboard` v1 (admin) | 31 |
| `dashboard/v3` (admin) | 29 |
| `dashboard/v3` (smm) | 19 |
| `tasks?all=1` (admin) | 13 |
| `projects` (admin) | 8 |
| `users/me` (admin) | 3 |

## Fixed

### PERF-004 / QA-011 — `unread-count` was N+1 · **B + C**, production impact **A**

`GET /api/channels/unread-count` looped over the caller's memberships and issued
one `chatMessage.count` **per channel**. Query count grew linearly with how many
channels you belong to.

Proven locally by putting the admin in 12 channels:

| user | before | after |
|---|---:|---:|
| admin, **12 channels** | **16** | **5** |
| editor, 1 channel | 5 | 5 |

The returned total is unchanged (36 for the 12-channel admin — 12 channels × 3
unread messages). The fix collapses the per-channel loop into a single `count`
whose `where` is an `OR` of per-channel `(channelId + that channel's lastReadAt
cutoff)` branches, with `authorId != caller` as an outer `AND`. Memberships are
unique per `(userId, channelId)`, so no message matches two branches — no
double count.

Why this one matters most: the sidebar badge polls this endpoint **once a
minute for every logged-in user**. Before, a user in 12 channels spent 13 round
trips a minute here (~2 s of pure waiting at 152 ms each, every minute, per
user); now it is a constant 2 regardless of channel count. This is the endpoint
the earlier round indexed (`channel_members_userId_idx`,
`chat_messages_channelId_createdAt_idx`) but did not de-N+1.

### PERF-003 — dashboard auto-refresh polled hidden tabs · **C**

`app/(dashboard)/page.tsx` re-hit `/api/dashboard` (v1, ~31 queries) every two
minutes whether or not the tab was visible. The 2026-09-14 round gated the
sidebar and notification-bell polls on `visibilityState` but did not touch this
one. Now a hidden tab skips the tick and refreshes once when the viewer returns.
(`RoleBlocks`' `/api/dashboard/v3` fetches once on mount and never polls, so it
was never part of this.)

### PERF-005 — `useLiveRefresh` double-fired on tab return · **C**

Returning to a tab fires `focus` **and** `visibilitychange` back-to-back; both
were wired to the same refetch, so one user action triggered two full reloads on
the Tasks board and My Calendar. `onWake` now coalesces any wake within 1 s of
the previous one. The 25 s interval is far outside that window (untouched), and
the mutation-driven paths (local event, BroadcastChannel) call the callback
directly and are unaffected.

### PERF-007 — four additive indexes matching hot query shapes · **C** (magnitude **D** locally)

All `CREATE INDEX` only — no column, constraint or row touched; names match
Prisma's convention. Distinct from the eight FK indexes the earlier round added.

| index | serves |
|---|---|
| `tasks (organizationId, deletedAt, status)` | `GET /api/tasks` default list filter |
| `tasks (organizationId, deletedAt, dueDate)` | dashboard overdue/upcoming panels; task list ordering |
| `tasks (parentId)` | every subtask/children lookup (had **no** index before) |
| `status_history (organizationId, changedAt)` | activity feed (org-scoped, ordered by `changedAt`) |

Each maps to a verified WHERE/ORDER BY in the code. Honest caveat, same as the
earlier round's index note: at current tenant sizes a sequential scan over a few
hundred rows is single-digit milliseconds, so the *magnitude* is unproven
locally (**D**) and PGlite's planner is not Postgres's. They are in because the
shapes are right and these tables only grow — cheap now, not later. Migration:
`prisma/migrations/20260929010000_perf_indexes/`.

## Investigated and deliberately not changed

### PERF-008 — repeated identity lookups · already solved; React `cache()` would be a no-op

The audit lists repeated identity lookups. Tracing the code: within a **single**
request, identity is resolved exactly once (`requireAuth` → `getCurrentUser`;
no route or server component calls it twice). React `cache()` only dedupes
*within one request*, so it would remove zero queries here. The real duplication
was **across** requests on a page load, and the 2026-09-14 round already fixed
that at the layers that can: `useCurrentUser` caches the in-flight promise,
`CurrentUserSeed` seeds identity from the server render (2–4 duplicate
`/api/users/me` → 0), and `getCurrentUser` already does one widened `findUnique`
instead of two. Adding `cache()` now would be optimising without a measurable
gain, so it was left out.

### PERF-001 — 15 s pool `connectionTimeoutMillis` · needs production evidence

The audit hypothesises the 15 s timeout as a cause of stalls. It is a *ceiling*,
not a per-request cost, and nothing local can reproduce a saturated production
pool. `lib/prisma.ts` pool sizing was already tuned by port in the earlier round.
Changing a production reliability constant on a hypothesis is exactly what the
brief said not to do — left as-is pending the `/api/platform/perf` probe the
earlier handover set up.

### PERF-003 (full) / PERF-006 — dashboard consolidation & remaining waterfalls

`dashboard/v3` was already flattened to one parallel wave in the earlier round;
`dashboard` v1 (31 q) and v3 (29 q) are each already a single `Promise.all`, not
a waterfall. Merging v1 and v3 into one endpoint is a UI refactor (two
independent consumers: the page and `RoleBlocks`), not a query fix, and both are
live — out of scope for a measure-first pass.

## Verification

- `tsc --noEmit`: clean · `next build`: clean
- 13/13 static check scripts pass; route-guard audit side-effect reverted
- Local two-tenant regression: tenancy 17+17+11, session 18, setup-token 14,
  files 11, onboarding 8, **phase2 38, phase3 29** — all green (run in isolation;
  batching all suites trips the 10/60 s login rate-limiter, a test artifact)
- Re-measured on a clean seed: every endpoint's query count identical to
  baseline — no regressions introduced.
