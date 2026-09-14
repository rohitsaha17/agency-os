# Performance baseline — measured 2026-09-14, before any change

All timings are medians of 12 requests from a residential connection in India
against production (`studio-flow.vibrnd.in`), warmed first.

## The three numbers everything else follows from

| What | Median TTFB | What it isolates |
|---|---|---|
| Edge static asset (`/_next/static/css/…`) | **254 ms** | India → Vercel Mumbai edge. The floor. |
| `/api/users/me`, no cookie (0 DB queries) | **480 ms** | + reaching the function and running it |
| `/api/users/me`, bogus cookie (1 DB query) | **673 ms** | + one database round trip |

Derived:

- **+226 ms** to reach the serverless function and back, on top of the edge.
- **+193 ms per database round trip.**

The no-cookie path returns 401 before touching Postgres; the bogus-cookie path
runs exactly one `user.findUnique` and then returns the same 401. The only
difference between them is one query, so the 193 ms is a clean measurement of
the function↔database round trip and nothing else.

## Where the code runs

```
X-Vercel-Id: bom1::iad1::xgc4h-…
             ^^^^  ^^^^
             edge  function
```

Requests enter at **bom1 (Mumbai)** and the function executes in **iad1
(Washington DC)**. Every user of this product is in India.

193 ms is also roughly Virginia↔Mumbai. So the database is not near the
function either: the function sits in the US between users in India and a
database that is not in the US.

## What this means for the audit

A database round trip costs **193 ms of user-visible time**. Not 1 ms. So the
thing to count in server code is not how much data a query returns — at ten
small tenants that is nothing — but **how many times the code stops and waits**.

Sequential round trips per GET handler, counted from source:

| Handler | Round trips | Cost at 193 ms |
|---|---|---|
| `/api/dashboard/v3` | 6 (+1 auth) | ~1.35 s |
| `/api/files/stats` | 6 (+1 auth) | ~1.35 s |
| `/api/reports/v3` | 5 (+1 auth) | ~1.16 s |
| every other endpoint | 1 auth minimum | 193 ms |

## Client-side duplication

`useCurrentUser()` caches in a module variable but has no in-flight dedupe, so
every consumer mounting on the same first paint fires its own request. 24 files
call it; `Sidebar` fetches `/api/users/me` directly on top of that.

Pages then wait for that user before starting their own fetch
(`useEffect(() => { if (currentUser) fetchAll(); }, [currentUser])`), which makes
the identity call a **blocking serial hop** in front of every page's real data.

## Bundle size — not the problem

Largest route 188 kB first load; shared baseline 102 kB. No route is bundle-bound.
Phase 13 work would be effort spent where there is nothing to win.
