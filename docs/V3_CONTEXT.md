# STUDIO FLOW V3 — MASTER CONTEXT (read this FIRST in every Claude Code session)

> Save at `docs/V3_CONTEXT.md`. **This file supersedes `docs/V2_CONTEXT.md`** — delete or archive that one, and point `CLAUDE.md` here.
> Every phase prompt starts with: *"Read docs/V3_CONTEXT.md fully and follow its Prime Directive."*

---

## 0. Prime directive

The app has a working v1 + a partially-built v2. V3 **re-shapes the flow around roles and projects**. Rules:

- **Additive by default.** Don't drop/rename existing columns, models, routes or pages unless a phase explicitly says to. Phase 0 is the *only* deliberately destructive phase (retiring four modules), and it exports data first.
- **Never break the demo data.** After every migration, the seeded org (Vibrnd Studio, clients Acme / Nova / Smokzy) must still load and render.
- **Server-side permissions.** Every capability check happens in the API route handler. UI hiding is a second layer, never the only layer.
- **One audit trail.** Every status change on anything (task, content item, cycle, invoice) writes `StatusHistory` via `logStatus()`. Accountability is a product requirement, not a nice-to-have.
- **Reuse components.** One shared month-grid, one task-detail drawer, one status-chip system. Don't fork UI per role — hide/disable by capability.
- After each phase: build/typecheck clean, then run the Golden Path in the playbook.

---

## 1. What v3 is

An agency operating system where **the project is the commercial unit**, **the SMM plans on the project**, and **work flows down to juniors and back up for approval** — with money visible only to Admin/Manager.

### The canonical flow (this is the product)

```
ADMIN                creates CLIENT  (details, contacts, brand)
ADMIN / MANAGER      creates PROJECT under that client
                       ├─ type: ONE-TIME (website) or RETAINER (monthly social)
                       ├─ deliverables: 15 Reels, 5 Posts, 1 Shoot  (per cycle)
                       ├─ amount: ₹20,000 per cycle + period (start → end / open-ended)
                       └─ assigns one or more SMMs
        ↓ (instant, automatic)
SMM                  gets task: "New client onboarded — plan <project>"
                       click → opens the PROJECT ▸ PLAN tab (the calendar for this cycle)
SMM                  plans every deliverable on a date:
                       topic · content/brief · reference links · publish date · creative type
                       and assigns each to a junior — now or later
        ↓ (instant, automatic)
EDITOR / PHOTOGRAPHER sees the task in their Tasks page, under an auto-list named after the project
                       opens it → all the SMM's details + Updates / Files / Chat
                       marks IN PROGRESS  →  SUBMITS with proof (link · file · "sent on WhatsApp" · remarks)
        ↓
SMM                  reviews in their Approvals inbox:
                       ├─ APPROVE      → junior's task closes
                       │                 → auto-task for SMM: "Post <topic> for <client>" (due on publish date)
                       │                 → SMM posts, marks done  → content item = POSTED
                       └─ REQUEST CHANGES → same task reopens to the junior as Round N+1,
                                            all prior details intact + the new comments
        ↓ (end of cycle)
SMM                  CLOSES THE CYCLE:
                       ├─ unposted items → carry forward → "inside next cycle's quota" or "above quota"
                       │                    (all details copied, nothing retyped)
                       └─ extra items → flags "bill separately" or "complimentary (free)"
                          (SMM never sets or sees amounts)
        ↓
ADMIN / MANAGER      prices the flagged items, builds the CLIENT INVOICE:
                       package line(s) + billable extras + complimentary at ₹1 + ad-hoc tasks
                       tick what goes on this invoice → PDF on the letterhead
```

