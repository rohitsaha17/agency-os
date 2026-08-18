# STUDIO FLOW V2 — MASTER CONTEXT (read this FIRST in every Claude Code session)

> **Save this file at `docs/V2_CONTEXT.md` in the repo.** Every phase prompt begins with "Read docs/V2_CONTEXT.md". If a `CLAUDE.md` exists at the repo root, add the line: *"Before any v2 work, read docs/V2_CONTEXT.md."*

---

## 0. Prime directive — do not break what works

This is a **working app with a working v1**. Every v2 change must be **additive**:

- **Never** drop, rename, or repurpose existing DB columns, models, enums, API routes, or pages. Add new ones.
- **Never** change the signature/response shape of an existing API route in a way that removes fields v1 UI reads (adding fields is fine; conditionally *stripping* fields for permission reasons is a specified v2 feature).
- Prisma: additive migrations only (`prisma migrate dev` with a descriptive name). Existing seed/demo data must load and render after every migration. When a column must become optional (e.g., `Task.projectId`), loosen it — never tighten or delete.
- New UI = new components/routes; when touching an existing page, extend it (new tab, new button, new section) rather than rewriting it. Match the existing design system (same card/button/badge/tab components, light+dark styles).
- After finishing any phase: run the build/typecheck, fix all errors, and confirm the v1 smoke test still passes (see the playbook's "Golden Path").
- Reuse before rebuilding: extract the existing `/calendar` month grid into **one shared calendar-grid component** the first time a new calendar needs it, then reuse it everywhere.
- Every status change of anything (task, content item, booking, invoice, contract) must be written to `StatusHistory` via the shared `logStatus()` helper.
- All permission rules are enforced **in API route handlers** (server-side), with UI hiding as a second layer only.

---

## 1. What the app is today (v1 — all of this must keep working)

**Vibrnd Studio Flow** — agency management platform. Next.js App Router, `(dashboard)` route group, REST handlers under `app/api/*`, Prisma models with cuid ids, org-scoped multi-user auth (roles OWNER/ADMIN/MANAGER/MEMBER).

Existing pages and their jobs:

| Route | Module (v1 behavior to preserve) |
|---|---|
| `/` | Dashboard: KPI cards, quick actions, needs-attention, task overview, project health, recent activity |
| `/clients`, `/clients/new`, `/clients/[id]` | Client CRM: stats, cards, 12-tab detail (Overview w/ financial summary, Contacts, Brand, Tax & Billing, Projects, Quotations, Invoices, Receipts, Expenses, Files, Chat, Contracts), Edit/Archive |
| `/projects`, `/projects/new`, `/projects/[id]` | Projects: One-Time/Retainer, budget, tabs (Tasks List+Kanban w/ subtasks & task drawer, Files, Expenses, Contracts, Chat, Invoices, Tax & Billing), PDF export, Generate Tasks |
| `/tasks` | Global task list grouped Overdue / No Due Date / Completed with client/project/status/priority filters |
| `/messages` | Slack-style channels (General / Project-team / Project-with-client / Client types), unread-count polling |
| `/calendar` | Month/Week calendar of tasks + project spans, filters, day side-panel |
| `/files` | Files & Assets: folders, project/client scoping, statuses Draft/In Review/Approved/Changes Required, full-screen review (pin comments, versions, Approve/Request Changes) |
| `/quotations`, `/quotations/new`, `/quotations/[id]` | Quotation lifecycle Draft→Sent→Approved→…→Converted, line items, discount+tax, PDF, **Convert to Project** |
| `/rate-cards` | Service pricing catalog by category |
| `/stakeholders` | Freelancers/Agencies/Vendors/Internal directory linked to expenses & contracts |
| `/expenses` | Expense tracking: categories, statuses Pending→Approved→Paid/Rejected, inline status change |
| `/contracts`, `/contracts/[id]` | Contracts & NDAs: types, statuses Draft→Sent→Partial→Signed, per-party Mark Signed, PDF |
| `/invoices` | Invoices: Draft/Sent/Overdue/Paid/Cancelled, inline status, stats |
| `/settings` | Organization identity + regional (currency/timezone/date), Letterhead PDF designer (7 templates, live preview), Users (role per member), Roles matrix, Account password |
| `⌘K` | Global search across clients/projects/files (`/api/search?q=`) |

Existing key models (do not break): Organization, User, Client, ClientContact, Project, Task (statuses TODO/IN_PROGRESS/IN_REVIEW/DONE/BLOCKED; priorities LOW/MEDIUM/HIGH/URGENT; subtasks via parent; assignees; manager/reviewer), File (+versions/comments), Channel/Message, Quotation(+items), Invoice, Receipt, Expense, Contract(+parties), RateCard, Stakeholder.

---

## 2. What v2 adds — the vision in one paragraph

We are turning Studio Flow into a **social-media agency operating system**. The heart of it: **every client gets exactly ONE Content Calendar** where the Social Media Manager plans the client's whole month — day by day, each entry saying *what type of creative* (post/reel/story/shoot…), *the topic*, *description*, *references*. **Any client work starts life as an entry on that calendar.** From an entry, the SMM clicks **"Assign task"** → a real Task is created (topic/content/reference prefilled, linked back to the entry), routed through Head-of-Design approval when a preference was given, and lands on the assignee — where it **automatically appears on that person's personal daily calendar** (a Google-Calendar-style "My Calendar" that is each user's to-do home: their tasks, reminders they add, and to-dos seniors drop onto their day). Above it all sits a **Master Content Calendar** merging every client's plan into one filterable, access-controlled view with a festival/events layer. Around this spine: per-client packages with monthly creative quotas, extra-deliverable tracking that flows into invoicing (include/exclude/free), two-stage approval (team → client via shareable link), carry-forward of approved-but-unposted content, delivery-proof on completion (file/link/WhatsApp/Slack), deadline-miss digests per role, POC/SME follow-ups, and a photographer booking calendar.

### The spine (this exact flow must always work end-to-end)

```
SMM opens Client ▸ Content Calendar (ONE per client)
   └─ adds entry on a date: creative type + topic + description + reference
        └─ [Assign task] → Task auto-created (fields prefilled, linked to entry)
              └─ (optional) preferred editor/designer → Head of Design approves/reassigns
                    └─ Task appears on assignee's MY CALENDAR (their daily view)
                          └─ assignee works, completes with delivery proof
                                └─ entry: IN_REVIEW → TEAM_APPROVED → CLIENT_APPROVED
                                      └─ SCHEDULED → POSTED  (else MISSED → carry-forward)
Master Calendar = all clients' entries in one view (filters + access levels)
```

### The three calendars (they are different lenses, not copies)

1. **Client Content Calendar** — tab on each client (ONE per client). Publishing plan. Owned by SMM. Source of all client work.
2. **Master Content Calendar** — evolved `/calendar`. All clients combined; filters: client, project, creative type, status, assignee, extra-only, ad-hoc-only; access-filtered (members see only their own linked work); festival/event strips; old task/project layers behind toggles.
3. **My Calendar** — `/my-calendar` per user, Google-Calendar-like day/week/month. Aggregates: my tasks (by due date), content entries linked to me, my bookings, events, my follow-ups, personal reminders. Inline complete. Seniors can add to-dos to someone else's calendar (with notification).

**Content calendar ≠ task calendar**: `ContentItem` (what publishes, when) and `Task` (who does the work, by when) are separate linked models. Tasks may also exist standalone — no client, no project ("general tasks").

---

## 3. v2 data model (all additive)

**Modified models** (new columns only):

- `Client`: + `currency?` (overrides org currency everywhere client-scoped), + `importance` (NORMAL/IMPORTANT/VIP).
- `User`: + `designation?` — enum `SMM | DESIGNER | EDITOR | HEAD_OF_DESIGN | PHOTOGRAPHER | SME | POC | OTHER`. Drives routing & report targeting. Permission level (Admin/Manager/Member) unchanged.
- `Task`: + `topic?`, `content?` (brief/caption), `referenceUrl?`, `referenceFileId?`, `extraNote?`, `clientId?` (direct, optional), `projectId` → optional, `contentItemId?`, `preferredAssigneeId?`, `assignmentStatus` (NONE/PENDING_HEAD_APPROVAL/APPROVED/REASSIGNED), `sortOrder` (drag-drop rank per assignee), `isAdHoc`.
- `Invoice`: line items gain `kind` (PACKAGE/EXTRA/CUSTOM), `isFree`, `contentItemId?`.
- `ContentItem` gains `invoicedInId?` when billed.

**New models:**

| Model | Purpose |
|---|---|
| `CreativeType` | Org catalog: Post, Carousel, Reel, Story, Video, Photo Shoot (countsAsShoot=true), Blog, Other — editable in Settings |
| `ContentItem` | One planned deliverable on a client's content calendar: clientId, date, creativeTypeId, topic, description, reference (url/file), status, isExtra, isAdHoc, carriedFromId, postedAt, teamApprovedAt, clientApprovedAt, reviewToken (phase 10) |
| `ClientPackage` + `PackageQuota` | The client's social package: billing amount + per-creative-type monthly quantities (e.g., 12 posts, 4 reels, 1 shoot) |
| `StatusHistory` | Universal audit: entityType, entityId, from→to, who, when, note |
| `TaskDelivery` | Completion proof: FILE_UPLOAD / LINK / WHATSAPP / SLACK / OTHER + file/url/note |
| `ChangeRequest` | "Assign changes": note on what to change, task flips back, tracked OPEN/RESOLVED |
| `CalendarEvent` | FESTIVAL / CAMPAIGN / SHOOT / INTERNAL / OTHER events; optional client; reminderDaysBefore; isAdHoc (sudden shoots) |
| `Booking` | Photographer bookings: photographer(User), client?, time range, location, REQUESTED→CONFIRMED→COMPLETED/CANCELLED, conflict-checked |
| `PersonalItem` | My-Calendar reminders/to-dos; createdById may differ from userId (senior adds to teammate) |
| `Notification` | In-app notification center (bell + /notifications page) |
| `FollowUp` | POC/SME client follow-ups with due dates |

**ContentItem status pipeline** (every transition logged + timestamped):
`PLANNED → ASSIGNED → IN_PROGRESS → IN_REVIEW → TEAM_APPROVED → CLIENT_APPROVED → SCHEDULED → POSTED`, with `MISSED` when date passes unposted. Carry-forward clones an approved-but-unposted item to next month (`carriedFromId`), marks the original MISSED with a note.

---

## 4. Roles & visibility (hard rules)

- Permission tiers stay: OWNER/ADMIN, MANAGER, MEMBER. `designation` is a job label, not a permission.
- **MEMBER never sees financials or client contacts** — enforced server-side: no FINANCE nav, no budgets/margins/amounts (quotations, invoices, receipts, expenses, package billing), no dashboard money cards, no client Contacts tab, contact fields stripped from client API payloads. Quota *counts* are fine (not money).
- Head-of-Design approval queue: visible to `designation=HEAD_OF_DESIGN` + Admins.
- Master Calendar access filter: Admin/Manager see all; Member sees only content items with a task assigned to them + org-wide events.
- Client approval: via tokenized public review link (no login) — plus a manual "Mark client approved" fallback for SMM/POC/Admin.
- Notifications v1 = in-app only. WhatsApp/Slack on task completion = **proof marking**, not real integrations.

---

## 5. Phase index (details + prompts + manual checks live in the playbook)

| Phase | Name | Delivers |
|---|---|---|
| 0 | Safety net | Context file committed, baseline build green, golden-path recorded |
| 1 | Foundations | Client currency, member visibility rules, StatusHistory, notification bell |
| 2 | Task System 2.0 | New task fields, general tasks, head-approval routing, change requests, drag-drop queue, delivery proof |
| 3 | **Client Content Calendar** | ONE calendar per client; plan month; **Assign task from entry**; approvals; carry-forward |
| 4 | **My Calendar** | Personal Google-style calendar; tasks auto-appear; reminders; seniors add to-dos |
| 5 | Master Calendar + events | All clients combined, filters, access levels, festival pack, ad-hoc events |
| 6 | Packages & quotas | Per-client creative quotas, usage meters, EXTRA flagging, carry-forward math |
| 7 | Invoicing extras | Invoice = package + extras with include/exclude/free, client currency |
| 8 | Notifications engine | Miss detection, daily/weekly/monthly role digests, follow-ups, reports |
| 9 | Booking calendar | Photographer lanes, conflict checks, feeds master + my calendars |
| 10 | Review links + hardening | Client approve/request-changes via share link; permission audit; polish |

Build order is 0→10. Phases 4/5 may swap, 8/9 may swap; 6 must precede 7. The spine is complete after Phase 4.

---

## Naming corrections (verified against the real schema in Phase 0)

- Model and enum names match this document: `Task`, `Client`, `Invoice`; `TaskStatus` (TODO/IN_PROGRESS/IN_REVIEW/DONE/BLOCKED), `InvoiceStatus` (DRAFT/SENT/PAID/OVERDUE/CANCELLED), `UserRole` (OWNER/ADMIN/MANAGER/MEMBER). The task priority enum is named **`Priority`** (not `TaskPriority`), values LOW/MEDIUM/HIGH/URGENT.
- Database: PostgreSQL (`datasource db { provider = "postgresql" }`, URL resolved via prisma.config.ts / lib/db-url.ts).
- **Migration workflow correction:** `prisma migrate dev/deploy` is broken on a fresh DB — the checked-in `20260404_baseline` migration re-creates enums the earlier `init` migration already created ("type UserRole already exists"). The project's effective workflow (used in production per prisma/manual-migrations/*.sql) is **`prisma db push` + idempotent manual SQL files**. v2 phases should apply schema changes with `npx prisma db push` (plus an idempotent SQL file in prisma/manual-migrations/ mirroring the change for production), instead of `prisma migrate dev`.
