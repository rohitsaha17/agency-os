# STUDIO FLOW V2 — PHASE PLAYBOOK (prompts + manual checks)

*Companion to `docs/V2_CONTEXT.md`. One phase = one Claude Code session = one git branch = one commit. Save this file at `docs/V2_PLAYBOOK.md` (optional but handy).*

---

## How to use this playbook

1. **Before Phase 0**, copy `V2_CONTEXT.md` into the repo at `docs/V2_CONTEXT.md`.
2. For each phase: `git checkout -b phase-N-name` → open Claude Code in the repo → paste that phase's **PROMPT** → let it work, answer its questions.
3. When it finishes: run the **Manual checks** below the prompt yourself, in the browser. Every check is "Do → Expect". If anything fails, tell Claude Code in the same session ("check 3 failed: …") and re-verify.
4. Then run the **Regression sweep** (targeted) + the **Golden Path** (2 minutes, below). All green → `git add -A && git commit -m "phase N: …"` → merge to main.
5. **If a phase goes badly wrong**: `git checkout main` and delete the branch — the app returns to the last good state. (If a migration already ran on your dev DB and you use SQLite, restore the backup copy of the `.db` file you make at Phase 0; with Postgres, `prisma migrate reset` re-seeds.)

### The Golden Path (baseline smoke test — run after EVERY phase, ~2 min)

1. `/` Dashboard loads: KPI cards show numbers, Quick Actions render.
2. `/clients` shows 2 demo clients → open **Acme Beverages** → click through tabs: Overview (financial summary), Contacts, Projects, Quotations, Invoices, Receipts, Expenses, Files, Chat, Contracts — each renders without error.
3. `/projects` → open **Acme Rebrand 2026** → Tasks list shows the task tree → open task drawer → switch to Kanban → open Files, Expenses, Contracts tabs.
4. `/tasks` shows grouped tasks. `/calendar` loads month view + day click opens the side panel.
5. `/messages` opens #random with composer. `/files` → Browse All → open folder → open a file review and close it.
6. `/quotations` → open the Acme proposal (totals correct) ; `/invoices`, `/expenses`, `/contracts`, `/rate-cards`, `/stakeholders` all list demo data.
7. `/settings` → all five tabs open. Press **Ctrl/⌘+K** → search "acme" → grouped results appear.
8. Terminal: dev server shows no red errors; `npm run build` (or `npx tsc --noEmit`) passes.

---

## PHASE 0 — Safety net (10 minutes, do this first)

**Goal:** lock in a known-good baseline before touching anything.

**Your own steps (not Claude):** commit current state on `main`; if SQLite, copy the DB file (e.g. `cp prisma/dev.db prisma/dev.db.backup`); copy `V2_CONTEXT.md` to `docs/V2_CONTEXT.md`; run the Golden Path once so you know what "working" looks like.

**PROMPT**
```text
Read docs/V2_CONTEXT.md fully — it is the master context for everything we will build. Do not implement any features now.
1) If a CLAUDE.md exists at the repo root, append a short section: "V2 work: before making any changes, read docs/V2_CONTEXT.md and follow its Prime Directive (additive-only, never break v1)." If no CLAUDE.md exists, create one with the project name, stack summary, and that instruction.
2) Run the build/typecheck and the dev server briefly; report any pre-existing errors WITHOUT fixing unrelated things.
3) Tell me: which database provider the Prisma schema uses, whether migrations or db push is in use, and the exact names of the Task, Client, Invoice models and their status/priority enums — so our later phases use the real names.
Make no other changes.
```

**Manual checks**
1. `CLAUDE.md` exists/updated with the context pointer → open it and confirm.
2. Claude reported DB provider + real model/enum names → note them; if any differ from V2_CONTEXT.md's assumptions, ask Claude to add a "naming corrections" note at the bottom of `docs/V2_CONTEXT.md`.
3. Golden Path passes (this is your recorded baseline).

---

## PHASE 1 — Foundations: currency, visibility, audit, notification bell

**Goal:** per-client currency, member financial/contact blackout, StatusHistory audit, notification bell. Everything later depends on these.

