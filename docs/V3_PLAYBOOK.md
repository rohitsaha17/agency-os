# STUDIO FLOW V3 — PHASE PLAYBOOK (prompt + manual checks per phase)

*Companion to `docs/V3_CONTEXT.md`. One phase = one Claude Code session = one branch = one commit.*

---

## How to run a phase

1. `git checkout -b phase-N-<name>` (from an up-to-date `main`).
2. Open Claude Code in the repo, paste the phase **PROMPT** verbatim.
3. When it finishes, run the **Manual checks** yourself in the browser — each is *Do → Expect*.
4. Run the **Regression sweep** for that phase, then the **Golden Path** below.
5. All green → commit → merge to `main`. Something broken → tell Claude Code in the same session ("check 4 failed: …") and re-verify.
6. Emergency undo: `git checkout main` and delete the branch. (Keep a DB backup — see Phase 0.)

**Test accounts:** you need one user per role to check anything meaningful. Phase 1 sets these up: an Admin (you), a Manager, an SMM, and two juniors (Editor, Photographer). Keep their passwords handy — most checks from Phase 4 on require logging in as someone else (use a second browser profile or incognito so you can hold two sessions at once).

### Golden Path (run after every phase, ~2 min)

Dashboard loads → Clients list → open Acme → tabs render → Projects list → open Acme Rebrand → Tasks list + Kanban + a task drawer → `/tasks` → `/my-calendar` → `/calendar` → `/files` → `/invoices`, `/expenses`, `/contracts` → `/settings` (all tabs) → ⌘K search "acme" → no console errors, `npm run build` passes.

---

## PHASE 0 — Trim & fix

**Goal:** delete four modules you don't want, and clear the known defects, before restructuring anything.

**Do first, yourself:** commit `main`; back up the DB (SQLite: `cp prisma/dev.db prisma/dev.db.backup`; Postgres: `pg_dump`); copy `V3_CONTEXT.md` → `docs/V3_CONTEXT.md`; delete/archive `docs/V2_CONTEXT.md`.

**PROMPT**
```text
Read docs/V3_CONTEXT.md fully and follow its Prime Directive. Phase 0 is the one destructive phase — be careful and methodical.

A) EXPORT FIRST. Write scripts/export-retired-modules.ts that dumps every Quotation, QuotationItem, RateCard, Stakeholder and Booking row (with relations) to backups/retired-modules-<date>.json. Run it and confirm the file exists before deleting anything.

B) DELETE these modules completely:
   - Pages/routes: /quotations, /quotations/new, /quotations/[id], /rate-cards, /stakeholders, /bookings and their API routes.
   - Sidebar entries for all four; the "Rate Cards" button on the quotations page; the "New Quotation" quick action on the dashboard; the dashboard "Pipeline Value" KPI card.
   - Client detail tabs: Quotations. (Keep Invoices, Receipts, Expenses, Files, Chat, Contracts.)
   - Project detail: any quotation reference.
   - Prisma models Quotation, QuotationItem, RateCard, Stakeholder, Booking and every FK/relation pointing at them: Project.quotationId, Expense.stakeholderId (and its UI column/filter), contract party references to stakeholders (keep contract parties as plain name/email/role rows — migrate existing stakeholder-linked parties to that shape first), and the rate-card price lookup in the invoice builder (leave the line-item price editable/manual).
   - Global search (/api/search): drop those entity types.
   Migrate in one named migration. Existing invoices, expenses and contracts must still open and render correctly afterwards.

C) FIX these defects:
   1. Master calendar month grid: date numbers misalign in rows containing an event strip. Give each day cell a fixed header row (date number always at the top) and render event strips in a reserved lane below the header, so every row's date numbers line up.
   2. Master calendar: clicking a day must open the day-details side panel (the legend already promises it) — list that day's content items grouped by client, plus events; each row clicks through.
   3. Tasks page: the "Completed (N)" expander does nothing — make it expand/collapse the completed tasks of that list.
   4. Master calendar: clicking a content chip should open that item's detail panel (side panel), not just navigate to the client page.
   5. "Add content" dialog: give Reference the same URL-or-Upload toggle the task modal has.

Run the build, fix all type errors, verify the seed loads.
```

