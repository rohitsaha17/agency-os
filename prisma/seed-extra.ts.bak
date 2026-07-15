/**
 * Extra dummy data — more contracts + more quotations
 * Run:  PATH="/usr/local/bin:$PATH" npx --yes tsx prisma/seed-extra.ts
 */
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgresql://rohitsaha@localhost:5432/agency_management" });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  /* ── IDs from the existing seed ── */
  const c_aakash   = "cmnkhwzk60006w2slfnsisda5"; // Aakash Joshi
  const c_deepa    = "cmnkhwzk60005w2sloe5b5j8u"; // Deepa Krishnan
  const c_ramesh   = "cmnkhwzk70007w2sle0jmwr56"; // Ramesh Gupta
  const c_sunita   = "cmnkhwzk70008w2slcjm5r3n2"; // Sunita Patel
  const c_vikram   = "cmnkhwzk70009w2sl8mmlqspv"; // Vikram Nair

  const u_rohit    = "cmnkhwzjk0000w2slcp4wunn9"; // Rohit Saha (Admin)
  const u_priya    = "cmnkhwzjl0001w2sln14fg040"; // Priya Sharma
  const u_arjun    = "cmnkhwzjl0002w2slz61ml7g8"; // Arjun Mehta
  const u_neha     = "cmnkhwzjl0003w2slmiysx7n3"; // Neha Kapoor

  const p_horizon  = "cmnkhwzkx000tw2slsop7ghn1"; // Horizon Luxury Campaign
  const p_mindful  = "cmnkhwzkz000vw2slw6ye1w56"; // MindfulMed Clinic Website
  const p_fresbbrew = "cmnkhwzku000rw2slc6y9c2eb"; // FreshBrew Brand Identity
  const p_technova = "cmnkhwzks000qw2slmwksl0gz"; // TechNova Website Redesign

  /* ── 1. Extra Contracts (varied statuses for PDF testing) ── */
  const contracts = [
    {
      title: "Horizon Luxury Campaign — NDA",
      type: "NDA" as const,
      status: "FULLY_SIGNED" as const,
      clientId: c_ramesh,
      projectId: p_horizon,
      startDate: new Date("2026-01-10"),
      endDate: new Date("2027-01-09"),
      value: null,
      currency: "USD",
      notes: "Standard mutual NDA covering campaign strategy, creative assets, and media planning.",
      parties: [
        { partyType: "CLIENT" as const, clientId: c_ramesh, name: "Ramesh Gupta", email: "ramesh@horizonluxury.com", signedAt: new Date("2026-01-10"), signatureNote: "Signed via email" },
        { partyType: "USER" as const,   userId: u_rohit,    name: "Rohit Saha",   email: "rohit@vibrnd.in",          signedAt: new Date("2026-01-10"), signatureNote: "Signed in person" },
      ],
    },
    {
      title: "FreshBrew Brand Identity — Creative Services Agreement",
      type: "SERVICE_AGREEMENT" as const,
      status: "PARTIALLY_SIGNED" as const,
      clientId: c_deepa,
      projectId: p_fresbbrew,
      startDate: new Date("2026-02-01"),
      endDate: new Date("2026-06-30"),
      value: 320000,
      currency: "INR",
      notes: "Covers brand strategy, logo design, visual identity system, packaging mockups, and brand guidelines. Payment schedule: 40% on signing, 30% at midpoint delivery, 30% on final handover.",
      parties: [
        { partyType: "CLIENT" as const, clientId: c_deepa, name: "Deepa Krishnan", email: "deepa@freshbrew.in", signedAt: new Date("2026-02-01"), signatureNote: "Signed via DocuSign" },
        { partyType: "USER" as const,   userId: u_rohit,   name: "Rohit Saha",     email: "rohit@vibrnd.in",    signedAt: null, signatureNote: null },
        { partyType: "USER" as const,   userId: u_priya,   name: "Priya Sharma",   email: "priya@vibrnd.in",    signedAt: null, signatureNote: null },
      ],
    },
    {
      title: "MindfulMed Clinic Website — Development Contract",
      type: "SERVICE_AGREEMENT" as const,
      status: "SENT" as const,
      clientId: c_sunita,
      projectId: p_mindful,
      startDate: new Date("2026-03-01"),
      endDate: new Date("2026-09-30"),
      value: 2500,
      currency: "USD",
      notes: "Full-stack website development including patient portal, appointment booking, SEO optimisation, and 6-month maintenance warranty.",
      parties: [
        { partyType: "CLIENT" as const, clientId: c_sunita, name: "Sunita Patel", email: "sunita@mindfulmed.in", signedAt: null, signatureNote: null },
        { partyType: "USER" as const,   userId: u_arjun,    name: "Arjun Mehta",  email: "arjun@vibrnd.in",      signedAt: null, signatureNote: null },
      ],
    },
    {
      title: "Vikram Nair — Photography Services NDA",
      type: "NDA" as const,
      status: "DRAFT" as const,
      clientId: c_vikram,
      startDate: null,
      endDate: null,
      value: null,
      currency: "USD",
      notes: "One-way NDA for photographic brief, brand reference materials, and unreleased campaign concepts.",
      parties: [
        { partyType: "CLIENT" as const, clientId: c_vikram, name: "Vikram Nair",  email: "vikram@nair.in",    signedAt: null, signatureNote: null },
        { partyType: "USER" as const,   userId: u_rohit,    name: "Rohit Saha",   email: "rohit@vibrnd.in",   signedAt: null, signatureNote: null },
      ],
    },
    {
      title: "TechNova Website Redesign — Project Change Order #1",
      type: "SERVICE_AGREEMENT" as const,
      status: "FULLY_SIGNED" as const,
      clientId: c_aakash,
      projectId: p_technova,
      startDate: new Date("2026-02-15"),
      endDate: new Date("2026-05-31"),
      value: 1800,
      currency: "USD",
      notes: "Change order adds: e-commerce module (WooCommerce), custom checkout flow, inventory dashboard, and 3 additional rounds of revisions. Original contract reference: TN-CONTRACT-001.",
      parties: [
        { partyType: "CLIENT" as const, clientId: c_aakash, name: "Aakash Joshi",  email: "aakash@technova.in",  signedAt: new Date("2026-02-15"), signatureNote: "Signed digitally" },
        { partyType: "USER" as const,   userId: u_rohit,    name: "Rohit Saha",    email: "rohit@vibrnd.in",     signedAt: new Date("2026-02-16"), signatureNote: "Counter-signed" },
        { partyType: "USER" as const,   userId: u_neha,     name: "Neha Kapoor",   email: "neha@vibrnd.in",      signedAt: new Date("2026-02-16"), signatureNote: "PM approval" },
      ],
    },
    {
      title: "Aakash Joshi — Annual Retainer Agreement 2026",
      type: "SERVICE_AGREEMENT" as const,
      status: "FULLY_SIGNED" as const,
      clientId: c_aakash,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
      value: 24000,
      currency: "USD",
      notes: "Monthly retainer covering: up to 80hrs/month of design + development work, dedicated project manager, 48-hour response SLA, monthly reporting, and priority queue. Billed on the 1st of each month.",
      parties: [
        { partyType: "CLIENT" as const, clientId: c_aakash, name: "Aakash Joshi", email: "aakash@technova.in", signedAt: new Date("2026-01-02"), signatureNote: "Signed via HelloSign" },
        { partyType: "USER" as const,   userId: u_rohit,    name: "Rohit Saha",   email: "rohit@vibrnd.in",    signedAt: new Date("2026-01-03"), signatureNote: "Signed via HelloSign" },
      ],
    },
  ];

  console.log("Skipping contracts (already seeded)…");
  if (false) for (const c of contracts) {
    const { parties, ...data } = c;
    const contract = await prisma.contract.create({
      data: {
        ...data,
        parties: {
          create: parties.map((p) => ({
            partyType: p.partyType,
            clientId: p.partyType === "CLIENT" ? p.clientId : null,
            userId:   p.partyType === "USER"   ? p.userId   : null,
            name:     p.name,
            email:    p.email,
            signedAt: p.signedAt,
            signatureNote: p.signatureNote,
          })),
        },
      },
    });
    console.log("  ✓", contract.title, `[${contract.status}]`);
  }

  /* ── 2. Extra Quotations (Q6–Q8 only, Q5 already exists) ── */
  console.log("\nSeeding extra quotations…");

  const q2 = await prisma.quotation.create({
    data: {
      number: "QUO-2026-006",
      title: "Sunita Patel — HR Consulting Firm Brand Identity",
      status: "SENT",
      clientId: c_sunita,
      pricingType: "PER_ITEM",
      currency: "INR",
      validUntil: new Date("2026-05-15"),
      description: "Complete brand identity system for a boutique HR consulting firm — from naming audit through to digital and print brand guidelines.",
      notes: "Deliverables include editable source files (Figma + AI). Any trademark search or registration costs are billed at cost.",
      terms: "30% on approval. 30% on mid-stage delivery. 40% on final handover. Payment via bank transfer within 7 days of each milestone.",
      subtotal: 195000,
      discountType: "NONE",
      discountValue: 0,
      taxRate: 18,
      total: 230100,
      createdById: u_priya,
      lineItems: {
        create: [
          { order: 0, title: "Brand Discovery Workshop",          description: "2-hour facilitated session + report",                   pricingType: "FIXED",    quantity: 1,  unitPrice: 15000,  subtotal: 15000 },
          { order: 1, title: "Logo Design",                       description: "Primary + secondary + monogram + usage rules",          pricingType: "FIXED",    quantity: 1,  unitPrice: 45000,  subtotal: 45000 },
          { order: 2, title: "Colour Palette & Typography System",description: "Primary + extended palette, font licensing guidance",   pricingType: "FIXED",    quantity: 1,  unitPrice: 20000,  subtotal: 20000 },
          { order: 3, title: "Brand Guidelines Document",         description: "50-page PDF + Figma master file",                      pricingType: "FIXED",    quantity: 1,  unitPrice: 25000,  subtotal: 25000 },
          { order: 4, title: "Business Card Design",              description: "Front + back, print-ready files",                      pricingType: "PER_ITEM", quantity: 2,  unitPrice: 8000,   subtotal: 16000 },
          { order: 5, title: "Letterhead + Email Signature",      description: "A4 letterhead + HTML email sig",                       pricingType: "FIXED",    quantity: 1,  unitPrice: 12000,  subtotal: 12000 },
          { order: 6, title: "Social Media Profile Templates",    description: "LinkedIn, Instagram — 6 post templates + covers",      pricingType: "PER_ITEM", quantity: 12, unitPrice: 2000,   subtotal: 24000 },
          { order: 7, title: "Presentation Template",             description: "20-slide PowerPoint + Google Slides master",           pricingType: "FIXED",    quantity: 1,  unitPrice: 18000,  subtotal: 18000 },
          { order: 8, title: "Brand Launch Announcement Assets",  description: "Email banner, social announcement graphic",            pricingType: "FIXED",    quantity: 1,  unitPrice: 20000,  subtotal: 20000 },
        ],
      },
    },
  });
  console.log("  ✓", q2.number, q2.title.substring(0, 45));

  const q3 = await prisma.quotation.create({
    data: {
      number: "QUO-2026-007",
      title: "Vikram Nair — E-Commerce Website",
      status: "DRAFT",
      clientId: c_vikram,
      pricingType: "FIXED",
      currency: "USD",
      validUntil: new Date("2026-06-01"),
      description: "Build a high-performance WooCommerce store for Vikram's artisan leather goods brand — 200-300 SKUs, custom product configurator, and integrated shipping.",
      notes: "Hosting, domain, and SSL billed separately. Payment gateway fees (2.5%) not included.",
      terms: "40% deposit on project kick-off. 30% on staging delivery. 30% on go-live. All IP transferred on final payment.",
      subtotal: 9800,
      discountType: "AMOUNT",
      discountValue: 300,
      taxRate: 0,
      total: 9500,
      createdById: u_arjun,
      lineItems: {
        create: [
          { order: 0, title: "UX/UI Design (Figma)",              description: "Homepage, PDPs, cart/checkout, mobile-first",       pricingType: "FIXED",    quantity: 1, unitPrice: 2800, subtotal: 2800 },
          { order: 1, title: "WooCommerce Development",           description: "Custom theme, product importer, tax configuration", pricingType: "FIXED",    quantity: 1, unitPrice: 3500, subtotal: 3500 },
          { order: 2, title: "Product Configurator Module",       description: "Colour/size picker, live price update, image swap", pricingType: "FIXED",    quantity: 1, unitPrice: 1500, subtotal: 1500 },
          { order: 3, title: "Shipping Integration",              description: "Shiprocket + EasyPost API, live rates at checkout", pricingType: "FIXED",    quantity: 1, unitPrice: 800,  subtotal: 800 },
          { order: 4, title: "Content Migration",                 description: "Up to 300 products from spreadsheet",               pricingType: "PER_ITEM", quantity: 300, unitPrice: 0.4, subtotal: 120 },
          { order: 5, title: "QA Testing & Go-Live Support",      description: "Cross-browser, cross-device, performance testing",  pricingType: "FIXED",    quantity: 1, unitPrice: 600,  subtotal: 600 },
          { order: 6, title: "Training Session (2×1hr)",          description: "WooCommerce admin training, recorded",               pricingType: "PER_ITEM", quantity: 2, unitPrice: 250,  subtotal: 500 },
        ],
      },
    },
  });
  console.log("  ✓", q3.number, q3.title.substring(0, 45));

  const q4 = await prisma.quotation.create({
    data: {
      number: "QUO-2026-008",
      title: "Deepa Krishnan — FreshBrew 6-Month Social Retainer",
      status: "APPROVED",
      clientId: c_deepa,
      pricingType: "RETAINER",
      currency: "INR",
      validUntil: new Date("2026-04-30"),
      description: "Monthly social media retainer covering strategy, content creation, scheduling, and performance reporting for FreshBrew across Instagram, Facebook, and LinkedIn.",
      notes: "Includes up to 24 posts/month (across 3 platforms), 4 Reels/month, story content, and a monthly analytics report. Ad spend managed separately with 15% agency fee.",
      terms: "Billed monthly in advance on the 1st. 30-day notice period for cancellation. Unused posts do not roll over.",
      subtotal: 420000,
      discountType: "NONE",
      discountValue: 0,
      taxRate: 18,
      total: 495600,
      createdById: u_priya,
      lineItems: {
        create: [
          { order: 0, title: "Social Media Strategy & Planning",   description: "Monthly content calendar + campaign planning",   pricingType: "RETAINER", quantity: 6, unitPrice: 12000, subtotal: 72000 },
          { order: 1, title: "Content Creation — Posts (×24/mo)", description: "Graphic + caption for each post",                pricingType: "RETAINER", quantity: 6, unitPrice: 24000, subtotal: 144000 },
          { order: 2, title: "Instagram Reels (×4/mo)",           description: "Short-form video, editing, captioning",          pricingType: "RETAINER", quantity: 6, unitPrice: 16000, subtotal: 96000 },
          { order: 3, title: "Community Management",               description: "Daily comment + DM responses, up to 2hrs/day",  pricingType: "RETAINER", quantity: 6, unitPrice: 8000,  subtotal: 48000 },
          { order: 4, title: "Monthly Performance Report",         description: "Reach, engagement, follower growth analysis",   pricingType: "RETAINER", quantity: 6, unitPrice: 6000,  subtotal: 36000 },
          { order: 5, title: "Ad Management Fee (15% of spend)",   description: "Based on estimated ₹1.5L/mo ad budget",         pricingType: "RETAINER", quantity: 6, unitPrice: 4000,  subtotal: 24000 },
        ],
      },
    },
  });
  console.log("  ✓", q4.number, q4.title.substring(0, 45));

  console.log("\n✅ Extra seed complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