**PROMPT**
```text
Read docs/V2_CONTEXT.md fully and follow its Prime Directive (additive-only, never break v1). Then read prisma/schema.prisma and skim app/(dashboard) + app/api structure to match existing conventions.
Implement Phase 1:
1) Schema (additive, then migrate with a clear name): Client.currency String?; Client.importance enum NORMAL/IMPORTANT/VIP default NORMAL; User.designation enum SMM/DESIGNER/EDITOR/HEAD_OF_DESIGN/PHOTOGRAPHER/SME/POC/OTHER optional; new models StatusHistory(entityType, entityId, fromStatus?, toStatus, changedById, changedAt default now, note?) and Notification(userId, type, title, body?, link?, readAt?, createdAt).
2) lib/money.ts: formatMoney(amount, currency?) + resolveClientCurrency(client, org) = client.currency ?? org.currency. Refactor ALL money rendering to use it: dashboard KPI cards, client financial summary, project budget + expense stats, quotations, invoices, receipts, expenses pages. Fix any hardcoded $ or ₹ (the Expenses stat cards currently show $ while tables show ₹ — fix that too).
3) Client new/edit form: currency select, default option "Inherit organization currency (₹ INR)". Settings → Users: designation select on each member row + in Add Member.
4) lib/permissions.ts: canViewFinancials(user) and canViewContacts(user) — false when role is MEMBER. Enforce SERVER-SIDE: strip budget/amount/margin fields and contact data from API responses for such users. UI layer: hide FINANCE sidebar section, dashboard money cards (Pipeline Value, Expenses month), client Contacts tab, client financial summary, project budget figures for those users. Do not change what admins/managers see.
5) lib/audit.ts: logStatus(entityType, entityId, from, to, userId, note?) writing StatusHistory. Call it from the existing task status update and project status update routes.
6) Notification center: GET /api/notifications (mine, newest first, unread count) + PATCH /api/notifications/[id]/read + mark-all-read. Bell button in the sidebar/header with unread badge and dropdown (title, time-ago, link, mark read). Fire notifications on: task assigned to someone, task moved to IN_REVIEW (notify the manager/reviewer).
Run the build, fix all type errors, confirm the seed still loads.
```

**Manual checks — new features**
1. Edit Acme → set currency **USD** → client Overview financial summary, its Quotations/Invoices tabs show **$**; dashboard org-wide cards still show ₹.
2. Settings → Users → set Arjun = EDITOR, Priya = DESIGNER, yourself = SMM (or ADMIN designation of choice) → values persist on reload.
3. Set one user's permission to **Member** (or create a test member and log in as them): sidebar has no FINANCE section; dashboard shows no Pipeline/Expenses cards; Acme detail shows no Contacts tab and no financial summary; `/projects/[id]` shows no ₹450,000. Open DevTools → Network → the client API response contains **no** contact emails/amounts (server-stripped, not just hidden).
4. Change any task's status → check DB (or ask Claude for a tiny /api/debug/history?entityId= route) → StatusHistory row exists with who/when.
5. Assign a task to Arjun → bell shows unread badge → dropdown lists it → mark read clears badge.
6. Expenses page stat cards now show ₹ (bug fixed).

**Regression sweep:** Quotation detail totals unchanged for INR clients · client Edit form still saves all old fields · task drawer still opens/updates · Golden Path.

---

## PHASE 2 — Task System 2.0

**Goal:** the task engine the calendars will assign into: new fields (topic/content/reference/extra note), general tasks, preferred-assignee → Head-of-Design routing, change requests, drag-drop personal queue, delivery proof on completion.

**PROMPT**
```text
Read docs/V2_CONTEXT.md fully and follow its Prime Directive. Read the Task model, task API routes, project Tasks tab (list + kanban), task drawer, and New Task modal before changing anything.
Implement Phase 2 (Task System 2.0):
1) Schema (additive): Task.topic String?, Task.content String? (text), Task.referenceUrl String?, Task.referenceFileId String? (relation to files), Task.extraNote String?, Task.clientId String? (direct optional relation; keep projectId and make it optional if not already), Task.contentItemId String? (plain column for now, FK enforced in Phase 3), Task.preferredAssigneeId String?, Task.assignmentStatus enum NONE/PENDING_HEAD_APPROVAL/APPROVED/REASSIGNED default NONE, Task.sortOrder Int default 0, Task.isAdHoc Boolean default false. New models: TaskDelivery(taskId, method enum FILE_UPLOAD/LINK/WHATSAPP/SLACK/OTHER, fileId?, url?, note?, deliveredById, deliveredAt) and ChangeRequest(taskId, requestedById, note, status enum OPEN/RESOLVED default OPEN, createdAt, resolvedAt?). Migrate; existing tasks must still render everywhere.
2) New Task modal (extend, don't rebuild from scratch): fields Topic (maps to/next to title — keep title working), Content textarea, Reference (segmented: URL input OR image/file upload), Delivery due date (existing due date), Priority dropdown (existing), Extra note, Client (optional) and Project (optional; project select filtered by chosen client) — both empty = "General task" badge, Assignees, Preferred assignee ("Preference — editor/designer", user picker), Manager/Reviewer (existing), Parent task (existing).
3) /tasks page: add a "General" group for tasks with no client & no project. Add a "My Tasks" tab: tasks assigned to me, ordered by sortOrder, drag-and-drop reorder persisted via a PATCH reorder endpoint (array of ids).
4) Assignment routing: on create, if creator is not designation HEAD_OF_DESIGN and not role ADMIN/OWNER and preferredAssigneeId is set → save with assignmentStatus PENDING_HEAD_APPROVAL and assignees empty. Add an "Approvals" tab on /tasks visible only to HEAD_OF_DESIGN + admins: pending list with [Approve → assigns preferred person] and [Assign someone else → user picker]. Both set APPROVED/REASSIGNED, notify the final assignee, log StatusHistory.
5) Task drawer additions: "Request changes" (dialog: note → creates ChangeRequest, sets status IN_PROGRESS, notifies assignees, logs history); "Reassign" (picker + note, logs + notifies); "History" section listing StatusHistory entries (who, from→to, when, note) newest first.
6) Completion flow: when a task is marked Done from anywhere (drawer, list, kanban), open a Delivery dialog: method picker [Upload file / Attach link / Sent via WhatsApp / Sent via Slack / Other], optional note, optional proof file for WhatsApp/Slack, plus a small "skip proof" link. Save TaskDelivery; show "Delivered via …" with the note/file in the drawer.
7) Call logStatus on every task mutation (create, assign, status change, reassign, complete). Notifications: task assigned, changes requested, task pending your approval (to heads).
Run the build, fix all errors, verify seed tasks render in list, kanban, drawer, and /tasks.
```