**Manual checks**
1. `backups/retired-modules-*.json` exists and contains the old quotation/rate-card/stakeholder/booking rows.
2. Sidebar has no Quotations, Rate Cards, Stakeholders or Bookings; visiting `/quotations` or `/bookings` 404s.
3. Dashboard has no Pipeline Value card and no New Quotation quick action; nothing else on it broke.
4. Acme client page: no Quotations tab; Invoices, Receipts, Expenses, Files, Chat, Contracts all still open with their data.
5. `/expenses` opens; the two Acme expenses still list (the stakeholder column is gone, amounts intact). `/contracts` → open the MSA → both parties still shown with names/emails.
6. `/calendar` in August: **every date number in a row sits at the same height**, including the rows with "Sudden product shoot", "Acme launch teaser drop" and "Raksha Bandhan".
7. `/calendar`: click an empty part of Aug 27 → day panel opens listing "Founder story reel" and "BTS reel"; click a chip → that item's panel opens.
8. `/tasks`: click "Completed (4)" → it expands and shows the four completed items; click again → collapses.
9. Client ▸ Content Calendar ▸ Add content → Reference shows URL / Upload toggle and both work.

**Regression sweep:** invoices list + an invoice PDF still render; ⌘K search still returns clients/projects/files; Golden Path.

---

## PHASE 1 — Roles, designations & the money blackout

**Goal:** the four-role model with capability-based enforcement, dynamic junior designations, and financial data invisible to SMM/Team at the API level.

**PROMPT**
```text
Read docs/V3_CONTEXT.md fully and follow its Prime Directive. Read the current Role enum, user model, Settings ▸ Users/Roles tabs and lib/permissions.ts (if it exists) first.

Implement Phase 1:
1) Schema: extend the Role enum with SMM and TEAM (keep OWNER, ADMIN, MANAGER; map any existing MEMBER users to TEAM in the migration and keep MEMBER as a deprecated value). New model Designation(organizationId, name, slug, isActive, canBeAssignedWork Boolean default true) seeded with Editor, Photographer, Videographer, Copywriter, Designer. Add User.designationId (FK, optional) — keep the old designation enum column but stop using it.
2) lib/permissions.ts — a capability layer, not scattered role checks. Export can(user, capability, context?) covering: users.manage, clients.manage, projects.manage, projects.pricing, projects.assignSmm, content.plan, tasks.assign (with scope: anyone | smmAndBelow | juniorsOnly | selfOnly), tasks.review, cycles.close, billing.flag, financials.view, expenses.create, invoices.manage, reports.all, reports.delivery. Resolve exactly per the role matrix in docs/V3_CONTEXT.md §2.
3) Enforce server-side in EVERY api route: when financials.view is false, strip amounts before responding — project budget/cycleAmount, invoice + line-item amounts, receipts, expense amounts, client financial summary, dashboard money cards. Add a small helper stripFinancials(payload, user) and use it consistently. Never return a number the user isn't allowed to see, even if the UI would hide it.
4) UI: sidebar sections and items render by capability (SMM/TEAM: no FINANCE section, no Invoices; TEAM: no Clients/Projects list access beyond what they're assigned to). Client detail hides financial summary + Invoices/Receipts tabs without financials.view. Project header hides value/budget.
5) Settings ▸ Users: only users.manage (ADMIN) may add/edit/deactivate users and set Role + Designation. Manager sees the list read-only. Add a "Designations" section (CRUD) next to it.
6) Settings ▸ Roles tab: replace the static matrix with the real capability matrix generated from lib/permissions.ts so it can never drift from the code.
7) Add an org setting `requireAssignmentApproval` (Boolean, default FALSE) and make the existing Head-of-Design assignment-approval flow honour it — when false, assignment goes straight to the assignee and the Approvals queue shows only work-review items (Phase 5 fills that in).
8) Seed/create test users so the flows can be tested: manager@vibrnd.test (MANAGER), smm@vibrnd.test (SMM), editor@vibrnd.test (TEAM/Editor), shooter@vibrnd.test (TEAM/Photographer) — all with a known password, printed at the end of the run.

Run the build; verify the app still works as Admin.
```

