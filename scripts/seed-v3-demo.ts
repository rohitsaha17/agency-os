/**
 * V3 Phase 8 — a demo of the whole v3 flow, end to end.
 *
 * Builds the story the product is actually about, on top of whatever the base
 * seed created:
 *
 *   client → retainer project with deliverables → an SMM and their planning task
 *   → a planned cycle → tasks in every state (todo, in progress, submitted,
 *   changes requested, approved, posted) → one closed cycle with carry-forward,
 *   a billable extra and a complimentary → one invoice built from it
 *
 * Idempotent: a marker on the project means re-running updates rather than
 * duplicating. Run the base seed and scripts/seed-v3-test-users.ts first.
 *
 *   npx tsx scripts/seed-v3-demo.ts
 */
import { prisma, disconnect } from "./_client";
import { ensureCycles, currentCycle } from "../lib/cycles";
import { createPlanningTask, createContentWorkTask } from "../lib/auto-tasks";
import { submit, approve, requestChanges, markPosted } from "../lib/review-loop";
import { closeCycle, closeSummary } from "../lib/cycle-close";

const MARKER = "[v3-demo]";
const PROJECT_NAME = "Acme Social — v3 Demo";

async function main() {
  const org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  if (!org) throw new Error("No organization — run the base seed first.");

  const [smm, editor, shooter, admin] = await Promise.all([
    prisma.user.findFirst({ where: { organizationId: org.id, email: "smm@vibrnd.test" }, select: { id: true } }),
    prisma.user.findFirst({ where: { organizationId: org.id, email: "editor@vibrnd.test" }, select: { id: true } }),
    prisma.user.findFirst({ where: { organizationId: org.id, email: "shooter@vibrnd.test" }, select: { id: true } }),
    prisma.user.findFirst({ where: { organizationId: org.id, email: "admin@vibrnd.test" }, select: { id: true } }),
  ]);
  if (!smm || !editor || !shooter || !admin) {
    throw new Error("Test users missing — run scripts/seed-v3-test-users.ts first.");
  }

  const client = await prisma.client.findFirst({
    where: { organizationId: org.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  if (!client) throw new Error("No client — run the base seed first.");

  const types = await prisma.creativeType.findMany({
    where: { organizationId: org.id },
    select: { id: true, name: true },
  });
  const typeId = (name: string) => types.find((t) => t.name === name)?.id ?? types[0].id;

  // ── Already built? ──
  const existing = await prisma.project.findFirst({
    where: { organizationId: org.id, description: { contains: MARKER } },
    select: { id: true, name: true },
  });
  if (existing) {
    console.log(`= ${existing.name} already exists — nothing to do.`);
    console.log("  Delete that project and re-run for a clean demo.");
    return;
  }

  console.log(`Building the v3 demo on "${org.name}" / ${client.name}…\n`);

  // ── 1. A retainer project carrying the deal ──
  const now = new Date();
  const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

  const project = await prisma.project.create({
    data: {
      organizationId: org.id,
      clientId: client.id,
      name: PROJECT_NAME,
      description: `Monthly social retainer. ${MARKER}`,
      type: "RETAINER",
      status: "ACTIVE",
      currency: "INR",
      cycleAmount: 20000,
      cycleUnit: "MONTH",
      cycleStartDate: lastMonth,
      startDate: lastMonth,
      deliverables: {
        create: [
          { creativeTypeId: typeId("Reel"), qtyPerCycle: 6, sortOrder: 0 },
          { creativeTypeId: typeId("Post"), qtyPerCycle: 4, sortOrder: 1 },
          { creativeTypeId: typeId("Photo Shoot"), qtyPerCycle: 1, sortOrder: 2 },
        ],
      },
    },
    select: { id: true, name: true },
  });
  console.log(`  + ${project.name} — 6 Reels, 4 Posts, 1 Shoot at ₹20,000/month`);

  await ensureCycles(project.id, now);

  // ── 2. The SMM joins, which creates their planning task ──
  await prisma.projectMember.create({
    data: { projectId: project.id, userId: smm.id, role: "SMM", addedById: admin.id },
  });
  await createPlanningTask({
    organizationId: org.id, projectId: project.id, userIds: [smm.id], createdById: admin.id,
  });
  console.log("  + SMM assigned — planning task created automatically");

  const cycles = await prisma.projectCycle.findMany({
    where: { projectId: project.id },
    orderBy: { startDate: "asc" },
    select: { id: true, label: true, startDate: true },
  });
  const previous = cycles[0];
  const current = (await currentCycle(project.id, now))!;

  // ── 3. Last month: planned, worked, closed ──
  const day = (cycleStart: Date, n: number) => {
    const d = new Date(cycleStart);
    d.setUTCDate(n);
    return d;
  };

  const plan = async (cycleId: string, cycleStart: Date, rows: {
    day: number; type: string; topic: string; brief?: string; extra?: boolean;
  }[]) => {
    const made: { id: string; topic: string }[] = [];
    for (const r of rows) {
      const item = await prisma.contentItem.create({
        data: {
          organizationId: org.id,
          clientId: client.id,
          projectId: project.id,
          cycleId,
          date: day(cycleStart, r.day),
          creativeTypeId: typeId(r.type),
          topic: r.topic,
          description: r.brief ?? null,
          isExtra: !!r.extra,
          billingIntent: r.extra ? "EXTRA_BILLABLE" : "INCLUDED",
          createdById: smm.id,
        },
        select: { id: true, topic: true },
      });
      made.push(item);
    }
    return made;
  };

  const past = await plan(previous.id, previous.startDate, [
    { day: 3,  type: "Reel", topic: "Monsoon mood reel",     brief: "15s, rain visuals, trending audio" },
    { day: 7,  type: "Post", topic: "Founder Q&A carousel",  brief: "5 slides, brand palette" },
    { day: 12, type: "Reel", topic: "Behind the scenes",     brief: "Handheld, raw feel" },
    { day: 18, type: "Post", topic: "Customer testimonial",  brief: "Quote card, dark theme" },
    { day: 22, type: "Photo Shoot", topic: "Monthly product shoot", brief: "Studio, 3 SKUs" },
    { day: 26, type: "Reel", topic: "Festive teaser — extra", brief: "Client asked mid-month", extra: true },
  ]);

  // Four go all the way through the loop, one is left unposted to carry.
  for (const [i, item] of past.entries()) {
    const assignee = item.topic.includes("shoot") ? shooter.id : editor.id;
    const taskId = await createContentWorkTask({
      organizationId: org.id, contentItemId: item.id,
      assigneeId: assignee, approverId: smm.id,
    });
    if (!taskId) continue;

    if (i === 3) continue; // one left untouched, to be carried forward

    await submit({
      taskId, organizationId: org.id, userId: assignee,
      method: i % 2 === 0 ? "LINK" : "WHATSAPP",
      url: i % 2 === 0 ? `https://drive.example/${item.id}` : null,
      remarks: i % 2 === 0 ? "First cut, colour graded" : "Sent on WhatsApp, 9:30pm",
    });

    // One goes back a round, so the demo shows a real revision trail.
    if (i === 2) {
      await requestChanges({
        taskId, organizationId: org.id, userId: smm.id,
        comments: "Make the hook shorter — first two seconds are slow.",
      });
      await submit({
        taskId, organizationId: org.id, userId: assignee,
        method: "LINK", url: `https://drive.example/${item.id}-v2`,
        remarks: "Tightened the hook as asked",
      });
    }

    const { postTaskId } = await approve({ taskId, organizationId: org.id, userId: smm.id });
    if (postTaskId) {
      await markPosted({
        taskId: postTaskId, organizationId: org.id, userId: smm.id,
        liveUrl: `https://instagram.com/p/${item.id.slice(-8)}`,
      });
    }
  }
  console.log(`  + ${previous.label}: 6 planned, 5 through the full loop (one with a second round)`);

  // Close it: carry the untouched one, bill the extra, gift nothing.
  const summary = await closeSummary(previous.id, org.id);
  if (summary) {
    await closeCycle({
      cycleId: previous.id, organizationId: org.id, userId: smm.id,
      carry: summary.unposted.map((i) => ({
        itemId: i.id, action: "CARRY" as const, carryMode: "INSIDE_QUOTA" as const,
      })),
      extras: summary.extras.map((e) => ({
        itemId: e.id,
        intent: e.topic.includes("Festive") ? ("BILL" as const) : ("FREE" as const),
      })),
    });
    console.log(`  + ${previous.label} closed — unposted carried forward, extra flagged to bill`);
  }

  // ── 4. This month: mid-flight, so every state is visible ──
  const live = await plan(current.id, current.startDate, [
    { day: 4,  type: "Reel", topic: "Diwali teaser",        brief: "30s vertical, festive palette" },
    { day: 9,  type: "Post", topic: "Diwali countdown",     brief: "Carousel, 5 slides, CTA last" },
    { day: 14, type: "Reel", topic: "Recipe reel",          brief: "Overhead, quick cuts" },
    { day: 20, type: "Photo Shoot", topic: "Festive product shoot", brief: "Studio, festive props" },
  ]);

  // One assigned and started, one submitted and waiting, one sent back.
  const t0 = await createContentWorkTask({ organizationId: org.id, contentItemId: live[0].id, assigneeId: editor.id, approverId: smm.id });
  if (t0) await prisma.task.update({ where: { id: t0 }, data: { status: "IN_PROGRESS" } });

  const t1 = await createContentWorkTask({ organizationId: org.id, contentItemId: live[1].id, assigneeId: editor.id, approverId: smm.id });
  if (t1) {
    await submit({
      taskId: t1, organizationId: org.id, userId: editor.id,
      method: "LINK", url: "https://drive.example/diwali-countdown",
      remarks: "Five slides, copy on the last one",
    });
  }

  const t2 = await createContentWorkTask({ organizationId: org.id, contentItemId: live[2].id, assigneeId: editor.id, approverId: smm.id });
  if (t2) {
    await submit({
      taskId: t2, organizationId: org.id, userId: editor.id,
      method: "WHATSAPP", remarks: "Sent the cut on WhatsApp",
    });
    await requestChanges({
      taskId: t2, organizationId: org.id, userId: smm.id,
      comments: "Audio is out of sync from 0:12.",
    });
  }

  await createContentWorkTask({ organizationId: org.id, contentItemId: live[3].id, assigneeId: shooter.id, approverId: smm.id });
  console.log(`  + ${current.label}: in progress, submitted, changes requested and assigned — one of each`);

  // ── 5. Invoice the closed cycle ──
  const billables = await prisma.billableItem.findMany({
    where: { cycleId: previous.id, status: { in: ["READY", "PENDING_PRICING"] } },
    select: { id: true, label: true, kind: true, amount: true, contentItemId: true, status: true },
  });
  // Price the extra, the way a manager would.
  for (const b of billables.filter((x) => x.status === "PENDING_PRICING")) {
    await prisma.billableItem.update({ where: { id: b.id }, data: { amount: 3000, status: "READY" } });
  }

  const priced = await prisma.billableItem.findMany({
    where: { cycleId: previous.id, status: "READY" },
    select: { id: true, label: true, kind: true, amount: true, contentItemId: true },
  });
  const last = await prisma.invoice.findFirst({
    where: { organizationId: org.id },
    orderBy: { createdAt: "desc" },
    select: { invoiceNumber: true },
  });
  const nextNumber = `INV-${now.getFullYear()}-${String(
    Number(last?.invoiceNumber?.split("-").pop() ?? 0) + 1,
  ).padStart(3, "0")}`;

  const invoice = await prisma.invoice.create({
    data: {
      organizationId: org.id,
      clientId: client.id,
      invoiceNumber: nextNumber,
      status: "SENT",
      currency: "INR",
      taxPct: 18,
      dueDate: new Date(now.getTime() + 15 * 86400000),
      notes: `${previous.label} retainer and extras.`,
      lineItems: {
        create: priced.map((b, i) => ({
          description: b.label,
          quantity: 1,
          unitPrice: Number(b.amount ?? 0),
          order: i,
          kind: b.kind,
          isFree: false,
          contentItemId: b.contentItemId,
          billableItemId: b.id,
        })),
      },
    },
    select: { id: true, invoiceNumber: true },
  });
  await prisma.billableItem.updateMany({
    where: { id: { in: priced.map((b) => b.id) } },
    data: { status: "INVOICED", invoiceId: invoice.id },
  });
  await prisma.projectCycle.update({ where: { id: previous.id }, data: { invoiceId: invoice.id } });
  console.log(`  + ${invoice.invoiceNumber} raised from ${previous.label} (${priced.length} lines)`);

  console.log("\nDemo ready. Sign in as smm@vibrnd.test to see the plan,");
  console.log("editor@vibrnd.test for the junior's view, or manager@vibrnd.test for the money.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(disconnect);