**Manual checks — new features**
1. Project → Add Task with Topic "Diwali teaser", Content brief, a reference URL, extra note → task card + drawer show all fields.
2. Create a task with **no client & no project** → appears under "General" on `/tasks`.
3. As yourself (SMM designation), create a task with **Preferred assignee = Arjun** → it does NOT appear in Arjun's tasks yet; "Approvals" tab (visible to Head/admin) lists it → Approve → Arjun assigned + notified (bell). Create another and use "Assign someone else" → Priya gets it instead; assignmentStatus reflects REASSIGNED.
4. In a task drawer: Request changes with a note → status flips to In Progress, assignee notified, History shows the flip.
5. "My Tasks" tab → drag task #3 to the top → refresh → order persists.
6. Mark a task Done → Delivery dialog appears → choose "Sent via WhatsApp" + note + screenshot upload → drawer shows the delivery record. Complete another via "skip proof" → still works.
7. History section shows every change with who/when.

**Regression sweep:** existing seed tasks still show correct status/priority in list + kanban · subtasks still nest · project progress % still computes · task drawer's old tabs (Updates/Files/Discussion/Depends/Time) all still work · Golden Path.

---

## PHASE 3 — Client Content Calendar ⭐ (the heart)

**Goal:** ONE content calendar per client. SMM plans the month (type + topic + description + reference per day) and assigns tasks straight from entries. Approvals + carry-forward live here.

**PROMPT**
```text
Read docs/V2_CONTEXT.md fully and follow its Prime Directive — especially the SPINE diagram in section 2; this phase builds its first half. Read the client detail page (tabs), the existing /calendar month grid, and the Phase-2 New Task modal first. Extract the /calendar month grid into a shared reusable component (e.g. components/calendar/MonthGrid) WITHOUT changing how /calendar looks or behaves, then reuse it here.
Implement Phase 3 (Client Content Calendar):
1) Schema: CreativeType(organizationId, name, slug, icon?, color?, countsAsShoot Boolean default false, isActive default true) seeded per org with: Post, Carousel, Reel, Story, Video, Photo Shoot (countsAsShoot true), Blog, Other. ContentItem(organizationId, clientId, projectId?, date DateTime, creativeTypeId, topic, description?, referenceUrl?, referenceFileId?, status enum PLANNED/ASSIGNED/IN_PROGRESS/IN_REVIEW/TEAM_APPROVED/CLIENT_APPROVED/SCHEDULED/POSTED/MISSED default PLANNED, isExtra Boolean default false, isAdHoc Boolean default false, carriedFromId String?, countAgainstPrevMonth Boolean default false, postedAt?, teamApprovedAt?, clientApprovedAt?, invoicedInId String?, createdById). Wire Task.contentItemId as a real relation. Migrate.
2) Settings → new "Creative Types" tab: CRUD table (name, color, icon, counts-as-shoot toggle, active toggle) following the existing settings-tab pattern.
3) Client detail → new tab "Content Calendar" placed FIRST in the tab bar. Views: Month grid (shared MonthGrid; each day shows compact chips: type icon + topic, chip color by status) and a List/agenda toggle. Clicking a day opens a side panel with that day's items + "+ Add content". Month header: month switcher + counters (planned / posted / extra / carried) + "+ Add content" button.
4) Add/Edit content dialog: Date, Creative Type* (from catalog), Topic*, Description, Reference (URL or file upload), Extra toggle, Ad-hoc toggle. Full CRUD via /api/content-items (+ [id] routes), org- and client-scoped, permission-checked.
5) Item panel: status stepper PLANNED→…→POSTED with buttons gated: "Team Approve" (managers/HEAD_OF_DESIGN/admin, sets teamApprovedAt), "Mark Client Approved" (SMM/POC/admin — label it "manual; share-link comes in a later phase", sets clientApprovedAt), "Mark Scheduled", "Mark Posted" (sets postedAt). EVERY transition through logStatus + notify the item creator on both approvals.
6) "Assign task" button on every item: opens the Phase-2 New Task modal PREFILLED (client, topic, content = description, reference, contentItemId, due date = item date minus 2 days, editable) with preferred-assignee routing intact. On task create: item status → ASSIGNED. Item panel lists linked tasks (title, assignee avatars, status chip, click → task drawer). When the last linked task completes, prompt "Move item to In Review?".
7) Carry forward: on items past their date with status TEAM_APPROVED or CLIENT_APPROVED but not POSTED → "Carry forward" action → date picker (defaults ~same day next month) → clones the item (keeps approvals + carriedFromId), marks original MISSED with auto-note "Carried to <date>". Month-end banner in the header when such items exist: "N approved items not posted — carry forward?".
Run the build, fix errors, and test the full spine on the Acme demo client.
```