**Manual checks**
1. Settings ▸ Users: your account is Admin; the four test users exist with the right Role + Designation; Designations CRUD works (add "Motion Designer" → it appears in the designation dropdown).
2. Log in as **Manager** → can open Clients, Projects, Invoices, Expenses; **cannot** reach Settings ▸ Users for editing (read-only), cannot add a user.
3. Log in as **SMM** → no FINANCE section, no Invoices anywhere, client page shows **no** financial summary and no Invoices/Receipts tabs, project header shows **no** ₹ value. Open DevTools ▸ Network on the client and project API calls: **no amount fields in the JSON at all**.
4. Log in as **Editor** → sees only Tasks, My Calendar, Messages, Files (no Clients/Projects/Finance). No money anywhere.
5. As Admin, everything is still visible exactly as before.
6. Settings ▸ Roles shows the live capability matrix and matches what you just observed.

**Regression sweep:** Admin can still edit clients/projects/tasks as before; existing users didn't lose access; Golden Path.

---

## PHASE 2 — Project as the commercial unit

**Goal:** deliverables + amount + cycle live on the project; SMMs get assigned; the "plan this project" task fires automatically.

**PROMPT**
```text
Read docs/V3_CONTEXT.md fully and follow its Prime Directive. Read the Project model + new/edit project forms, the client Package tab (ClientPackage/PackageQuota) and CreativeType first.

Implement Phase 2:
1) Schema: Project gains cycleAmount Decimal?, cycleUnit enum (MONTH default), cycleStartDate, cycleEndDate? (null = open-ended), currency?. New models: ProjectDeliverable(projectId, creativeTypeId, qtyPerCycle Int, notes?), ProjectMember(projectId, userId, role enum SMM|CONTRIBUTOR, addedAt, addedById), ProjectCycle(projectId, label, startDate, endDate, status enum OPEN|CLOSED default OPEN, closedAt?, closedById?, invoiceId?). Migrate.
2) New/Edit Project form, restructured into steps: (a) Client + name + description; (b) Type — ONE-TIME or RETAINER, with a plain-language hint (one-time = website build etc.; retainer = monthly social package); (c) Deliverables — repeatable rows [Creative Type ▾ | qty] e.g. Reel 15, Post 5, Photo Shoot 1 (RETAINER: per cycle; ONE-TIME: for the whole project); (d) Commercials — amount + currency + period (start date, end date or "open-ended"); billing amount is visible/editable ONLY with projects.pricing capability; (e) Team — assign one or more SMMs (users with role SMM; admins/managers allowed too) and optional contributors.
3) On save, generate cycles: RETAINER → one ProjectCycle per month from cycleStartDate (create the current + next month; extend lazily as time moves). ONE-TIME → a single cycle spanning start→end.
4) AUTO-TASK: when an SMM is added to a project (at creation or later), create a Task for them — kind PLANNING, title "New client onboarded — plan <project name>", client + project linked, due in 2 days, description naming the deliverables — and send a notification. The task's primary action deep-links to /projects/<id>?tab=plan. Don't duplicate if that SMM already has an open planning task for the project.
5) Project detail header: show type, period, deliverable chips (15 Reels · 5 Posts · 1 Shoot), assigned SMM avatars, and the cycle selector. Amount shown only with financials.view.
6) MIGRATION of existing client packages: write scripts/migrate-packages-to-projects.ts converting each active ClientPackage into (or onto) a RETAINER project for that client — package name → project name, billingAmount → cycleAmount, PackageQuota rows → ProjectDeliverable rows, startMonth → cycleStartDate. Run it, then remove the client "Package" tab and its UI. Keep the old tables in the schema for one release, unused.
7) API: /api/projects/[id]/deliverables, /api/projects/[id]/members, /api/projects/[id]/cycles. All gated by capabilities.

Run the build and verify with the Smokzy client, which has two packages today.
```

**Manual checks**
1. As Admin: create a client, then a **RETAINER** project — deliverables 15 Reel / 5 Post / 1 Photo Shoot, ₹20,000 per month, start this month, open-ended, assign the SMM test user. It saves.
2. Immediately log in as that **SMM** → Tasks page shows **"New client onboarded — plan <project>"**; clicking it lands on the project's Plan tab (empty for now). A notification arrived too.
3. Smokzy's two old packages now exist as retainer projects with the right deliverables and amounts; the client **Package tab is gone**.
4. Project header shows deliverable chips + SMM avatars + a month/cycle selector. As SMM, the ₹20,000 is **not** visible; as Manager it is.
5. Create a **ONE-TIME** project with deliverables (5 Pages, 1 Logo) and a total amount + end date → single cycle created, no monthly repeat.
6. Add a second SMM to an existing project → they get their own planning task; re-adding the same SMM doesn't create a duplicate.

