/**
 * V3 Phase 1 — create one user per role so the flows can actually be tested.
 *
 * Most checks from Phase 4 on need two sessions side by side (an SMM in one
 * browser profile, an editor in another), so these accounts all share a known
 * password, printed at the end of the run.
 *
 *   npx tsx scripts/seed-v3-test-users.ts
 *
 * Idempotent: re-running updates the existing accounts rather than duplicating.
 */
import { prisma, disconnect } from "./_client";
import { hashPassword } from "../lib/password";

const PASSWORD = "Studio@2026";

const TEST_USERS = [
  // An admin test account so the admin-only flows can be checked without
  // touching the real owner's password.
  { email: "admin@vibrnd.test",   name: "Riya Kapoor",  role: "ADMIN" as const,   designation: null },
  { email: "manager@vibrnd.test", name: "Priya Menon",  role: "MANAGER" as const, designation: null },
  // No designation: planning is what the SMM ROLE means. A job label
  // would only repeat it (see the fix-smm-designation migration).
  { email: "smm@vibrnd.test",     name: "Kabir Shah",   role: "SMM" as const,     designation: null },
  { email: "editor@vibrnd.test",  name: "Ananya Das",   role: "TEAM" as const,    designation: "editor" },
  { email: "shooter@vibrnd.test", name: "Vikram Iyer",  role: "TEAM" as const,    designation: "photographer" },
];

async function main() {
  // Seed into the organization that actually has data, so the test accounts
  // land next to the demo clients rather than in an empty tenant.
  const org = await prisma.organization.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  if (!org) throw new Error("No organization found — seed the demo data first.");

  const designations = await prisma.designationRole.findMany({
    where: { organizationId: org.id },
    select: { id: true, slug: true, name: true },
  });
  const bySlug = new Map(designations.map((d) => [d.slug, d]));

  console.log(`Seeding test users into "${org.name}"…\n`);

  for (const u of TEST_USERS) {
    const designationId = u.designation ? bySlug.get(u.designation)?.id ?? null : null;
    if (u.designation && !designationId) {
      console.warn(`  ! designation "${u.designation}" not found — leaving unset`);
    }

    const existing = await prisma.user.findFirst({
      where: { organizationId: org.id, email: u.email },
      select: { id: true },
    });

    const data = {
      name: u.name,
      role: u.role,
      designationId,
      isActive: true,
      passwordHash: hashPassword(PASSWORD),
      passwordSetAt: new Date(),
    };

    if (existing) {
      await prisma.user.update({ where: { id: existing.id }, data });
      console.log(`  ↻ ${u.email.padEnd(24)} ${u.role.padEnd(8)} ${u.designation ?? "—"}`);
    } else {
      await prisma.user.create({
        data: { ...data, organizationId: org.id, email: u.email },
      });
      console.log(`  + ${u.email.padEnd(24)} ${u.role.padEnd(8)} ${u.designation ?? "—"}`);
    }
  }

  console.log(`\nPassword for all ${TEST_USERS.length} accounts: ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(disconnect);