**Manual checks — new features**
1. Settings → Creative Types: rename "Blog" → "Blog Article", add "Meme" → both usable in the dialog below.
2. Acme → **Content Calendar** tab (first tab): add 5 items across the month — 2 Posts, 2 Reels, 1 Photo Shoot, with topics/descriptions/a reference link → chips render on the right days, colored by status.
3. **The spine:** open the Reel item → "Assign task" → modal opens **prefilled** (client=Acme, topic, content, reference, due = item date −2d) → set Preferred assignee = Arjun → create → item flips to ASSIGNED → Approvals tab (Phase 2) shows it → approve → Arjun notified; the task shows on the item panel, and clicking it opens the normal task drawer.
4. Complete that task (with delivery proof) → prompt appears to move item to IN_REVIEW → accept → Team Approve (as admin) → Mark Client Approved → Mark Posted → all four timestamps recorded (check item panel/History).
5. Backdate an approved item (or create one dated last week, approve it) → "Carry forward" appears → carry to next month → next month shows the clone (approvals intact), original shows MISSED with the auto note; header counters update (carried).
6. Month counters match what you created (5 planned, 1 posted, …).

**Regression sweep:** `/calendar` (old one) looks and behaves EXACTLY as before (grid was extracted, not changed) · client's other 12 tabs unaffected · task drawer + /tasks unaffected · Golden Path.

---

## PHASE 4 — My Calendar ⭐ (completes the spine)

**Goal:** every user's Google-Calendar-style daily home. Assigned tasks appear automatically; personal reminders; seniors drop to-dos onto a teammate's day.

**PROMPT**
```text
Read docs/V2_CONTEXT.md fully and follow its Prime Directive — this phase completes the SPINE: tasks assigned from the client content calendar must automatically appear on the assignee's personal calendar. Read the Phase-3 shared MonthGrid, tasks API, and content-items API first.
Implement Phase 4 (My Calendar):
1) Schema: PersonalItem(userId, createdById, title, note?, date DateTime, time String?, done Boolean default false, doneAt?). Migrate.
2) New page /my-calendar + sidebar link "My Calendar" in WORK (right after Tasks). Views: Day / Week / Month with Today + prev/next, styled like Google Calendar: week = 7 columns, today highlighted, chips stacked per day; Day view = a clean agenda list (timed personal items sorted first, then all-day chips); Month reuses the shared MonthGrid.
3) GET /api/my-calendar?from&to returns for the CURRENT user: (a) tasks assigned to me (by due date; include status, priority, topic, client, contentItemId), (b) content items with a linked task assigned to me (by publish date), (c) my personal items — each tagged with kind so the UI styles them distinctly (task chip / content chip / personal chip). Design the payload so later phases can add events, follow-ups and bookings without breaking shape.
4) Interactions: task chip click → open the existing task drawer (or navigate to it); its checkbox completes via the Phase-2 Delivery dialog. Personal item checkbox toggles done (strikethrough). Day view shows an "Overdue / yesterday" section listing my incomplete past-due tasks + personal items.
5) "+ Add" button: personal reminder dialog (title, date, optional time, note). For ADMIN/MANAGER/HEAD_OF_DESIGN an extra "Add for teammate" mode with a user picker — creates the item with userId=teammate, createdById=me, and notifies them ("<name> added to your calendar: <title>").
6) Right rail (collapsible): "My queue" — reuse the Phase-2 sortOrder drag-drop list component.
Run the build, fix errors, verify with two different users.
```

**Manual checks — new features**
1. Log in / act as **Arjun (editor)** → `/my-calendar` → the task assigned in Phase 3 sits on its due date; the content item chip sits on the publish date — visually distinct kinds.
2. Week view: today's column highlighted; Day view lists items; prev/next + Today all navigate correctly.
3. Check the task's box on the calendar → Delivery dialog appears (same as Phase 2) → complete → chip shows done state.
4. "+ Add" a personal reminder "Send Acme captions 5pm" with a time → appears at the top of that day.
5. As admin: "Add for teammate" → drop "Prep moodboard" on Priya's tomorrow → Priya's bell shows the notification, her calendar shows the item, its card shows "added by Rohit".
6. Leave a personal item unfinished yesterday → Day view shows it under "Overdue".
7. Right-rail queue drag-reorder still persists.

**Regression sweep:** /tasks + task drawer unchanged · content calendar (Phase 3) unchanged · sidebar order sensible on mobile width · Golden Path.

