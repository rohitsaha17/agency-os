/**
 * V3 Phase 2 — convert client packages into retainer projects.
 *
 * v2 hung the monthly deal off the CLIENT (ClientPackage + PackageQuota).
 * v3 hangs it off the PROJECT, because the project is the commercial unit
 * (docs/V3_CONTEXT.md §3). This moves each active package across:
 *
 *   package name    → project name
 *   billingAmount   → project.cycleAmount
 *   PackageQuota[]  → ProjectDeliverable[]
 *   startMonth      → project.cycleStartDate
 *   endMonth        → project.cycleEndDate
 *
 * A client with two concurrent packages (say social + website) ends up with
 * two retainer projects, which is exactly the shape v3 wants.
 *
 *   npx tsx scripts/migrate-packages-to-projects.ts [--dry-run]
 *
 * Idempotent: a package already migrated is recognised by its marker project
 * and skipped, so re-running is safe.
 */
import { prisma, disconnect } from "./_client";
import { ensureCycles } from "../lib/cycles";

const DRY = process.argv.includes("--dry-run");

/** Stamped into the project description so a re-run can recognise its work. */
function marker(packageId: string) {
  return `[migrated-from-package:${packageId}]`;
}

async function main() {
  const packages = await prisma.clientPackage.findMany({
    where: { isActive: true },
    include: {
      quotas: { include: { creativeType: { select: { id: true, name: true } } } },
      client: { select: { id: true, name: true, currency: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`${packages.length} active package(s)${DRY ? " — DRY RUN" : ""}\n`);

  let created = 0, attached = 0, skipped = 0;

  for (const pkg of packages) {
    const tag = marker(pkg.id);

    // Already migrated?
    const done = await prisma.project.findFirst({
      where: { organizationId: pkg.organizationId, description: { contains: tag } },
      select: { id: true, name: true },
    });
    if (done) {
      console.log(`  = ${pkg.client.name} / ${pkg.name} → already migrated (${done.name})`);
      skipped++;
      continue;
    }

    // Prefer attaching to the client's existing retainer project when it has
    // no deal on it yet — agencies often created the project first and the
    // package second, and two rows for one engagement would be worse.
    const existingRetainer = await prisma.project.findFirst({
      where: {
        organizationId: pkg.organizationId,
        clientId: pkg.clientId,
        type: "RETAINER",
        cycleAmount: null,
        deliverables: { none: {} },
      },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    });

    const deliverables = pkg.quotas.map((q, i) => ({
      creativeTypeId: q.creativeTypeId,
      qtyPerCycle: q.monthlyQty,
      sortOrder: i,
    }));

    const commercials = {
      type: "RETAINER" as const,
      cycleAmount: pkg.billingAmount,
      cycleUnit: "MONTH" as const,
      cycleStartDate: pkg.startMonth,
      cycleEndDate: pkg.endMonth,
      currency: pkg.currency ?? pkg.client.currency ?? "USD",
    };

    const summary = deliverables
      .map((d) => `${d.qtyPerCycle}× ${pkg.quotas.find((q) => q.creativeTypeId === d.creativeTypeId)?.creativeType.name}`)
      .join(", ");

    if (DRY) {
      console.log(
        existingRetainer
          ? `  → ${pkg.client.name} / ${pkg.name}: would attach to "${existingRetainer.name}" (${summary})`
          : `  + ${pkg.client.name} / ${pkg.name}: would create retainer project (${summary})`,
      );
      continue;
    }

    let projectId: string;
    if (existingRetainer) {
      const updated = await prisma.project.update({
        where: { id: existingRetainer.id },
        data: {
          ...commercials,
          description: `${pkg.notes ?? ""}\n${tag}`.trim(),
          deliverables: { create: deliverables },
        },
        select: { id: true, name: true },
      });
      projectId = updated.id;
      console.log(`  ↳ ${pkg.client.name} / ${pkg.name} → attached to "${updated.name}" (${summary})`);
      attached++;
    } else {
      const project = await prisma.project.create({
        data: {
          organizationId: pkg.organizationId,
          clientId: pkg.clientId,
          name: pkg.name,
          description: `${pkg.notes ?? "Monthly retainer."}\n${tag}`.trim(),
          status: "ACTIVE",
          startDate: pkg.startMonth,
          endDate: pkg.endMonth,
          ...commercials,
          deliverables: { create: deliverables },
        },
        select: { id: true, name: true },
      });
      projectId = project.id;
      console.log(`  + ${pkg.client.name} / ${pkg.name} → created "${project.name}" (${summary})`);
      created++;
    }

    await ensureCycles(projectId);
  }

  console.log(
    `\n${created} project(s) created, ${attached} attached to an existing retainer, ${skipped} already migrated.`,
  );
  if (!DRY) {
    console.log("The old client_packages rows are left in place, unused, for one release.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(disconnect);