Three calendars stay as they are conceptually: **Project Plan** (where work is created), **Master Calendar** (all clients, filtered by access), **My Calendar** (each person's day). The client-level content calendar becomes a **read-only roll-up** of that client's projects.

---

## 2. Roles

Four roles now; more later. Role = permission tier. **Designation** = job label (Editor, Photographer, Videographer, Copywriter…), created dynamically in Settings, used for filtering/reporting/assignment lists — never for permissions.

| | **ADMIN** (+OWNER) | **MANAGER** | **SMM** | **TEAM** (junior) |
|---|---|---|---|---|
| Create / manage users | ✅ | ❌ | ❌ | ❌ |
| Create / edit clients | ✅ | ✅ | ❌ | ❌ |
| Create / edit projects, deliverables, **amounts** | ✅ | ✅ | ❌ | ❌ |
| Assign SMM to a project | ✅ | ✅ | ❌ | ❌ |
| Plan the content calendar | ✅ | ✅ | ✅ (own projects) | ❌ |
| Assign tasks to… | anyone | SMM and below | juniors only | nobody (self only) |
| Create own reminders / personal list | ✅ | ✅ | ✅ | ✅ |
| Review & approve submitted work | ✅ | ✅ | ✅ (own projects) | ❌ |
| Close a cycle | ✅ | ✅ | ✅ (own projects) | ❌ |
| Flag extras as billable / complimentary | ✅ | ✅ | ✅ | ❌ |
| **See any money** (amounts, invoices, margins, project value) | ✅ | ✅ | ❌ | ❌ |
| Add expenses | ✅ | ✅ | ✅ | ❌ (toggle later) |
| Create / send invoices | ✅ | ✅ | ❌ | ❌ |
| Reports | all | delivery, deadlines, team workload, client fulfilment (**no org P&L / revenue / margin**) | own projects' delivery only | own tasks only |

Enforcement lives in `lib/permissions.ts` as **capabilities**, not role checks scattered in components:

```
users.manage · clients.manage · projects.manage · projects.pricing · projects.assignSmm
content.plan · tasks.assign(scope) · tasks.review · cycles.close · billing.flag
financials.view · expenses.create · invoices.manage · reports.all · reports.delivery
```

`financials.view = false` means the **API strips** every amount: project value/budget, invoice and line-item amounts, receipts, expense amounts, package/cycle amounts, dashboard money cards. SMM sees quotas and counts (not money) — that's the line.

---

## 3. Data model (v3 shape)

### Retired in Phase 0 (deleted, after a JSON export)
`Quotation`, `QuotationItem`, `RateCard`, `Stakeholder`, `Booking` + their pages, nav entries, client tabs, dashboard cards (Pipeline Value) and every FK pointing at them (`Project.quotationId`, `Expense.stakeholderId`, contract-party links to stakeholders, rate-card lookups in invoicing).

### Project becomes the commercial unit
```prisma
Project {
  type              ONE_TIME | RETAINER        // exists
  cycleAmount       Decimal?                   // ₹20,000 per cycle (ONE_TIME: total, single cycle)
  cycleUnit         MONTH                      // room for WEEK/QUARTER later
  cycleStartDate    DateTime
  cycleEndDate      DateTime?                  // null = open-ended (retainer)
  currency          String?                    // inherits client → org
  deliverables      ProjectDeliverable[]
  members           ProjectMember[]
  cycles            ProjectCycle[]
}
ProjectDeliverable { projectId, creativeTypeId, qtyPerCycle Int, notes? }
ProjectMember      { projectId, userId, role: SMM | CONTRIBUTOR }
ProjectCycle       { projectId, label "Aug 2026", startDate, endDate,
                     status: OPEN | CLOSED, closedAt, closedById, invoiceId? }
```
*Migration:* existing `ClientPackage`/`PackageQuota` rows are converted into a RETAINER project + its deliverables (or attached to the client's existing retainer project), then the client **Package tab is removed**.

### Content
```prisma
ContentItem {
  projectId       // now required for planned work
  cycleId         // which cycle it belongs to
  date, creativeTypeId, topic, description, referenceUrl, referenceFileId
  status          PLANNED → ASSIGNED → IN_PROGRESS → SUBMITTED → APPROVED → POSTED
                  (+ CHANGES_REQUESTED, MISSED, CARRIED_FORWARD)
  billingIntent   INCLUDED | EXTRA_BILLABLE | COMPLIMENTARY     // set by SMM at cycle close
  carriedFromId, carryMode: INSIDE_QUOTA | ABOVE_QUOTA
  postedAt, approvedAt, submittedAt
}
```

### Task lifecycle
```prisma
Task {
  kind        PLANNING | CONTENT_WORK | POST | GENERAL | PERSONAL
  revision    Int @default(1)             // bumped on every "request changes" round
  approverId  String?                     // the SMM who reviews it
  status      TODO → IN_PROGRESS → IN_REVIEW(=submitted) → DONE   (+ CHANGES_REQUESTED, BLOCKED)
  contentItemId, projectId, clientId, topic, content, referenceUrl, extraNote, dueDate
}
TaskSubmission { taskId, revision, method: LINK|FILE|WHATSAPP|SLACK|OTHER, url?, fileId?, remarks, submittedById, submittedAt }
TaskReview     { taskId, revision, decision: APPROVED|CHANGES_REQUESTED, comments, reviewedById, reviewedAt }
```
**Auto-tasks** (created by the system, never typed by a human):
1. Project gets an SMM → `PLANNING` task "New client onboarded — plan <project>" → deep-links to Project ▸ Plan.
2. Submitted work approved → `POST` task for the SMM, "Post <topic> for <client>", due on the content item's publish date.

### Tasks page structure
- **My List** — personal reminders, the only list a user can create items in freely. No other list creation anywhere.
- **Auto lists** — one per project the user has tasks in, named after the project. Appear/disappear automatically.
- **Approvals** — inbox for SMM/Manager/Admin: work submitted and waiting on them.

### Billing bridge (how SMM intent becomes money)
```prisma
BillableItem {
  clientId, projectId?, cycleId?, contentItemId?, taskId?
  label, kind: PACKAGE | EXTRA | COMPLIMENTARY | ADHOC_TASK
  flaggedById            // the SMM
  amount Decimal?        // set ONLY by admin/manager
  status: PENDING_PRICING | READY | INVOICED | WAIVED
  invoiceId?
}
```
Complimentary items are invoiced at **₹1** with a "Complimentary" tag so the client sees the goodwill. Cycle close generates the `PACKAGE` line + one `EXTRA`/`COMPLIMENTARY` per flagged item; ad-hoc billable tasks outside any project become `ADHOC_TASK` lines.

---

## 4. What changes vs. what's already built

| Already built (keep) | Changes in v3 |
|---|---|
| Client CRM, contacts, brand, files, chat, contracts, expenses, receipts, invoices | Client **Package** tab removed (moves to project); **Quotations** tab removed |
| ContentItem model, content calendar UI, creative types, quota meters | Re-scoped from client → **project + cycle**; client view becomes read-only roll-up |
| Master calendar, My Calendar (Google-style), notifications, StatusHistory | Kept; My Calendar must show assigned **tasks** and **content**, not just reminders/events |
| Task fields (topic/content/reference/extra note), History, Request changes | Wrapped into the **submit → review → revision** loop with proof capture |
| Tasks page (Google-Tasks style) | Custom lists removed → **My List + auto project lists + Approvals** |
| Head-of-Design assignment approval | **Off by default**, kept behind an org setting toggle |
| Quotations, Rate Cards, Stakeholders, Bookings | **Deleted** (Phase 0) |

---

## 5. Known defects to fix along the way (found in review, Aug 2026)

1. Master calendar month grid: date numbers misalign on rows that contain an event strip (24 and 28 sit lower than their row).
2. Master calendar: legend says "click a day for details" but no day panel opens.
3. Tasks page: "Completed (N)" expanders don't expand.
4. Master calendar: clicking a content chip opens the client page but not that item's panel.
5. Content "Add content" dialog accepts a reference **URL only**; the task modal supports URL *or* upload — make them consistent.
6. `/api/my-calendar` returns only `event` + `personal` entries — assigned tasks and content never reach a user's calendar. **This breaks the spine and must be fixed in Phase 4.**

---

## 6. Phase index

| Phase | Name | Delivers |
|---|---|---|
| 0 | Trim & fix | Delete Quotations/Rate Cards/Stakeholders/Bookings; fix defects 1–5 |
| 1 | Roles & permissions | 4 roles, dynamic designations, capability layer, money blackout for SMM/Team |
| 2 | Project = commercial unit | Type, deliverables, amount, cycle, SMM assignment, auto "plan" task, package migration |
| 3 | SMM planning surface | Project ▸ Plan calendar per cycle, quota meters, client roll-up read-only |
| 4 | Junior workspace | Tasks page rebuild (My List + auto project lists), task detail, **my-calendar fix** |
| 5 | Submit → review loop | Proof capture, Approvals inbox, approve / request changes (rounds), auto POST task |
| 6 | Cycle close | Carry forward (2 modes), extras & complimentary flags, cycle lock |
| 7 | Invoicing | Client-wise builder from BillableItems, pricing by admin, ₹1 complimentary, PDF |
| 8 | Dashboards, reports, hardening | Role-specific dashboards, report matrix, notification pass, permission audit |

Build 0 → 8 in order. 6 must follow 3; 7 must follow 6; everything else is sequential by dependency.