> **Milestone: the spine is now live end-to-end.** SMM plans on the client calendar → assigns → head approves → task lands on the doer's My Calendar → done with proof → item approved → posted.

---

## PHASE 5 — Master Content Calendar + events layer

**Goal:** `/calendar` becomes the all-clients content view with filters + access levels; festival pack (Holi, Diwali…) with lead reminders; ad-hoc "sudden shoot" events.

**PROMPT**
```text
Read docs/V2_CONTEXT.md fully and follow its Prime Directive. Read the current /calendar page + its API and the Phase-3/4 components first. The old task/project calendar behavior must remain available behind toggles — do not delete it.
Implement Phase 5 (Master Content Calendar + events):
1) Rework /calendar into the org-wide content calendar: Month/Week of ContentItems across ALL clients — chip: client avatar/initials + creative-type icon + topic + status dot; a "Color by" toggle (client | creative type | status). Existing layers stay as checkboxes: "Show tasks", "Show projects" (default off, on = old behavior renders alongside). Day click → side panel grouped by client.
2) Filter bar (server-side params on the calendar API, keeping the existing year/month pattern): clientId, projectId, creativeTypeId, status, assigneeId, extraOnly, adHocOnly + the existing priority filter for the task layer. Filters combine; active count badge + Clear (match existing filter UX).
3) Access filtering IN THE API: ADMIN/MANAGER/OWNER see everything; MEMBER sees only content items having a linked task assigned to them, plus org-wide events; financial fields never present. 
4) Schema: CalendarEvent(organizationId, title, date, endDate?, kind enum FESTIVAL/CAMPAIGN/SHOOT/INTERNAL/OTHER, clientId?, reminderDaysBefore Int?, isAdHoc Boolean default false, notes?, createdById). Seed an Indian festival pack for 2026 and 2027 (Holi, Eid al-Fitr, Raksha Bandhan, Independence Day, Ganesh Chaturthi, Navratri, Dussehra, Diwali, Christmas, New Year) with reminderDaysBefore=7, org-wide.
5) Events render as a thin banner strip at the top of their day cells (distinct from content chips). "+ Add Event" dialog: kind, title, date(s), optional client, reminder days, ad-hoc toggle, notes. Ad-hoc events + ad-hoc content items get a dashed border + ⚡ badge. A SHOOT event's panel offers "Create task" (Phase-2 modal prefilled) and later "Create booking" (Phase 9 — leave a TODO hook).
6) lib/reminders.ts scanUpcomingEvents(now): for events whose (date - reminderDaysBefore) ≤ today < date, create Notifications (type FESTIVAL_REMINDER/EVENT_REMINDER) for users with designation SMM or POC — for client-linked events also require client importance IMPORTANT/VIP. Must be idempotent (no duplicate notifications for the same event+user). Call it on master-calendar load for now and expose POST /api/jobs/scan-reminders (secret-header) for Phase 8.
7) Extend /api/my-calendar to include events (all-day strip on My Calendar too).
Run the build, fix errors, verify member-level access with a test member.
```

**Manual checks — new features**
1. `/calendar` shows Acme's content items (and any Nova ones) together; "Color by client" vs "type" vs "status" all recolor.
2. Filter to Creative Type = Reel → only reels; add Status = POSTED → combined filtering; Clear resets; filter-count badge shows.
3. Toggle "Show tasks" + "Show projects" → the old task dots and project bars appear alongside; untoggle → clean content view.
4. As a **member** (Arjun): master calendar shows ONLY items where a linked task is his + festival strips — none of Nova's unrelated content.
5. Diwali appears as a banner strip on its date; set a test event 5 days out with reminder=7 → reload calendar → SMM bell gets one reminder, and reloading again does NOT duplicate it.
6. "+ Add Event" → ad-hoc SHOOT tomorrow for Acme → dashed ⚡ banner appears; its panel's "Create task" prefills correctly.
7. My Calendar now shows the event strip too.

**Regression sweep:** day side-panel still opens · month/week/Today/arrows still work · content calendar per client unaffected · notifications list not spammed with duplicates · Golden Path.

---

## PHASE 6 — Packages, quotas & deliverable counting

**Goal:** define each client's social package (N posts, N reels, N shoots per month); live usage meters; auto-EXTRA beyond quota; carry-forward math; month summary that invoicing will read.