**Regression sweep:** existing projects (Acme Rebrand, Nova Retainer) still open, tasks/files/expenses tabs intact; client Projects tab still lists them; Golden Path.

---

## PHASE 3 — The SMM planning surface

**Goal:** the project's Plan tab is where the month gets planned, against the cycle's quotas.

**PROMPT**
```text
Read docs/V3_CONTEXT.md fully and follow its Prime Directive. Read the existing client content-calendar components, ContentItem model/APIs and the Phase-2 cycle model first. Reuse the existing month-grid component; do not fork it.

Implement Phase 3:
1) Schema: ContentItem gains cycleId (FK) and makes projectId required for newly created planned work (leave legacy rows as-is). Add billingIntent enum (INCLUDED default, EXTRA_BILLABLE, COMPLIMENTARY) and carryMode enum (INSIDE_QUOTA, ABOVE_QUOTA, nullable). Extend the status enum with SUBMITTED, CHANGES_REQUESTED, CARRIED_FORWARD (keep existing values).
2) Project detail: new FIRST tab "Plan". It shows the cycle selector (← Aug 2026 →, driven by ProjectCycle), quota meters per deliverable (e.g. Reels 4/15, Posts 2/5, Shoot 0/1) with an "extra" badge, Month / List views of that cycle's content items, and "+ Add content".
3) Add/Edit content dialog: Date, Creative Type (defaults to a deliverable type that still has quota left), Topic*, Content/Brief, Reference (URL or upload), and — inline — "Assign to" (a junior picker filtered to designations with canBeAssignedWork, optional; can be left for later). Saving with an assignee creates the task in the same action (Phase 4 defines the task shape); saving without one leaves the item PLANNED.
4) Quota guard: if the chosen creative type's quota for the cycle is already fully planned, warn "Reels quota is full (15/15) — this will be an EXTRA" and set billingIntent EXTRA_BILLABLE (overridable back to INCLUDED by admin/manager only).
5) Bulk planning helper: "Add multiple" — pick a creative type, a count, and a start date + interval (e.g. 15 reels, every 2 days from the 1st) → creates that many PLANNED items to be filled in; each still needs a topic before it can be assigned.
6) Client detail ▸ Content Calendar becomes a READ-ONLY roll-up: all of that client's projects' items for the month, colour-coded by project, with a link "Plan in <project>" per project. No add/edit there.
7) Master calendar keeps working; content chips now show the project name too.
8) Every create/status change goes through logStatus.

Run the build and plan a full month on the Phase-2 test project.
```

**Manual checks**
1. As **SMM**, open the planning task → Project ▸ Plan → cycle shows "Aug 2026", quota meters read 0/15 Reels, 0/5 Posts, 0/1 Shoot.
2. Add a reel: date, topic "Diwali teaser", brief, a reference link → chip appears on that date, Reels meter goes 1/15.
3. Use "Add multiple" to lay out 5 more reels every 2 days → meter 6/15, all PLANNED.
4. Add a 16th reel → warned that it's beyond quota and flagged **EXTRA**; as SMM you cannot flip it back to INCLUDED, as Admin you can.
5. Client page ▸ Content Calendar → shows the same items **read-only**, colour-coded by project, with a "Plan in <project>" link that takes you back.
6. `/calendar` (master) shows the items with client + project; filters still work.
7. As **Editor**, the project isn't reachable at all (no Projects nav).

**Regression sweep:** Acme's legacy content items still render on the client roll-up and master calendar; quota meters on old data don't crash; Golden Path.

---

## PHASE 4 — The junior's workspace (and the calendar fix)

**Goal:** assigned work actually reaches the person — in their Tasks page under an auto project list, and on their calendar.

