import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

async function main() {
  console.log("🌱 Seeding database...");

  // ─── Clean up existing data ───────────────────────────────────────────────
  await prisma.messageAttachment.deleteMany();
  await prisma.chatMessage.deleteMany();
  await prisma.channelMember.deleteMany();
  await prisma.channel.deleteMany();
  await prisma.fileComment.deleteMany();
  await prisma.fileTag.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.fileVersion.deleteMany();
  await prisma.file.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.timeEntry.deleteMany();
  await prisma.taskAssignee.deleteMany();
  await prisma.taskDependency.deleteMany();
  await prisma.task.deleteMany();
  await prisma.contractParty.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.quotationLineItem.deleteMany();
  await prisma.quotation.deleteMany();
  await prisma.rateCard.deleteMany();
  await prisma.stakeholder.deleteMany();
  await prisma.project.deleteMany();
  await prisma.clientContact.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.companySettings.deleteMany();

  console.log("✅ Cleared existing data");

  // ─── Company Settings ─────────────────────────────────────────────────────
  await prisma.companySettings.create({
    data: {
      id: "singleton",
      name: "Vibrnd Creative Studio",
      email: "hello@vibrnd.in",
      phone: "+91 98765 43210",
      website: "https://vibrnd.in",
      address: "4th Floor, Innovation Hub, MG Road",
      city: "Bangalore, Karnataka 560001",
      country: "India",
      currency: "INR",
      timezone: "Asia/Kolkata",
      dateFormat: "DD/MM/YYYY",
      letterheadHeader: "Vibrnd Creative Studio",
      letterheadAddress: "4th Floor, Innovation Hub\nMG Road, Bangalore 560001\nKarnataka, India",
      letterheadPhone: "+91 98765 43210",
      letterheadEmail: "hello@vibrnd.in",
      letterheadWebsite: "www.vibrnd.in",
      letterheadFooter: "Thank you for your business. All prices exclusive of applicable taxes.",
      letterheadColor: "#6366f1",
    },
  });
  console.log("✅ Company settings");

  // ─── Users ────────────────────────────────────────────────────────────────
  const users = await Promise.all([
    prisma.user.create({ data: { name: "Rohit Saha", email: "rohit@vibrnd.in", role: "ADMIN", isActive: true } }),
    prisma.user.create({ data: { name: "Priya Sharma", email: "priya@vibrnd.in", role: "MANAGER", isActive: true } }),
    prisma.user.create({ data: { name: "Arjun Mehta", email: "arjun@vibrnd.in", role: "MANAGER", isActive: true } }),
    prisma.user.create({ data: { name: "Neha Kapoor", email: "neha@vibrnd.in", role: "MEMBER", isActive: true } }),
    prisma.user.create({ data: { name: "Kiran Bose", email: "kiran@vibrnd.in", role: "MEMBER", isActive: true } }),
  ]);
  const [rohit, priya, arjun, neha, kiran] = users;
  console.log("✅ Users (5)");

  // ─── Clients ──────────────────────────────────────────────────────────────
  const clients = await Promise.all([
    prisma.client.create({
      data: {
        name: "Ramesh Gupta", companyName: "TechNova Solutions", email: "ramesh@technova.com",
        phone: "+91 98100 11223", website: "https://technova.com", industry: "Technology",
        address: "Whitefield, Bangalore", status: "ACTIVE",
        contacts: { create: [
          { name: "Ramesh Gupta", jobTitle: "CEO", email: "ramesh@technova.com", phone: "+91 98100 11223", isPrimary: true },
          { name: "Anita Singh", jobTitle: "Marketing Head", email: "anita@technova.com" },
        ]},
      },
    }),
    prisma.client.create({
      data: {
        name: "Sunita Patel", companyName: "FreshBrew Co.", email: "sunita@freshbrew.in",
        phone: "+91 87654 32109", website: "https://freshbrew.in", industry: "Food & Beverage",
        address: "Koramangala, Bangalore", status: "ACTIVE",
        contacts: { create: [{ name: "Sunita Patel", jobTitle: "Founder", email: "sunita@freshbrew.in", isPrimary: true }] },
      },
    }),
    prisma.client.create({
      data: {
        name: "Vikram Nair", companyName: "Horizon Real Estate", email: "vikram@horizonre.in",
        phone: "+91 99887 76655", website: "https://horizonre.in", industry: "Real Estate",
        address: "Indiranagar, Bangalore", status: "ACTIVE",
        contacts: { create: [{ name: "Vikram Nair", jobTitle: "Director", email: "vikram@horizonre.in", isPrimary: true }] },
      },
    }),
    prisma.client.create({
      data: {
        name: "Deepa Krishnan", companyName: "MindfulMed Clinic", email: "deepa@mindfulmed.in",
        phone: "+91 76543 21098", industry: "Healthcare",
        address: "JP Nagar, Bangalore", status: "PROSPECT",
      },
    }),
    prisma.client.create({
      data: {
        name: "Aakash Joshi", companyName: "EduSpark Learning", email: "aakash@eduspark.com",
        phone: "+91 88776 65544", website: "https://eduspark.com", industry: "Education",
        address: "HSR Layout, Bangalore", status: "INACTIVE",
      },
    }),
  ]);
  const [technova, freshbrew, horizon, mindfulmed, eduspark] = clients;
  console.log("✅ Clients (5)");

  // ─── Rate Cards ───────────────────────────────────────────────────────────
  const rateCards = await Promise.all([
    prisma.rateCard.create({ data: { name: "UI/UX Design", unit: "hour", unitPrice: 2500, currency: "INR", category: "Design", description: "User interface & experience design" } }),
    prisma.rateCard.create({ data: { name: "Brand Identity Design", unit: "project", unitPrice: 75000, currency: "INR", category: "Design", description: "Logo + brand guidelines" } }),
    prisma.rateCard.create({ data: { name: "Frontend Development", unit: "hour", unitPrice: 3000, currency: "INR", category: "Development", description: "React/Next.js development" } }),
    prisma.rateCard.create({ data: { name: "Full Website (5 pages)", unit: "project", unitPrice: 150000, currency: "INR", category: "Development", description: "Design + dev, responsive" } }),
    prisma.rateCard.create({ data: { name: "Social Media Management", unit: "month", unitPrice: 25000, currency: "INR", category: "Marketing", description: "4 posts/week, stories, engagement" } }),
    prisma.rateCard.create({ data: { name: "SEO Package", unit: "month", unitPrice: 18000, currency: "INR", category: "Marketing", description: "On-page SEO + monthly reporting" } }),
    prisma.rateCard.create({ data: { name: "Video Production (60s)", unit: "project", unitPrice: 45000, currency: "INR", category: "Video", description: "Concept to delivery, 60-second brand video" } }),
    prisma.rateCard.create({ data: { name: "Copywriting", unit: "page", unitPrice: 3500, currency: "INR", category: "Content", description: "Website / marketing copy per page" } }),
  ]);
  console.log("✅ Rate Cards (8)");

  // ─── Stakeholders ─────────────────────────────────────────────────────────
  await Promise.all([
    prisma.stakeholder.create({ data: { name: "Raj Freelancer", type: "FREELANCER", email: "raj.design@gmail.com", phone: "+91 90000 11111", skills: ["Illustration", "Motion Graphics"], defaultRate: 1800, currency: "INR", isActive: true } }),
    prisma.stakeholder.create({ data: { name: "PixelCraft Studio", type: "AGENCY", email: "hello@pixelcraft.in", website: "https://pixelcraft.in", skills: ["3D Rendering", "Animation"], isActive: true } }),
    prisma.stakeholder.create({ data: { name: "PrintMaster", type: "VENDOR", email: "orders@printmaster.in", phone: "+91 80000 99999", notes: "Preferred print vendor, 3-day turnaround", isActive: true } }),
    prisma.stakeholder.create({ data: { name: "Sonal Copywriter", type: "FREELANCER", email: "sonal.writes@gmail.com", skills: ["Copywriting", "Content Strategy"], defaultRate: 2000, currency: "INR", isActive: true } }),
  ]);
  console.log("✅ Stakeholders (4)");

  // ─── Projects ─────────────────────────────────────────────────────────────
  const proj1 = await prisma.project.create({
    data: {
      clientId: technova.id, name: "TechNova Website Redesign", description: "Complete redesign of TechNova's corporate website with new brand guidelines",
      type: "ONE_TIME", serviceType: "website", status: "ACTIVE",
      startDate: new Date("2026-03-01"), endDate: new Date("2026-05-31"),
      budget: 250000, currency: "INR", createdById: rohit.id,
    },
  });

  const proj2 = await prisma.project.create({
    data: {
      clientId: freshbrew.id, name: "FreshBrew Brand Identity", description: "Brand identity design including logo, color palette, typography and brand guidelines",
      type: "ONE_TIME", serviceType: "branding", status: "ACTIVE",
      startDate: new Date("2026-03-15"), endDate: new Date("2026-04-30"),
      budget: 95000, currency: "INR", createdById: priya.id,
    },
  });

  const proj3 = await prisma.project.create({
    data: {
      clientId: freshbrew.id, name: "FreshBrew Social Media", description: "Monthly social media management — Instagram, Facebook, LinkedIn",
      type: "RETAINER", serviceType: "social_media", recurringFrequency: "monthly", status: "ACTIVE",
      startDate: new Date("2026-02-01"),
      budget: 25000, currency: "INR", createdById: arjun.id,
    },
  });

  const proj4 = await prisma.project.create({
    data: {
      clientId: horizon.id, name: "Horizon Luxury Campaign", description: "Full digital marketing campaign for new luxury residential project",
      type: "ONE_TIME", serviceType: "paid_ads", status: "ON_HOLD",
      startDate: new Date("2026-04-10"), endDate: new Date("2026-06-30"),
      budget: 180000, currency: "INR", createdById: rohit.id,
    },
  });

  const proj5 = await prisma.project.create({
    data: {
      clientId: technova.id, name: "TechNova SEO Retainer", description: "Monthly SEO — keyword strategy, content, link building, monthly reports",
      type: "RETAINER", serviceType: "seo", recurringFrequency: "monthly", status: "ACTIVE",
      startDate: new Date("2026-01-01"),
      budget: 18000, currency: "INR", createdById: priya.id,
    },
  });

  const proj6 = await prisma.project.create({
    data: {
      clientId: mindfulmed.id, name: "MindfulMed Clinic Website", description: "New website for healthcare clinic — appointment booking + blog",
      type: "ONE_TIME", serviceType: "website", status: "DRAFT",
      budget: 120000, currency: "INR", createdById: rohit.id,
    },
  });

  const projects = [proj1, proj2, proj3, proj4, proj5, proj6];
  console.log("✅ Projects (6)");

  // ─── Tasks for TechNova Website Redesign ──────────────────────────────────
  const t1 = await prisma.task.create({ data: { projectId: proj1.id, title: "Discovery & Strategy", status: "DONE", priority: "HIGH", progress: 100, estimatedHours: 8 } });
  await prisma.task.create({ data: { projectId: proj1.id, parentId: t1.id, title: "Stakeholder interviews", status: "DONE", priority: "HIGH", progress: 100 } });
  await prisma.task.create({ data: { projectId: proj1.id, parentId: t1.id, title: "Competitor analysis", status: "DONE", priority: "MEDIUM", progress: 100 } });
  await prisma.task.create({ data: { projectId: proj1.id, parentId: t1.id, title: "Content audit & sitemap", status: "DONE", priority: "MEDIUM", progress: 100 } });

  const t2 = await prisma.task.create({ data: { projectId: proj1.id, title: "UX Design", status: "IN_PROGRESS", priority: "HIGH", progress: 60, estimatedHours: 24, dueDate: new Date("2026-04-15") } });
  await prisma.task.create({ data: { projectId: proj1.id, parentId: t2.id, title: "Wireframes — Desktop", status: "DONE", priority: "HIGH", progress: 100 } });
  await prisma.task.create({ data: { projectId: proj1.id, parentId: t2.id, title: "Wireframes — Mobile", status: "IN_PROGRESS", priority: "HIGH", progress: 70 } });
  await prisma.task.create({ data: { projectId: proj1.id, parentId: t2.id, title: "Prototype & user testing", status: "TODO", priority: "MEDIUM", progress: 0 } });

  const t3 = await prisma.task.create({ data: { projectId: proj1.id, title: "Visual Design", status: "TODO", priority: "HIGH", progress: 0, estimatedHours: 32, dueDate: new Date("2026-04-30") } });
  await prisma.task.create({ data: { projectId: proj1.id, parentId: t3.id, title: "Home page design", status: "TODO", priority: "HIGH", progress: 0 } });
  await prisma.task.create({ data: { projectId: proj1.id, parentId: t3.id, title: "Inner pages design", status: "TODO", priority: "MEDIUM", progress: 0 } });
  await prisma.task.create({ data: { projectId: proj1.id, parentId: t3.id, title: "Design system & components", status: "TODO", priority: "MEDIUM", progress: 0 } });

  await prisma.task.create({ data: { projectId: proj1.id, title: "Frontend Development", status: "TODO", priority: "HIGH", progress: 0, estimatedHours: 60, dueDate: new Date("2026-05-20") } });
  await prisma.task.create({ data: { projectId: proj1.id, title: "CMS Setup & Content", status: "TODO", priority: "MEDIUM", progress: 0, estimatedHours: 12 } });
  await prisma.task.create({ data: { projectId: proj1.id, title: "QA & Launch", status: "TODO", priority: "URGENT", progress: 0, estimatedHours: 8, dueDate: new Date("2026-05-30") } });

  // ─── Tasks for FreshBrew Brand Identity ───────────────────────────────────
  const tb1 = await prisma.task.create({ data: { projectId: proj2.id, title: "Brand Discovery", status: "DONE", priority: "HIGH", progress: 100 } });
  await prisma.task.create({ data: { projectId: proj2.id, parentId: tb1.id, title: "Brand questionnaire", status: "DONE", priority: "MEDIUM", progress: 100 } });
  await prisma.task.create({ data: { projectId: proj2.id, parentId: tb1.id, title: "Moodboard creation", status: "DONE", priority: "MEDIUM", progress: 100 } });

  const tb2 = await prisma.task.create({ data: { projectId: proj2.id, title: "Logo Design", status: "IN_REVIEW", priority: "HIGH", progress: 90, dueDate: new Date("2026-04-10") } });
  await prisma.task.create({ data: { projectId: proj2.id, parentId: tb2.id, title: "Logo concepts (3 options)", status: "DONE", priority: "HIGH", progress: 100 } });
  await prisma.task.create({ data: { projectId: proj2.id, parentId: tb2.id, title: "Logo refinement", status: "IN_REVIEW", priority: "HIGH", progress: 80 } });

  await prisma.task.create({ data: { projectId: proj2.id, title: "Brand Guidelines Document", status: "TODO", priority: "HIGH", progress: 0, dueDate: new Date("2026-04-25") } });
  await prisma.task.create({ data: { projectId: proj2.id, title: "Brand Collateral Design", status: "TODO", priority: "MEDIUM", progress: 0, dueDate: new Date("2026-04-30") } });

  // ─── Tasks for FreshBrew Social Media (retainer) ──────────────────────────
  await prisma.task.create({ data: { projectId: proj3.id, title: "March Content Calendar", status: "DONE", priority: "HIGH", progress: 100 } });
  await prisma.task.create({ data: { projectId: proj3.id, title: "March Posts (16 posts)", status: "DONE", priority: "HIGH", progress: 100 } });
  await prisma.task.create({ data: { projectId: proj3.id, title: "April Content Calendar", status: "IN_PROGRESS", priority: "HIGH", progress: 50, dueDate: new Date("2026-04-05") } });
  await prisma.task.create({ data: { projectId: proj3.id, title: "April Posts (16 posts)", status: "TODO", priority: "HIGH", progress: 0, dueDate: new Date("2026-04-30") } });
  await prisma.task.create({ data: { projectId: proj3.id, title: "Monthly Analytics Report — March", status: "IN_PROGRESS", priority: "MEDIUM", progress: 40, dueDate: new Date("2026-04-07") } });

  // ─── Tasks for TechNova SEO ───────────────────────────────────────────────
  await prisma.task.create({ data: { projectId: proj5.id, title: "Keyword Research — April", status: "DONE", priority: "HIGH", progress: 100 } });
  await prisma.task.create({ data: { projectId: proj5.id, title: "On-page SEO Audit", status: "IN_PROGRESS", priority: "HIGH", progress: 60, dueDate: new Date("2026-04-10") } });
  await prisma.task.create({ data: { projectId: proj5.id, title: "Blog Articles (4 posts)", status: "IN_PROGRESS", priority: "MEDIUM", progress: 25, dueDate: new Date("2026-04-25") } });
  await prisma.task.create({ data: { projectId: proj5.id, title: "Link Building Outreach", status: "TODO", priority: "MEDIUM", progress: 0, dueDate: new Date("2026-04-28") } });
  await prisma.task.create({ data: { projectId: proj5.id, title: "Monthly SEO Report — March", status: "BLOCKED", priority: "HIGH", progress: 0, dueDate: new Date("2026-04-05") } });

  console.log("✅ Tasks (35+)");

  // ─── Assign tasks to users ────────────────────────────────────────────────
  const allTasks = await prisma.task.findMany({ select: { id: true, projectId: true } });
  const proj1Tasks = allTasks.filter(t => t.projectId === proj1.id);
  const proj2Tasks = allTasks.filter(t => t.projectId === proj2.id);
  const proj3Tasks = allTasks.filter(t => t.projectId === proj3.id);

  for (const task of proj1Tasks.slice(0, 8)) {
    await prisma.taskAssignee.create({ data: { taskId: task.id, userId: neha.id } }).catch(() => {});
  }
  for (const task of proj2Tasks.slice(0, 5)) {
    await prisma.taskAssignee.create({ data: { taskId: task.id, userId: priya.id } }).catch(() => {});
  }
  for (const task of proj3Tasks) {
    await prisma.taskAssignee.create({ data: { taskId: task.id, userId: arjun.id } }).catch(() => {});
  }
  console.log("✅ Task assignments");

  // ─── Quotations ───────────────────────────────────────────────────────────
  const q1 = await prisma.quotation.create({
    data: {
      number: "QUO-2026-001",
      clientId: technova.id,
      title: "TechNova Website Redesign — Full Proposal",
      pricingType: "FIXED", status: "APPROVED",
      currency: "INR", subtotal: 230000, taxRate: 18, total: 271400,
      validUntil: new Date("2026-03-31"),
      notes: "Includes 2 rounds of design revisions. Hosting and domain not included.",
      terms: "50% advance, 50% on delivery. Payment due within 15 days of invoice.",
      createdById: rohit.id,
      lineItems: { create: [
        { title: "UX Research & Wireframing", pricingType: "FIXED", quantity: 1, unitPrice: 35000, subtotal: 35000 },
        { title: "Visual Design (8 pages)", pricingType: "FIXED", quantity: 1, unitPrice: 80000, subtotal: 80000 },
        { title: "Frontend Development", pricingType: "PER_ITEM", quantity: 60, unitPrice: 3000, subtotal: 180000, unit: "hour" },
        { title: "CMS Integration & Setup", pricingType: "FIXED", quantity: 1, unitPrice: 25000, subtotal: 25000 },
        { title: "QA Testing & Launch Support", pricingType: "FIXED", quantity: 1, unitPrice: 15000, subtotal: 15000 },
      ]},
    },
  });

  const q2 = await prisma.quotation.create({
    data: {
      number: "QUO-2026-002",
      clientId: freshbrew.id,
      title: "FreshBrew Brand Identity Package",
      pricingType: "FIXED", status: "SENT",
      currency: "INR", subtotal: 85000, taxRate: 18, total: 100300,
      validUntil: new Date("2026-04-15"),
      createdById: priya.id,
      lineItems: { create: [
        { title: "Logo Design (3 concepts + refinements)", pricingType: "FIXED", quantity: 1, unitPrice: 35000, subtotal: 35000 },
        { title: "Brand Color Palette & Typography", pricingType: "FIXED", quantity: 1, unitPrice: 15000, subtotal: 15000 },
        { title: "Brand Guidelines Document (PDF)", pricingType: "FIXED", quantity: 1, unitPrice: 20000, subtotal: 20000 },
        { title: "Stationery Design (card, letterhead, envelope)", pricingType: "FIXED", quantity: 1, unitPrice: 15000, subtotal: 15000 },
      ]},
    },
  });

  const q3 = await prisma.quotation.create({
    data: {
      number: "QUO-2026-003",
      clientId: freshbrew.id,
      title: "Social Media Management — Monthly Retainer",
      pricingType: "RETAINER", status: "APPROVED",
      currency: "INR", subtotal: 25000, taxRate: 18, total: 29500,
      validUntil: new Date("2026-12-31"),
      notes: "Monthly retainer. Billed on 1st of each month.",
      createdById: arjun.id,
      lineItems: { create: [
        { title: "Content Strategy & Calendar", pricingType: "FIXED", quantity: 1, unitPrice: 5000, subtotal: 5000 },
        { title: "Post Creation (16 posts/month)", pricingType: "PER_ITEM", quantity: 16, unitPrice: 800, subtotal: 12800, unit: "post" },
        { title: "Stories & Reels (8/month)", pricingType: "PER_ITEM", quantity: 8, unitPrice: 600, subtotal: 4800, unit: "piece" },
        { title: "Community Management & Engagement", pricingType: "FIXED", quantity: 1, unitPrice: 4000, subtotal: 4000 },
        { title: "Monthly Analytics Report", pricingType: "FIXED", quantity: 1, unitPrice: 2400, subtotal: 2400 },
      ]},
    },
  });

  const q4 = await prisma.quotation.create({
    data: {
      number: "QUO-2026-004",
      clientId: mindfulmed.id,
      title: "MindfulMed Clinic Website — Proposal",
      pricingType: "FIXED", status: "DRAFT",
      currency: "INR", subtotal: 110000, taxRate: 18, total: 129800,
      validUntil: new Date("2026-05-01"),
      createdById: rohit.id,
      lineItems: { create: [
        { title: "Website Design (7 pages)", pricingType: "FIXED", quantity: 1, unitPrice: 55000, subtotal: 55000 },
        { title: "Appointment Booking Integration", pricingType: "FIXED", quantity: 1, unitPrice: 25000, subtotal: 25000 },
        { title: "Blog Setup & SEO Optimization", pricingType: "FIXED", quantity: 1, unitPrice: 15000, subtotal: 15000 },
        { title: "Content Writing (7 pages)", pricingType: "PER_ITEM", quantity: 7, unitPrice: 2143, subtotal: 15000, unit: "page" },
      ]},
    },
  });

  // Link quotations to projects
  await Promise.all([
    prisma.project.update({ where: { id: proj1.id }, data: { quotationId: q1.id } }),
    prisma.project.update({ where: { id: proj2.id }, data: { quotationId: q2.id } }),
    prisma.project.update({ where: { id: proj3.id }, data: { quotationId: q3.id } }),
  ]);
  console.log("✅ Quotations (4)");

  // ─── Expenses ─────────────────────────────────────────────────────────────
  await Promise.all([
    prisma.expense.create({ data: { title: "Adobe Creative Cloud", category: "SOFTWARE_TOOLS", amount: 5499, currency: "INR", status: "PAID", date: new Date("2026-04-01"), notes: "Annual subscription — monthly billing" } }),
    prisma.expense.create({ data: { title: "Figma Professional", category: "SOFTWARE_TOOLS", amount: 1200, currency: "INR", status: "PAID", date: new Date("2026-04-01"), projectId: proj1.id } }),
    prisma.expense.create({ data: { title: "Raj Freelancer — March Illustration", category: "FREELANCER_PAYMENT", amount: 18000, currency: "INR", status: "PAID", date: new Date("2026-04-02"), projectId: proj2.id } }),
    prisma.expense.create({ data: { title: "PrintMaster — FreshBrew Packaging Samples", category: "VENDOR_PAYMENT", amount: 8500, currency: "INR", status: "APPROVED", date: new Date("2026-04-03"), projectId: proj2.id, isReimbursable: true } }),
    prisma.expense.create({ data: { title: "Stock Photography — TechNova", category: "STOCK_ASSETS", amount: 4200, currency: "INR", status: "PAID", date: new Date("2026-03-28"), projectId: proj1.id } }),
    prisma.expense.create({ data: { title: "Google Ads — Horizon Campaign", category: "ADVERTISING", amount: 35000, currency: "INR", status: "PENDING", date: new Date("2026-04-04"), projectId: proj4.id, isReimbursable: true } }),
    prisma.expense.create({ data: { title: "Office Stationery & Supplies", category: "OFFICE", amount: 2800, currency: "INR", status: "PAID", date: new Date("2026-03-30") } }),
    prisma.expense.create({ data: { title: "Sonal Copywriter — April Blog Posts", category: "FREELANCER_PAYMENT", amount: 14000, currency: "INR", status: "PENDING", date: new Date("2026-04-04"), projectId: proj5.id } }),
    prisma.expense.create({ data: { title: "Domain & Hosting — Client Projects", category: "SOFTWARE_TOOLS", amount: 6000, currency: "INR", status: "PAID", date: new Date("2026-04-01") } }),
    prisma.expense.create({ data: { title: "Team Lunch — April Kickoff", category: "OFFICE", amount: 3200, currency: "INR", status: "APPROVED", date: new Date("2026-04-03") } }),
  ]);
  console.log("✅ Expenses (10)");

  // ─── Contracts ────────────────────────────────────────────────────────────
  const c1 = await prisma.contract.create({
    data: {
      title: "TechNova NDA", type: "NDA", status: "FULLY_SIGNED",
      clientId: technova.id, projectId: proj1.id,
      startDate: new Date("2026-02-15"),
      notes: "Mutual NDA signed before project kickoff",
      parties: { create: [
        { partyType: "CLIENT", clientId: technova.id, name: "Ramesh Gupta", email: "ramesh@technova.com", signedAt: new Date("2026-02-16"), signatureNote: "Signed via email" },
        { partyType: "USER", userId: rohit.id, name: "Rohit Saha", email: "rohit@vibrnd.in", signedAt: new Date("2026-02-15"), signatureNote: "Signed in person" },
      ]},
    },
  });

  const c2 = await prisma.contract.create({
    data: {
      title: "TechNova Website — Service Agreement", type: "SERVICE_AGREEMENT", status: "FULLY_SIGNED",
      clientId: technova.id, projectId: proj1.id,
      startDate: new Date("2026-03-01"), endDate: new Date("2026-05-31"),
      value: 271400, currency: "INR",
      parties: { create: [
        { partyType: "CLIENT", clientId: technova.id, name: "Ramesh Gupta", email: "ramesh@technova.com", signedAt: new Date("2026-03-01") },
        { partyType: "USER", userId: rohit.id, name: "Rohit Saha", email: "rohit@vibrnd.in", signedAt: new Date("2026-03-01") },
      ]},
    },
  });

  const c3 = await prisma.contract.create({
    data: {
      title: "FreshBrew Social Media — Retainer Agreement", type: "SERVICE_AGREEMENT", status: "FULLY_SIGNED",
      clientId: freshbrew.id, projectId: proj3.id,
      startDate: new Date("2026-02-01"),
      value: 25000, currency: "INR",
      notes: "6-month minimum commitment. 30-day notice for termination.",
      parties: { create: [
        { partyType: "CLIENT", clientId: freshbrew.id, name: "Sunita Patel", email: "sunita@freshbrew.in", signedAt: new Date("2026-01-28") },
        { partyType: "USER", userId: arjun.id, name: "Arjun Mehta", email: "arjun@vibrnd.in", signedAt: new Date("2026-01-28") },
      ]},
    },
  });

  const c4 = await prisma.contract.create({
    data: {
      title: "Raj Freelancer — Freelance Agreement", type: "FREELANCE", status: "FULLY_SIGNED",
      startDate: new Date("2026-03-01"),
      value: 18000, currency: "INR",
      notes: "Freelance contract for FreshBrew illustration work",
      parties: { create: [
        { partyType: "USER", userId: rohit.id, name: "Rohit Saha", email: "rohit@vibrnd.in", signedAt: new Date("2026-03-01") },
      ]},
    },
  });

  const c5 = await prisma.contract.create({
    data: {
      title: "MindfulMed NDA", type: "NDA", status: "SENT",
      clientId: mindfulmed.id,
      startDate: new Date("2026-04-01"),
      parties: { create: [
        { partyType: "CLIENT", clientId: mindfulmed.id, name: "Deepa Krishnan", email: "deepa@mindfulmed.in" },
        { partyType: "USER", userId: rohit.id, name: "Rohit Saha", email: "rohit@vibrnd.in", signedAt: new Date("2026-04-01") },
      ]},
    },
  });

  const c6 = await prisma.contract.create({
    data: {
      title: "Horizon Campaign — Service Agreement", type: "SERVICE_AGREEMENT", status: "DRAFT",
      clientId: horizon.id, projectId: proj4.id,
      value: 180000, currency: "INR",
    },
  });

  console.log("✅ Contracts (6)");

  // ─── Files ────────────────────────────────────────────────────────────────
  await Promise.all([
    prisma.file.create({ data: { name: "TechNova_Brand_Guidelines_v2.pdf", mimeType: "application/pdf", mimeCategory: "pdf", size: 4200000, s3Key: "files/technova/brand-guidelines-v2.pdf", projectId: proj1.id, status: "APPROVED", uploadedById: priya.id, description: "Final brand guidelines from client" } }),
    prisma.file.create({ data: { name: "Homepage_Wireframe_Desktop.fig", mimeType: "application/figma", mimeCategory: "doc", size: 2100000, s3Key: "files/technova/homepage-wireframe-desktop.fig", projectId: proj1.id, status: "IN_REVIEW", uploadedById: neha.id } }),
    prisma.file.create({ data: { name: "FreshBrew_Logo_Concepts.pdf", mimeType: "application/pdf", mimeCategory: "pdf", size: 8500000, s3Key: "files/freshbrew/logo-concepts.pdf", projectId: proj2.id, status: "IN_REVIEW", uploadedById: priya.id, description: "3 logo concepts for client review" } }),
    prisma.file.create({ data: { name: "FreshBrew_Moodboard.jpg", mimeType: "image/jpeg", mimeCategory: "image", size: 3400000, s3Key: "files/freshbrew/moodboard.jpg", projectId: proj2.id, status: "APPROVED", uploadedById: priya.id } }),
    prisma.file.create({ data: { name: "Social_Media_Template_Pack.zip", mimeType: "application/zip", mimeCategory: "doc", size: 15000000, s3Key: "files/freshbrew/social-media-template-pack.zip", projectId: proj3.id, status: "APPROVED", uploadedById: arjun.id } }),
    prisma.file.create({ data: { name: "TechNova_Stock_Photos.zip", mimeType: "application/zip", mimeCategory: "doc", size: 25000000, s3Key: "files/technova/stock-photos.zip", projectId: proj1.id, status: "DRAFT", uploadedById: neha.id } }),
    prisma.file.create({ data: { name: "Horizon_Campaign_Brief.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", mimeCategory: "doc", size: 540000, s3Key: "files/horizon/campaign-brief.docx", projectId: proj4.id, clientId: horizon.id, status: "APPROVED", uploadedById: rohit.id } }),
    prisma.file.create({ data: { name: "SEO_Audit_Report_March.pdf", mimeType: "application/pdf", mimeCategory: "pdf", size: 1800000, s3Key: "files/technova/seo-audit-march.pdf", projectId: proj5.id, status: "APPROVED", uploadedById: arjun.id } }),
  ]);
  console.log("✅ Files (8)");

  // ─── Channels ─────────────────────────────────────────────────────────────
  const [chGeneral, chAnnouncements, chDesign, chDevOps] = await Promise.all([
    prisma.channel.create({ data: { name: "general", description: "General team communication", type: "GENERAL" } }),
    prisma.channel.create({ data: { name: "announcements", description: "Agency-wide announcements", type: "GENERAL" } }),
    prisma.channel.create({ data: { name: "design-team", description: "Design team discussions", type: "GENERAL" } }),
    prisma.channel.create({ data: { name: "random", description: "Off-topic conversations", type: "GENERAL" } }),
  ]);

  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const proj1Slug = slugify(proj1.name);
  const proj2Slug = slugify(proj2.name);
  const proj3Slug = slugify(proj3.name);

  const [chP1Team, chP1Client, chP2Team, chP3Team, chClientFresh] = await Promise.all([
    prisma.channel.create({ data: { name: `${proj1Slug}-team`, description: `Internal channel for ${proj1.name}`, type: "PROJECT_INTERNAL", projectId: proj1.id } }),
    prisma.channel.create({ data: { name: `${proj1Slug}-client`, description: `Client channel for ${proj1.name}`, type: "PROJECT_CLIENT", projectId: proj1.id } }),
    prisma.channel.create({ data: { name: `${proj2Slug}-team`, description: `Internal channel for ${proj2.name}`, type: "PROJECT_INTERNAL", projectId: proj2.id } }),
    prisma.channel.create({ data: { name: `${proj3Slug}-team`, description: `Internal channel for ${proj3.name}`, type: "PROJECT_INTERNAL", projectId: proj3.id } }),
    prisma.channel.create({ data: { name: "freshbrew-general", description: "General client channel for FreshBrew Co.", type: "CLIENT", clientId: freshbrew.id } }),
  ]);

  // Add members to channels
  const addMembers = async (channelId: string, userIds: string[]) => {
    for (const userId of userIds) {
      await prisma.channelMember.create({ data: { channelId, userId, role: "MEMBER" } }).catch(() => {});
    }
  };

  await addMembers(chGeneral.id, [rohit.id, priya.id, arjun.id, neha.id, kiran.id]);
  await addMembers(chAnnouncements.id, [rohit.id, priya.id, arjun.id, neha.id, kiran.id]);
  await addMembers(chDesign.id, [priya.id, neha.id, kiran.id]);
  await addMembers(chP1Team.id, [rohit.id, priya.id, neha.id]);
  await addMembers(chP1Client.id, [rohit.id, priya.id]);
  await addMembers(chP2Team.id, [priya.id, neha.id]);
  await addMembers(chP3Team.id, [arjun.id, kiran.id]);

  // ─── Chat Messages ────────────────────────────────────────────────────────
  const msg = async (channelId: string, authorId: string, authorName: string, body: string, minutesAgo: number) =>
    prisma.chatMessage.create({ data: { channelId, authorId, authorName, body, createdAt: new Date(Date.now() - minutesAgo * 60000) } });

  // #general messages
  await msg(chGeneral.id, rohit.id, "Rohit Saha", "Good morning team! 🌅 Quick sync at 10am today — TechNova deliverable review.", 480);
  await msg(chGeneral.id, priya.id, "Priya Sharma", "Good morning! I'll have the wireframes ready before 10. Just finishing up the mobile version.", 470);
  await msg(chGeneral.id, arjun.id, "Arjun Mehta", "Morning everyone! FreshBrew April calendar is 50% done, will share EOD.", 460);
  await msg(chGeneral.id, neha.id, "Neha Kapoor", "Hey team! Quick question — are we using Figma auto-layout for the TechNova components or manual?", 300);
  await msg(chGeneral.id, priya.id, "Priya Sharma", "@Neha yes, auto-layout throughout. Makes responsive much easier. I'll share the component library link.", 290);
  await msg(chGeneral.id, neha.id, "Neha Kapoor", "Perfect, thanks Priya! 🙏", 285);
  await msg(chGeneral.id, rohit.id, "Rohit Saha", "Reminder: Client billing goes out tomorrow. Please make sure your timesheets are updated by EOD.", 120);
  await msg(chGeneral.id, kiran.id, "Kiran Bose", "Done! Updated mine just now.", 115);

  // #announcements
  await msg(chAnnouncements.id, rohit.id, "Rohit Saha", "🎉 Big news — we just signed TechNova SEO retainer! Starting January 1st. Great work on the pitch Priya!", 20160);
  await msg(chAnnouncements.id, priya.id, "Priya Sharma", "🙌 So excited! Let's deliver amazing results.", 20150);
  await msg(chAnnouncements.id, rohit.id, "Rohit Saha", "Team, we're moving to Figma for all design work starting next sprint. Training session this Friday at 3pm.", 10080);
  await msg(chAnnouncements.id, rohit.id, "Rohit Saha", "📊 March recap: Delivered 3 projects on time, billed ₹3.2L, 2 new client proposals sent. Great month team! 🚀", 4320);

  // #design-team
  await msg(chDesign.id, priya.id, "Priya Sharma", "Hey designers! I've set up a shared Figma team library with our brand components. Link in the project doc.", 2880);
  await msg(chDesign.id, neha.id, "Neha Kapoor", "Finally! This is going to save so much time. Thank you Priya!", 2870);
  await msg(chDesign.id, kiran.id, "Kiran Bose", "Looks great! Can we add the FreshBrew color tokens too?", 2860);
  await msg(chDesign.id, priya.id, "Priya Sharma", "Yes! Adding client-specific token files per project. Will be done by tomorrow.", 2850);
  await msg(chDesign.id, neha.id, "Neha Kapoor", "TechNova wireframes shared for review — https://figma.com/... (dummy link). Please give feedback by tomorrow 5pm.", 480);
  await msg(chDesign.id, priya.id, "Priya Sharma", "Reviewed! Left comments on the navigation and hero section. Overall looks really clean Neha 👍", 460);

  // TechNova team channel
  await msg(chP1Team.id, rohit.id, "Rohit Saha", "Project kickoff complete ✅ Discovery phase done. Moving to UX next week.", 7200);
  await msg(chP1Team.id, priya.id, "Priya Sharma", "Wireframes for desktop done! Mobile is 70% done, should finish tomorrow.", 480);
  await msg(chP1Team.id, neha.id, "Neha Kapoor", "Should we go with a sticky header or parallax hero for the homepage? I have mockups for both.", 460);
  await msg(chP1Team.id, rohit.id, "Rohit Saha", "Let's go sticky header — more practical for the product nav. Send both to client for feedback though.", 450);
  await msg(chP1Team.id, priya.id, "Priya Sharma", "Agreed. I'll package them up with a quick explainer.", 440);
  await msg(chP1Team.id, neha.id, "Neha Kapoor", "Stock photos received from client! Uploading to project files now.", 120);

  // FreshBrew brand channel
  await msg(chP2Team.id, priya.id, "Priya Sharma", "Logo concepts ready — 3 directions. Uploading PDF for internal review before we send to Sunita.", 2880);
  await msg(chP2Team.id, neha.id, "Neha Kapoor", "Reviewed all 3. I love concept 2 — the leaf + coffee cup fusion is brilliant! Concept 1 feels too generic.", 2860);
  await msg(chP2Team.id, priya.id, "Priya Sharma", "Agreed on concept 2! Let me refine it a bit more before client presentation.", 2850);
  await msg(chP2Team.id, priya.id, "Priya Sharma", "Sent logo concepts to Sunita! 🤞 Waiting for feedback.", 1440);
  await msg(chP2Team.id, neha.id, "Neha Kapoor", "Fingers crossed for concept 2! 🤞", 1439);

  console.log("✅ Channels (9) + Messages (30+)");

  // ─── Comments on tasks ────────────────────────────────────────────────────
  const taskForComment = await prisma.task.findFirst({ where: { projectId: proj1.id, title: { contains: "Wireframes" } } });
  if (taskForComment) {
    await prisma.comment.createMany({ data: [
      { taskId: taskForComment.id, authorId: neha.id, authorName: "Neha Kapoor", body: "Desktop wireframes sent to client for review. Waiting on feedback.", type: "UPDATE" },
      { taskId: taskForComment.id, authorId: priya.id, authorName: "Priya Sharma", body: "Client wants to add a sticky mega-menu to the desktop nav. Incorporating feedback now.", type: "UPDATE" },
      { taskId: taskForComment.id, authorId: neha.id, authorName: "Neha Kapoor", body: "Should we add a mobile bottom navigation bar or stick with the hamburger?", type: "COMMENT" },
      { taskId: taskForComment.id, authorId: priya.id, authorName: "Priya Sharma", body: "Let's go with hamburger for now, client hasn't requested app-like nav. We can revisit post-launch.", type: "COMMENT" },
    ]});
  }

  const taskForComment2 = await prisma.task.findFirst({ where: { projectId: proj2.id, title: { contains: "Logo" } } });
  if (taskForComment2) {
    await prisma.comment.createMany({ data: [
      { taskId: taskForComment2.id, authorId: priya.id, authorName: "Priya Sharma", body: "Created 3 distinct concepts — minimal wordmark, leaf+cup icon, and a script style.", type: "UPDATE" },
      { taskId: taskForComment2.id, authorId: rohit.id, authorName: "Rohit Saha", body: "Reviewed all 3. Going with concept 2 as primary. Please refine and send to client.", type: "COMMENT" },
    ]});
  }
  console.log("✅ Task comments");

  console.log("\n🎉 Seed complete! Summary:");
  console.log("  👥 5 users");
  console.log("  🏢 5 clients");
  console.log("  📁 6 projects");
  console.log("  ✅ 35+ tasks");
  console.log("  💬 9 channels + 30+ messages");
  console.log("  📄 4 quotations");
  console.log("  💸 10 expenses");
  console.log("  📝 6 contracts");
  console.log("  📎 8 files");
  console.log("  💰 8 rate cards");
  console.log("  👤 4 stakeholders");
}

main()
  .catch((e) => { console.error("❌ Seed failed:", e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