**PROMPT**
```text
Read docs/V2_CONTEXT.md fully and follow its Prime Directive. Read Phase-3's content-item model/APIs and the client detail tabs first.
Implement Phase 6 (Packages & quotas):
1) Schema: ClientPackage(organizationId, clientId, name, startMonth DateTime, endMonth?, billingAmount Decimal?, currency?, notes?, isActive default true) and PackageQuota(packageId, creativeTypeId, monthlyQty Int). Migrate.
2) Client detail → new "Package" tab: form (name, active from/to month, billing amount + currency defaulting to client currency, notes) + quota table (one row per active CreativeType with a qty input; 0 = not included). Enforce max one active package per client (deactivate previous on save, keep history list below).
3) lib/quota.ts: computeMonthSummary(clientId, monthYYYYMM) → { perType: [{creativeType, quota, planned, posted, extra, carriedIn, carriedOut}], adHocCount, shootsPlanned, shootsDone, totals }. Rules: planned = items in statuses PLANNED..SCHEDULED dated that month; posted = POSTED that month; extra = isExtra items; carriedIn = items with carriedFromId dated this month (count against this month unless countAgainstPrevMonth); carriedOut = this month's items MISSED with a clone next month; shoots = countsAsShoot types (bookings add in Phase 9). Expose GET /api/clients/[id]/month-summary?month=.
4) Content Calendar month header: per-type usage meters "used/quota" progress bars + Extra and Carried badges, fed by that endpoint. Update live after item create/status change.
5) On content-item create: if that type's committed count for the month already ≥ quota, show a confirm: "Quota for <type> is full (4/4). Mark this as EXTRA?" → sets isExtra (user can override off). Carried-in items: per-item toggle "Count against previous month" writes countAgainstPrevMonth and summary respects it.
6) Client Overview: one-line fulfillment widget for the current month ("Aug: 10/12 posts · 4/4 reels · 1/1 shoot · 2 extra"). Members may see counts but never billingAmount.
Run the build, fix errors, verify math against a hand-counted month on Acme.
```

**Manual checks — new features**
1. Acme → Package tab → create "Acme Social — Standard": 12 Posts, 4 Reels, 1 Photo Shoot, ₹60,000/mo → saves; creating a second package deactivates the first (history listed).
2. Content Calendar header now shows meters (e.g., Posts 2/12, Reels 2/4 from your Phase-3 items) and they update the moment you add/post an item.
3. Add reels until the 5th → the EXTRA confirm appears → accept → chip gets an EXTRA badge; header "extra: 1".
4. Your Phase-3 carried item shows as carriedOut in its month and carriedIn next month; flip its "count against previous month" toggle → summaries move it accordingly.
5. `GET /api/clients/<acmeId>/month-summary?month=2026-08` (browser) → numbers match the UI exactly.
6. Client Overview shows the fulfillment line; as a member, counts visible but no ₹60,000 anywhere.

**Regression sweep:** content calendar interactions from Phase 3 all still work · client tabs unaffected · currency displays right (package uses client currency) · Golden Path.

---

## PHASE 7 — Invoicing: package + extras (include / exclude / free)

**Goal:** generate a client's monthly invoice from the package + that month's extras, each extra toggleable include/exclude/free; free items print as "Complimentary".

**PROMPT**
```text
Read docs/V2_CONTEXT.md fully and follow its Prime Directive. Read the invoice model/routes, the New Invoice UI, rate-cards API, and Phase-6's month-summary first.
Implement Phase 7 (Invoicing from packages):
1) Schema: ensure invoices have line items; add/extend InvoiceLineItem with kind enum PACKAGE/EXTRA/CUSTOM default CUSTOM, isFree Boolean default false, contentItemId String?. ContentItem.invoicedInId already exists — use it. Migrate. Existing invoices must render unchanged.
2) New Invoice: add a "Generate from month" mode — pick client + month → prefill lines: (a) PACKAGE line from the active ClientPackage (label "<package name> — <Month YYYY>", amount = billingAmount, client currency); (b) one EXTRA line per delivered (POSTED) extra or ad-hoc content item that month where invoicedInId is null — label "Extra <Type> — <topic>", unit price prefilled from a rate card whose service name matches the creative type (case-insensitive) else 0/editable.
3) Each EXTRA line gets a segmented control [Include | Exclude | Free]: Exclude removes the line (item stays claimable next time); Free keeps it at amount 0 with a "Complimentary" tag excluded from totals. Manual CUSTOM lines still addable.
4) Totals + the invoice PDF/summary use the client currency via lib/money. PDF/print layout: package line, billed extras, then a "Complimentary" section listing free items — using the existing letterhead system untouched.
5) On invoice create: stamp invoicedInId on all Included AND Free items (excluded stay null). Re-running "Generate from month" must not re-offer already-invoiced extras.
6) Fix: the project detail "Invoices" tab must list invoices where projectId matches (currently appears empty even when a linked invoice exists).
Run the build, fix errors, verify against Phase-6 data.
```

**Manual checks — new features**
1. Invoices → New → "Generate from month" → Acme + current month → PACKAGE line ₹60,000 + your extra reel appears as an EXTRA line (price from "Social Media" rate card if names match, else editable).
2. Add a second extra in the calendar (post it), regenerate → both extras offered. Set one **Free**, keep one **Include**, totals = package + included extra only; Free line shows ₹0 "Complimentary".
3. Create the invoice → open its PDF/print view → package line + billed extra + Complimentary section render on the letterhead.
4. Generate again next time → previously included/free extras do NOT reappear; an **Excluded** one does.
5. Acme currency USD? Totals show $ (client currency respected).
6. Project detail → Invoices tab now lists INV-2026-001 (bug fixed).