**PROMPT**
```text
Read docs/V3_CONTEXT.md fully and follow its Prime Directive. Read the current /tasks page (Google-Tasks style with user-created lists), the task drawer, and /api/my-calendar first. Note defect #6: my-calendar returns only event+personal entries — assigned tasks and content never reach it. Fixing that is mandatory in this phase.

Implement Phase 4:
1) Schema: Task gains kind enum (PLANNING, CONTENT_WORK, POST, GENERAL, PERSONAL), revision Int default 1, approverId (FK User), submittedAt?, approvedAt?. Extend task status with CHANGES_REQUESTED. Migrate.
2) Assignment from planning (Phase 3) creates a CONTENT_WORK task: title = content topic, all SMM detail copied (topic, content/brief, referenceUrl/file, extraNote), client + project + contentItemId + cycleId linked, dueDate defaulting to publish date minus 2 days (editable), assignee = the junior, approverId = the assigning SMM. Content item → ASSIGNED. Notify the assignee.
3) REBUILD the Tasks page structure:
   - "My List" — personal reminders the user creates for themselves (the existing personal-item mechanism). This is the ONLY list anyone can create items in freely.
   - Auto lists — one per project in which the user has at least one open task, named after the project, appearing/disappearing automatically. Users CANNOT create, rename or delete lists; remove all custom-list UI and migrate any existing custom lists into My List.
   - "Approvals" entry for users with tasks.review (filled in Phase 5).
   - Header counts: open tasks in each list; overdue in red.
4) Task detail (one shared drawer used everywhere): header (topic, client · project, priority, due date, revision badge if >1); sub-tabs Details (the SMM's brief, content, reference — read-only for the assignee, editable for the assigner), Updates (status log + notes), Files, Chat (comments), History (StatusHistory). Assignee actions: "Start" (→ IN_PROGRESS) and "Submit for approval" (Phase 5 defines the dialog).
5) FIX /api/my-calendar: it must return, for the current user — (a) tasks assigned to them by dueDate, (b) content items whose task they hold, by publish date, (c) events, (d) personal items, (e) an overdue bucket. Keep the existing entry shape and layer toggles working. Verify each layer toggle actually filters something real.
6) Assigned tasks must appear on the assignee's My Calendar with a click-through to the task drawer.

Run the build; test with two accounts side by side (SMM in one browser profile, Editor in another).
```

**Manual checks**
1. As **SMM**, assign the "Diwali teaser" reel to the Editor. Content item flips to ASSIGNED and shows the linked task.
2. As **Editor** (second browser), `/tasks` shows an auto list named after the project containing that task — plus "My List". There is **no** way to create another list anywhere.
3. Open the task → all the SMM's details are there (topic, brief, reference link), sub-tabs Details/Updates/Files/Chat/History all render.
4. Editor's `/my-calendar` → the task appears on its due date; the content item appears on its publish date; clicking either opens the task. Toggle "Tasks" off → both task chips disappear.
5. Editor adds a personal reminder in My List → appears in My List and on their calendar; it never shows to anyone else.
6. Assign a **Photo Shoot** item to the Photographer → same behaviour under their own project list.
7. Editor clicks "Start" → status IN_PROGRESS, visible to the SMM on the item and in History.
8. Any old custom lists (smokzy, home) have been folded into My List; nothing was lost.

**Regression sweep:** project Tasks tab (list + kanban) still works and shows the same tasks; task drawer from the project page is the same component; Golden Path.

---

## PHASE 5 — Submit → review → approve / changes → post

**Goal:** the accountability loop. Nothing is "done" because someone said so — it's submitted with proof, reviewed, and either approved (which creates the posting task) or sent back as a new round.

**PROMPT**
```text
Read docs/V3_CONTEXT.md fully and follow its Prime Directive. Read the Phase-4 task drawer, the existing TaskDelivery/ChangeRequest models (if present) and the notification system first.

Implement Phase 5:
1) Schema: TaskSubmission(taskId, revision, method enum LINK|FILE|WHATSAPP|SLACK|OTHER, url?, fileId?, remarks, submittedById, submittedAt) and TaskReview(taskId, revision, decision enum APPROVED|CHANGES_REQUESTED, comments, reviewedById, reviewedAt). Reuse/fold in the older TaskDelivery + ChangeRequest models rather than duplicating concepts. Migrate.
2) SUBMIT (assignee): "Submit for approval" opens a dialog — How was it delivered? [Attach link / Upload file / Sent on WhatsApp / Sent on Slack / Other] + remarks (free text) + optional file. On submit: task status → IN_REVIEW, submittedAt set, TaskSubmission stored, content item → SUBMITTED, and the approver (SMM) is notified. Submitting without any method or remark is blocked.
3) REVIEW (approver): an "Approvals" inbox on the Tasks page for anyone with tasks.review, listing everything submitted to them: topic, client · project, who submitted, when, the submission (link opens, file previews, remarks). Two actions:
   - APPROVE → task DONE + approvedAt; content item → APPROVED; AND auto-create a POST task for the approving SMM: title "Post <topic> — <client>", kind POST, due on the content item's publish date, linked to the content item, appearing in that project's auto list and on their calendar.
   - REQUEST CHANGES → comments required. The SAME task reopens to the assignee: revision +1, status CHANGES_REQUESTED (then IN_PROGRESS when they start), all original details untouched, the review comments pinned at the top of the drawer with the previous submission still visible in Updates/History. Content item → CHANGES_REQUESTED. Assignee notified.
4) POST task completion: marking the POST task done sets the content item to POSTED with postedAt, and asks for an optional live link. Quota "posted" counters update.
5) The task drawer shows a clear round history: Round 1 submitted → changes requested (comments) → Round 2 submitted → approved, each with who and when.
6) Notifications for: assigned, submitted, changes requested, approved, post-task due today.

Run the build; walk the whole loop with SMM + Editor accounts.
```

