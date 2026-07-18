/**
 * Seed a fully-populated demo workspace for Rohit Saha (vibrnd2@gmail.com).
 * Idempotent-ish: removes any prior org with the same slug first.
 *
 * Run: npx tsx scripts/seed-demo-rohit.ts
 */
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/password";

const OWNER_EMAIL = "vibrnd2@gmail.com";
const OWNER_NAME = "Rohit Saha";
const ORG_SLUG = "vibrnd-demo";
const PASSWORD = "Vibrnd@2026"; // demo owner password

async function main() {
  // Clean any previous demo org (cascades to all its data)
  const existing = await prisma.organization.findFirst({ where: { slug: ORG_SLUG } });
  if (existing) {
    await prisma.organization.delete({ where: { id: existing.id } });
    console.log("Removed previous demo org", existing.id);
  }

  const org = await prisma.organization.create({
    data: {
      name: "Vibrnd Studio",
      slug: ORG_SLUG,
      email: "hello@vibrnd.studio",
      phone: "+91 98200 11223",
      website: "https://vibrnd.studio",
      currency: "INR",
      timezone: "Asia/Kolkata",
      dateFormat: "DD MMM YYYY",
      onboardingCompleted: true,
      onboardedAt: new Date(),
      letterheadEmail: "accounts@vibrnd.studio",
      letterheadPhone: "+91 98200 11223",
      letterheadWebsite: "vibrnd.studio",
      letterheadAddress: "3rd Floor, Design House, Andheri West, Mumbai 400053",
      letterheadColor: "#6366f1",
    },
  });

  const owner = await prisma.user.create({
    data: {
      organizationId: org.id,
      name: OWNER_NAME,
      email: OWNER_EMAIL,
      role: "OWNER",
      passwordHash: hashPassword(PASSWORD),
      passwordSetAt: new Date(),
    },
  });

  // A couple of teammates
  const [priya, arjun] = await Promise.all([
    prisma.user.create({ data: { organizationId: org.id, name: "Priya Nair", email: "priya@vibrnd.studio", role: "MANAGER" } }),
    prisma.user.create({ data: { organizationId: org.id, name: "Arjun Rao", email: "arjun@vibrnd.studio", role: "MEMBER" } }),
  ]);

  // ── Clients ──────────────────────────────────────────────
  const acme = await prisma.client.create({
    data: {
      organizationId: org.id, name: "Acme Beverages", companyName: "Acme Beverages",
      email: "brand@acmebev.com", phone: "+91 90000 10001", website: "https://acmebev.com",
      industry: "FMCG", address: "Bandra Kurla Complex, Mumbai", status: "ACTIVE",
      contacts: { create: [
        { name: "Meera Shah", email: "meera@acmebev.com", phone: "+91 90000 10002", jobTitle: "Marketing Head", isPrimary: true },
        { name: "Kabir Jain", email: "kabir@acmebev.com", jobTitle: "Brand Manager" },
      ] },
    },
  });
  const nova = await prisma.client.create({
    data: {
      organizationId: org.id, name: "Nova Fintech", companyName: "Nova Fintech Pvt Ltd",
      email: "growth@novafin.io", phone: "+91 90000 20001", website: "https://novafin.io",
      industry: "Fintech", address: "Koramangala, Bengaluru", status: "ACTIVE",
      contacts: { create: [
        { name: "Dev Menon", email: "dev@novafin.io", phone: "+91 90000 20002", jobTitle: "Founder", isPrimary: true },
      ] },
    },
  });

  // ── Rate cards (each row is one service) ─────────────────
  await prisma.rateCard.createMany({
    data: [
      { organizationId: org.id, name: "Brand Identity", category: "Design", unit: "project", unitPrice: 250000, currency: "INR", description: "Logo, guidelines, collateral" },
      { organizationId: org.id, name: "Social Media", category: "Marketing", unit: "month", unitPrice: 60000, currency: "INR" },
      { organizationId: org.id, name: "Video Production", category: "Production", unit: "video", unitPrice: 85000, currency: "INR" },
      { organizationId: org.id, name: "Website Design", category: "Design", unit: "project", unitPrice: 180000, currency: "INR" },
    ],
  });

  // ── Projects ─────────────────────────────────────────────
  const brandProject = await prisma.project.create({
    data: {
      organizationId: org.id, clientId: acme.id, createdById: owner.id,
      name: "Acme Rebrand 2026", description: "Full brand refresh for Acme's flagship line",
      type: "ONE_TIME", status: "ACTIVE", budget: 450000, currency: "INR",
      startDate: new Date("2026-06-01"), endDate: new Date("2026-09-15"),
    },
  });
  const retainer = await prisma.project.create({
    data: {
      organizationId: org.id, clientId: nova.id, createdById: owner.id,
      name: "Nova Social Retainer", description: "Monthly social content + campaigns",
      type: "RETAINER", status: "ACTIVE", budget: 60000, currency: "INR",
      startDate: new Date("2026-05-01"),
    },
  });

  // ── Tasks (with a subtask + assignees) ───────────────────
  const parent = await prisma.task.create({
    data: {
      organizationId: org.id, projectId: brandProject.id, title: "Logo exploration",
      status: "IN_PROGRESS", priority: "HIGH", order: 0, dueDate: new Date("2026-07-20"),
      managerId: priya.id,
      assignees: { create: [{ userId: arjun.id }] },
    },
  });
  await prisma.task.createMany({
    data: [
      { organizationId: org.id, projectId: brandProject.id, parentId: parent.id, title: "3 logo directions", status: "DONE", progress: 100, priority: "MEDIUM", order: 0 },
      { organizationId: org.id, projectId: brandProject.id, parentId: parent.id, title: "Client review round 1", status: "TODO", priority: "MEDIUM", order: 1 },
      { organizationId: org.id, projectId: brandProject.id, title: "Brand guidelines doc", status: "TODO", priority: "LOW", order: 1, dueDate: new Date("2026-08-10") },
      { organizationId: org.id, projectId: retainer.id, title: "July content calendar", status: "IN_PROGRESS", priority: "HIGH", order: 0, dueDate: new Date("2026-07-19") },
    ],
  });

  // ── Quotation (approved) ─────────────────────────────────
  const quote = await prisma.quotation.create({
    data: {
      organizationId: org.id, clientId: acme.id, number: "QUO-2026-001",
      title: "Acme Rebrand Proposal", status: "APPROVED", pricingType: "FIXED",
      currency: "INR", discountType: "PERCENT", discountValue: 5, taxRate: 18,
      subtotal: 450000, total: 504900, validUntil: new Date("2026-08-31"),
      notes: "50% advance to kick off.", terms: "Payment within 15 days of invoice.",
      lineItems: { create: [
        { title: "Brand Identity", description: "Logo + guidelines", pricingType: "FIXED", quantity: 1, unitPrice: 250000, subtotal: 250000, order: 0 },
        { title: "Packaging Design", pricingType: "PER_ITEM", quantity: 4, unitPrice: 50000, unit: "SKUs", subtotal: 200000, order: 1 },
      ] },
    },
  });

  // ── Invoices ─────────────────────────────────────────────
  const inv1 = await prisma.invoice.create({
    data: {
      organizationId: org.id, clientId: acme.id, projectId: brandProject.id, quotationId: quote.id,
      invoiceNumber: "INV-2026-001", status: "PAID", currency: "INR",
      discountPct: 5, taxPct: 18, dueDate: new Date("2026-06-15"), paidAt: new Date("2026-06-12"),
      notes: "Advance invoice — 50%.",
      lineItems: { create: [{ description: "Advance — Acme Rebrand (50%)", quantity: 1, unitPrice: 250000, order: 0 }] },
    },
  });
  await prisma.invoice.create({
    data: {
      organizationId: org.id, clientId: nova.id, projectId: retainer.id,
      invoiceNumber: "INV-2026-002", status: "SENT", currency: "INR",
      taxPct: 18, dueDate: new Date("2026-07-31"), notes: "July retainer.",
      lineItems: { create: [{ description: "Social retainer — July 2026", quantity: 1, unitPrice: 60000, order: 0 }] },
    },
  });

  // ── Receipt against paid invoice ─────────────────────────
  await prisma.receipt.create({
    data: {
      organizationId: org.id, clientId: acme.id, invoiceId: inv1.id,
      amount: 295000, currency: "INR", method: "BANK_TRANSFER",
      reference: "NEFT-AXIS-99120", receiptNumber: "RCPT-2026-001", receivedAt: new Date("2026-06-12"),
    },
  });

  // ── Stakeholder + expenses ───────────────────────────────
  const vendor = await prisma.stakeholder.create({
    data: { organizationId: org.id, name: "Lumen Print Co", type: "VENDOR", email: "sales@lumenprint.in", phone: "+91 90000 55555" },
  });
  await prisma.expense.createMany({
    data: [
      { organizationId: org.id, title: "Stock photography", amount: 8500, currency: "INR", category: "STOCK_ASSETS", status: "APPROVED", projectId: brandProject.id, date: new Date("2026-06-20") },
      { organizationId: org.id, title: "Print proofs", amount: 12000, currency: "INR", category: "PRINTING", status: "PAID", projectId: brandProject.id, stakeholderId: vendor.id, date: new Date("2026-06-28") },
      { organizationId: org.id, title: "Design software (annual)", amount: 45000, currency: "INR", category: "SOFTWARE_TOOLS", status: "PENDING", clientId: null, date: new Date("2026-07-01") },
    ],
  });

  // ── Contract ─────────────────────────────────────────────
  await prisma.contract.create({
    data: {
      organizationId: org.id, clientId: acme.id, projectId: brandProject.id,
      title: "Master Services Agreement — Acme", type: "SERVICE_AGREEMENT", status: "DRAFT",
      value: 450000, currency: "INR", startDate: new Date("2026-06-01"),
      notes: "Covers the full rebrand engagement.",
      parties: { create: [
        { partyType: "CLIENT", clientId: acme.id, name: "Meera Shah", email: "meera@acmebev.com" },
        { partyType: "USER", userId: owner.id, name: OWNER_NAME, email: OWNER_EMAIL },
      ] },
    },
  });

  // ── Folder + a couple of file records ────────────────────
  const folder = await prisma.folder.create({
    data: { organizationId: org.id, name: "Acme Brand Assets", clientId: acme.id },
  });
  await prisma.file.createMany({
    data: [
      { organizationId: org.id, uploadedById: owner.id, name: "acme-logo-v1.png", mimeType: "image/png", mimeCategory: "image", size: 248_000, s3Key: "demo/acme-logo-v1.png", s3Bucket: "local", url: "/uploads/demo-acme-logo.png", status: "IN_REVIEW", projectId: brandProject.id, folderId: folder.id },
      { organizationId: org.id, uploadedById: owner.id, name: "moodboard.pdf", mimeType: "application/pdf", mimeCategory: "pdf", size: 1_120_000, s3Key: "demo/moodboard.pdf", s3Bucket: "local", url: "/uploads/demo-moodboard.pdf", status: "DRAFT", projectId: brandProject.id, folderId: folder.id },
    ],
  });

  console.log("\n✅ Demo workspace seeded");
  console.log("   Org:      Vibrnd Studio (", org.id, ")");
  console.log("   Owner:   ", OWNER_NAME, "<" + OWNER_EMAIL + ">");
  console.log("   Password:", PASSWORD);
  console.log("   Clients: 2 · Projects: 2 · Quote: 1 · Invoices: 2 · Contract: 1\n");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