**Regression sweep:** old invoices list/status dropdowns unchanged · quotation → Convert to Project untouched · receipts still link to invoices · letterhead settings preview still works · Golden Path.

---

## PHASE 8 — Notifications engine: misses, digests, follow-ups, reports

**Goal:** automatic detection of missed deadlines/unposted content; daily/weekly/monthly digests per role; POC/SME follow-up reminders; a reports table.

**PROMPT**
```text
Read docs/V2_CONTEXT.md fully and follow its Prime Directive. Read the Notification plumbing (Phase 1), content statuses (Phase 3), and reminders scan (Phase 5).
Implement Phase 8 (Notifications engine & reports):
1) Schema: FollowUp(organizationId, clientId, assignedToId, note, dueAt, status enum PENDING/DONE/SNOOZED default PENDING, snoozedTo?, createdById) and JobRun(jobName, runDate, ranAt) for idempotency. Migrate.
2) Client detail → "Follow-ups" card (on Overview or its own small tab): add (note + due date + assignee defaulting to a POC-designated user), list with Done and Snooze (1d/3d/1w). Fires FOLLOWUP_DUE notifications when due.
3) lib/jobs.ts runDailyScan(now): idempotent per calendar day via JobRun. Steps: (a) tasks past due & not DONE → DEADLINE_MISSED notification to each assignee + a summary notification to managers/HEAD_OF_DESIGN; (b) ContentItems past date & not POSTED/MISSED → set MISSED (logStatus) + notify SMM/POC with link + "carry forward" hint; (c) due follow-ups → notify assignee; (d) call scanUpcomingEvents. On Mondays also build WEEKLY digests; on the 1st, MONTHLY digests.
4) Digests are stored notifications (type DIGEST_DAILY/WEEKLY/MONTHLY) with a compact body: daily → each member's own misses; weekly → team roll-up grouped by assignee for HEAD_OF_DESIGN + managers; monthly → client-wise roll-up (counts per client, worst offenders) for admins + POC-designated users. Members must never receive other people's data.
5) Scheduling: register node-cron at 08:00 Asia/Kolkata if the server is long-running; ALSO expose POST /api/jobs/daily guarded by header x-job-secret = process.env.JOB_SECRET; ALSO a "Run daily scan now" admin button in Settings (Organization tab footer) for manual/dev use.
6) /notifications page (bell → "View all"): tabs All / Digests, filter by type, mark-all-read; digest cards expand to show their line items with links.
7) /reports page (sidebar WORK, admins+managers only): "Missed & crossed deadlines" table — filters month/client/assignee; columns: item/task, client, assignee, due date, days late, current status; CSV export. Sourced from tasks + MISSED content items.
Run the build, fix errors, test by backdating data and pressing the manual scan button twice (second run = no duplicates).
```

**Manual checks — new features**
1. Backdate an incomplete task to yesterday; leave one content item past-date unposted → Settings → **Run daily scan now** → assignee gets DEADLINE_MISSED; the content item flips to MISSED and the SMM gets notified; press the button again → **no duplicates**.
2. Add a follow-up on Acme due today → scan → assignee notified; Snooze 1d → rerun → silent.
3. Temporarily set your machine date logic aside: trigger weekly/monthly digests via the API with a date param or ask Claude for a dev-only override → weekly digest groups by assignee (visible to head/managers), monthly groups by client (admins/POCs); as a member you only ever see your own.
4. `/notifications` page lists everything, Digests tab expands line items with working links.
5. `/reports` table shows the missed task + missed content with correct days-late; CSV downloads and opens.
6. Members cannot open /reports (nav hidden + route guarded).

**Regression sweep:** bell + earlier notifications unaffected · content calendar statuses correct after the scan · no console errors on repeated scans · Golden Path.

---

## PHASE 9 — Photographer events & booking calendar

**Goal:** book photographers into time slots with conflict detection; bookings visible on master + personal calendars; completed shoots feed the shoot quota.

**PROMPT**
```text
Read docs/V2_CONTEXT.md fully and follow its Prime Directive. Read Phase 4/5 calendar components and User.designation first.
Implement Phase 9 (Booking calendar):
1) Schema: Booking(organizationId, photographerId → User, clientId?, projectId?, contentItemId?, startAt, endAt, location?, notes?, status enum REQUESTED/CONFIRMED/COMPLETED/CANCELLED default REQUESTED, isAdHoc Boolean default false, createdById). Migrate.
2) New page /bookings (sidebar WORK, after Files): Week view (default) + Month. Week: photographers (users with designation PHOTOGRAPHER) as horizontal lanes, bookings as time blocks (client name, time, location) colored by status; empty state explains "Set designation = Photographer in Settings → Users" when none exist.
3) New/edit booking dialog: photographer, client (optional), project (optional), content item (optional picker filtered to countsAsShoot types of that client), date, start/end time, location, notes, ad-hoc toggle. SERVER-side overlap check per photographer → API returns the conflicting booking; UI shows a warning card with the clash; only ADMIN/MANAGER may "Book anyway".
4) Status actions on a booking: Confirm, Complete, Cancel — each logStatus + notify the photographer (and creator). "Book now" quick action: choose duration + client → list next free slots today/tomorrow per photographer → one-click ad-hoc booking.
5) Feed bookings into /api/my-calendar (photographers see their bookings as timed chips) and into the master calendar as a "Shoots" layer (banner chips, toggleable like tasks/projects). Wire the Phase-5 SHOOT event "Create booking" hook.
6) On COMPLETED with a linked contentItem: prompt "Mark <item> as delivered/POSTED?" → yes updates the item (logStatus) so Phase-6 shoot counters update. Also count CONFIRMED/COMPLETED bookings in month-summary's shootsPlanned/shootsDone.
Run the build, fix errors, test conflicts and calendar feeds.
```