**Manual checks**
1. As **Editor**, submit the reel: choose "Sent on WhatsApp", remarks "sent to Rohit, 9:30pm", attach a file → task goes to In Review; you can't submit with the dialog empty.
2. As **SMM**, Approvals inbox shows it with the remarks and file. Click **Request changes** with "make the hook shorter".
3. As **Editor**, the task is back with a **Round 2** badge, the comment pinned at top, all original brief/reference intact, and Round 1's submission still visible in History. Submit again with a link.
4. As **SMM**, **Approve** → the editor's task closes; a new task **"Post <topic> — <client>"** appears in your list and on your calendar, dated the publish date.
5. Mark that POST task done (optionally paste the live link) → the content item shows **POSTED**, and the project's posted counter goes up by one.
6. Project ▸ Plan and the master calendar both reflect POSTED; History on the task shows the full round trail with names and timestamps.
7. As **Manager/Admin**, you can also see and action the Approvals inbox for that project.

**Regression sweep:** tasks not in the content flow (general tasks, project tasks) still complete normally; old completed tasks unaffected; Golden Path.

---

## PHASE 6 — Cycle close: carry forward, extras, complimentary

**Goal:** end the month deliberately — nothing silently disappears, nothing is retyped, and billing intent is captured without the SMM ever touching money.

**PROMPT**
```text
Read docs/V3_CONTEXT.md fully and follow its Prime Directive. Read ProjectCycle, ContentItem (billingIntent, carryMode, carriedFromId) and the quota computation first.

Implement Phase 6:
1) Schema: BillableItem(organizationId, clientId, projectId?, cycleId?, contentItemId?, taskId?, label, kind enum PACKAGE|EXTRA|COMPLIMENTARY|ADHOC_TASK, flaggedById, amount Decimal?, status enum PENDING_PRICING|READY|INVOICED|WAIVED, invoiceId?, createdAt). Migrate.
2) "Close cycle" action on Project ▸ Plan (capability cycles.close), opening a wizard:
   STEP 1 — Summary: per deliverable type, quota vs planned vs posted vs missed vs extra (e.g. Reels 15 quota · 15 planned · 12 posted · 3 not posted).
   STEP 2 — Unposted items: one row each with [Carry forward ▾] → "Count inside next cycle's quota" or "Over and above next cycle's quota" — or [Drop, with reason]. Carrying clones the item into the next cycle with ALL details copied (topic, brief, reference, creative type), sets carriedFromId + carryMode, marks the original CARRIED_FORWARD, and lets the SMM pick a new date (defaults to the same weekday next cycle).
   STEP 3 — Extras / over-delivery: every item flagged EXTRA_BILLABLE or added beyond quota is listed; the SMM chooses per item "Bill this separately" or "Complimentary (free)". No amounts anywhere on this screen — show a note: "Pricing is set by your manager."
   STEP 4 — Confirm: cycle → CLOSED with closedAt/closedById; generate BillableItems — one PACKAGE line for the cycle (amount = project's cycleAmount, status READY), one EXTRA per bill-separately item (amount null, status PENDING_PRICING), one COMPLIMENTARY per free item (amount 1, status READY). Notify admins/managers: "<project> — Aug cycle closed · 2 extras need pricing".
3) A closed cycle is read-only for planning (no add/edit/assign); it can be reopened only by admin/manager, which is logged.
4) Next cycle's quota meters must account for carried-in items: INSIDE_QUOTA ones consume the quota, ABOVE_QUOTA ones sit outside it and show as a separate "carried in (extra)" badge.
5) Admin/Manager view: a "Needs pricing" list (Finance area or dashboard card) showing PENDING_PRICING BillableItems where they type the amount → status READY.
6) Every step writes StatusHistory.

Run the build; close a cycle on the test project end to end.
```