**Manual checks — new features**
1. Give a user designation PHOTOGRAPHER → `/bookings` shows their lane.
2. Book them tomorrow 10:00–13:00 for Acme (link the Photo Shoot content item) → block renders; book 12:00–14:00 same person → conflict warning shows the clash; as admin "Book anyway" works, as managerless member it doesn't.
3. Confirm the booking → photographer's bell + their My Calendar shows the timed chip; master calendar "Shoots" layer shows it.
4. Complete it → prompt to mark the linked Photo Shoot item delivered → accept → Acme month summary's shoots count updates.
5. "Book now" → 2h slot for Acme → offers free slots avoiding the existing booking → creates an ⚡ ad-hoc booking.
6. Cancel a booking → notified + lane updates.

**Regression sweep:** My Calendar still renders all prior kinds · master calendar toggles all coexist · month-summary math from Phase 6 still correct for non-shoot types · Golden Path.

---

## PHASE 10 — Client review links + hardening

**Goal:** clients approve/request changes via a tokenized public link (no login); then a full safety audit of everything built.

**PROMPT**
```text
Read docs/V2_CONTEXT.md fully and follow its Prime Directive. Read Phase-3 content items and Phase-2 change requests first.
Implement Phase 10 (Client review links + hardening):
1) Schema: ContentItem.reviewToken String? @unique, ContentItem.reviewTokenExpiresAt?; ReviewBatch(token @unique, organizationId, clientId, month, expiresAt, createdById). Migrate.
2) PUBLIC route /review/[token] OUTSIDE the authed (dashboard) group: single-item or batch page — client logo + org letterhead accent color, then per item: date, creative type, topic, description, reference preview (image/link), current status — with [Approve] and [Request changes] (comment textarea). Token lookup only; expired/revoked/used-up → friendly message; no org data beyond the items themselves; rate-limit basic.
3) Approve → status CLIENT_APPROVED + clientApprovedAt + logStatus(note "via review link") + notify SMM/creator. Request changes → creates a ChangeRequest on the item's newest linked task (or stores an item note if no task), status back to IN_PROGRESS, notifies assignee + SMM.
4) In-app: on TEAM_APPROVED items a "Share for approval" action → generate/copy link (default expiry 14 days) + Revoke. Content-calendar month header: "Share month for approval" → ReviewBatch page listing all TEAM_APPROVED items of that client+month. Manual "Mark Client Approved" stays as fallback.
5) HARDENING SWEEP: (a) audit EVERY route added in phases 1-9 for member leakage of financials/contacts — write a small script or checklist of curl calls as a member and fix leaks; (b) add missing loading/empty/error states on all new pages; (c) verify the three calendars + bookings on a 390px viewport and fix the worst breakages; (d) update the seed script to a full v2 demo (package with quotas, one fully planned month of content across statuses, a booking, follow-ups, a generated invoice) so a fresh setup demos everything; (e) run through docs/V2_PLAYBOOK.md phase checklists quickly and fix regressions.
Run the build, fix all errors.
```

**Manual checks — new features**
1. Team-approve an item → "Share for approval" → copy link → open in an **incognito** window: branded page, item details visible, **no login** → Approve → back in the app the item is CLIENT_APPROVED with history "via review link" and the SMM got notified.
2. Another item → share → in incognito "Request changes" with a comment → assignee gets a ChangeRequest, status back to IN_PROGRESS.
3. Revoke a link → incognito reload → friendly "link expired" message. Expired date behaves the same.
4. "Share month for approval" → batch page lists all TEAM_APPROVED items; approving one updates just that one.
5. As a member, hit 3–4 v2 API endpoints directly (month-summary, bookings, notifications, master calendar) → no amounts/contacts in any payload.
6. Fresh seed (`prisma migrate reset` or seed script) → the whole v2 demo appears; run the Golden Path one final time.

---

## Done — what you'll have

The exact flow you described, verified at every step: **one Content Calendar per client** where the SMM plans the month → **Assign task** from any entry → routed approval → the task **automatically on the assignee's My Calendar** → completion with proof → team then client approval → posted or carried forward — plus the master all-clients calendar, quotas feeding invoices with include/exclude/free extras, role-safe visibility, digests, follow-ups, and photographer bookings. Each phase was committed only after its manual checks and the Golden Path passed, so v1 never broke along the way.