**Manual checks**
1. As **SMM** on the test project: post some items, leave 3 unposted, add 1 extra beyond quota and 1 festival freebie. Click **Close cycle**.
2. Step 1 numbers match reality (quota / planned / posted / missed / extra).
3. Step 2: carry 2 items "inside next cycle's quota" and 1 "above quota" → next cycle shows all 3 with their **original topic, brief and reference** already filled; the meters show 2 consuming quota and 1 as carried-in extra.
4. Step 3: mark the extra as "Bill separately" and the festival post as "Complimentary" — **no amounts are visible anywhere** on this screen.
5. Step 4: cycle closes; you can no longer add or edit content in it; the old month is read-only.
6. As **Manager**: a notification arrived; "Needs pricing" shows the EXTRA item with no amount → type ₹3,000 → it becomes READY. The PACKAGE line (₹20,000) is already READY; the complimentary line sits at ₹1.
7. As **Admin**, reopen the closed cycle → allowed and logged in History; as SMM, the reopen button isn't there.

**Regression sweep:** other projects' cycles unaffected; content items outside cycles still render; Golden Path.

---

## PHASE 7 — Invoicing from the closed cycle

**Goal:** admin/manager builds a client invoice by ticking what to bill; complimentary shows at ₹1; ad-hoc work can be added.

**PROMPT**
```text
Read docs/V3_CONTEXT.md fully and follow its Prime Directive. Read the invoice model + builder + PDF/letterhead code and the Phase-6 BillableItem model first.

Implement Phase 7:
1) Schema: InvoiceLineItem gains kind enum (PACKAGE|EXTRA|COMPLIMENTARY|ADHOC_TASK|CUSTOM), billableItemId?, and keeps label/qty/unitPrice/amount. Migrate. Existing invoices must render unchanged.
2) New Invoice → "Build from client": choose the client → the builder lists every unbilled BillableItem for them, grouped by project and cycle, each with a checkbox (ticked by default) and its amount: PACKAGE lines from the project, priced EXTRAs, COMPLIMENTARY at ₹1 with a "Complimentary" tag, and ADHOC_TASK lines. Anything still PENDING_PRICING is listed but greyed with "needs pricing" and cannot be ticked.
3) Ad-hoc work: billable tasks that belong to no project (kind GENERAL, marked billable) appear as ADHOC_TASK candidates; admin sets the amount inline.
4) Untick = excluded from this invoice and the item stays available for a later one. Amounts remain editable in the builder (the source BillableItem keeps its own value).
5) Totals + tax/discount as today, in the client's currency. PDF via the existing letterhead: package line(s), billed extras, then a "Complimentary" section listing ₹1 items.
6) On invoice create: ticked BillableItems → INVOICED with invoiceId; the ProjectCycle records invoiceId. Re-running the builder never re-offers invoiced items.
7) Client ▸ Invoices and project ▸ Invoices both list correctly (fix the long-standing empty project Invoices tab if still broken). SMM/Team never see any of this.

Run the build; invoice the closed cycle from Phase 6.
```

**Manual checks**
1. As **Manager**: New Invoice → Build from client → Acme (or your test client) → sees the ₹20,000 package line, the ₹3,000 extra, and the ₹1 complimentary line, grouped under the project/cycle.
2. Untick the extra → total drops; create the invoice → PDF shows package + complimentary section; the unticked extra is still available next time.
3. Build again → the invoiced lines are **gone** from the candidate list, the unticked extra is still there.
4. An item left at PENDING_PRICING appears greyed and can't be ticked until priced.
5. Add an ad-hoc billable general task with an amount → it appears as a candidate and invoices correctly.
6. As **SMM**, `/invoices` is unreachable and no amounts appear anywhere.
7. Project ▸ Invoices tab lists the invoice.

**Regression sweep:** old invoices open and print; receipts still link to invoices; expenses untouched; Golden Path.

---

## PHASE 8 — Role dashboards, reports, hardening

**Goal:** each role lands somewhere useful, the reports match the access matrix, and the whole thing is audited.

**PROMPT**
```text
Read docs/V3_CONTEXT.md fully and follow its Prime Directive.

Implement Phase 8:
1) Role-aware dashboard (one page, capability-driven blocks):
   - ADMIN: clients/projects health, revenue + outstanding + expenses, items needing pricing, cycles closing this week, overdue across the org, team workload.
   - MANAGER: same minus org P&L/revenue; keeps outstanding-per-client only if you want (default: hidden).
   - SMM: my projects with this cycle's progress bars (posted/quota), items awaiting my approval, my POST tasks due, unplanned deliverables left this cycle, overdue in my projects. No money.
   - TEAM: my tasks today/this week, changes requested on my work, my calendar preview. No money, no clients list.
2) Reports (/reports, gated): Delivery report (quota vs posted per client/project/cycle), Deadline report (missed/late tasks and items by person and by client), Team workload (open + submitted per person), Cycle close history. ADMIN additionally: revenue, invoiced vs collected, expenses, margin per client. MANAGER gets everything except that last group. SMM gets delivery for their own projects only. CSV export on each.
3) Notification pass: assigned / submitted / changes requested / approved / post-due-today / cycle-closing-in-3-days / item needs pricing / planning task overdue. Daily digest per role. Keep in-app only.
4) Hardening: (a) as each of the four roles, hit every API route directly and confirm no forbidden data comes back (write the checks down in docs/PERMISSION_AUDIT.md); (b) empty/loading/error states on all new screens; (c) mobile pass at ~390px for Tasks, My Calendar, Project ▸ Plan; (d) refresh the seed script so a fresh install demos the whole v3 flow (client → retainer project with deliverables → planned cycle → assigned tasks in each state → one closed cycle → one invoice); (e) re-run every phase's manual checks and fix regressions.

Run the build and report anything you couldn't fix.
```

**Manual checks**
1. Log in as each role in turn — the dashboard is genuinely different and nothing money-related leaks to SMM/Team.
2. `/reports`: Admin sees all groups; Manager sees all but revenue/margin; SMM sees only their projects' delivery; Team can't open it. CSV downloads work.
3. Trigger each notification once (assign, submit, request changes, approve, close a cycle) → the right people get them, nobody else does.
4. `docs/PERMISSION_AUDIT.md` exists and lists the routes checked per role.
5. Phone-width check on Tasks, My Calendar, Project ▸ Plan — usable, nothing overlapping.
6. Fresh seed (`prisma migrate reset`) → the full demo flow is there.
7. Spot-re-run Phase 0's defect checks (calendar alignment, day panel, completed expander) — still fixed.

---

## Traceability — your brief → where it lands

| Your requirement | Phase |
|---|---|
| Admin creates client, then project (one-time / retainer) | 2 |
| Deliverables (15 reels, 5 posts, 1 shoot) + amount + period | 2 |
| Assign SMM(s) → instant "plan this project" task | 2 |
| SMM plans the whole cycle on the project page | 3 |
| Assign to editor/photographer while planning or later | 3, 4 |
| Task instantly in the junior's task page, with all SMM details | 4 |
| Auto lists per project + "My List" only, no custom lists | 4 |
| Updates → In Progress → Completed with link/remarks ("sent on WhatsApp") | 5 |
| SMM approval; request changes recreates the task with prior details + comments | 5 |
| On approval, SMM gets the "post it" task, marks done | 5 |
| Month close: carry forward, inside-quota or above-quota, details copied | 6 |
| Over-delivery / complimentary; SMM flags bill-or-free, never sees amounts | 6 |
| Complimentary shown on the invoice at ₹1 | 6, 7 |
| Admin/manager sets amounts, builds client-wise invoice, ticks what to bill | 7 |
| Ad-hoc tasks outside projects billed too | 7 |
| Role permissions (admin / manager / SMM / dynamic juniors) | 1 |
| SMM sees no financials, only adds expenses | 1 |
| Juniors assign to nobody, only self-reminders | 1, 4 |
| Remove Stakeholders, Bookings, Rate Cards, Quotations | 0 |
| Efficiency, accountability (every step timestamped + attributed) | throughout (StatusHistory, rounds, submissions, reviews) |
