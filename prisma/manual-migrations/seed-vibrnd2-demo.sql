-- ============================================================
-- Seed a full demo workspace for the vibrnd2@gmail.com login.
-- Paste this whole file into the Supabase SQL Editor and Run.
--
-- Login after running:  vibrnd2@gmail.com  /  Vibrnd@2026
--
-- Safe to re-run: it first removes any existing org that vibrnd2
-- belongs to (and any previous copy of this demo), then recreates
-- everything fresh. It also ensures the required schema columns
-- exist, so it works even before the schema migration is applied.
-- ============================================================

BEGIN;

-- ── 0. Ensure schema is up to date (idempotent) ─────────────
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordHash"  TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordSetAt" TIMESTAMP(3);

DO $$ BEGIN
  CREATE TYPE "TrialRequestStatus" AS ENUM ('NEW', 'CONTACTED', 'CONVERTED', 'DECLINED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "trial_requests" (
  "id" TEXT NOT NULL, "agencyName" TEXT NOT NULL, "contactName" TEXT NOT NULL,
  "email" TEXT NOT NULL, "phone" TEXT, "location" TEXT, "website" TEXT,
  "teamSize" TEXT, "services" TEXT, "message" TEXT,
  "status" "TrialRequestStatus" NOT NULL DEFAULT 'NEW',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "trial_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "trial_requests_status_idx" ON "trial_requests" ("status");

-- Per-organization document numbering (drop old global unique)
ALTER TABLE "quotations" DROP CONSTRAINT IF EXISTS "quotations_number_key";
DROP INDEX IF EXISTS "quotations_number_key";
CREATE UNIQUE INDEX IF NOT EXISTS "quotations_organizationId_number_key"
  ON "quotations" ("organizationId", "number");
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_invoiceNumber_key";
DROP INDEX IF EXISTS "invoices_invoiceNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_organizationId_invoiceNumber_key"
  ON "invoices" ("organizationId", "invoiceNumber");

-- ── 1. Clean slate (cascades remove all child rows) ─────────
DELETE FROM organizations WHERE id IN (SELECT "organizationId" FROM users WHERE email = 'vibrnd2@gmail.com');
DELETE FROM organizations WHERE slug = 'vibrnd-demo';

-- ── 2. Organization ─────────────────────────────────────────
INSERT INTO organizations (
  "id","name","slug","email","phone","website","currency","timezone","dateFormat",
  "onboardingCompleted","onboardedAt",
  "letterheadEmail","letterheadPhone","letterheadWebsite","letterheadAddress","letterheadColor",
  "updatedAt"
) VALUES (
  'demo_org','Vibrnd Studio','vibrnd-demo','hello@vibrnd.studio','+91 98200 11223','https://vibrnd.studio',
  'INR','Asia/Kolkata','DD MMM YYYY', true, now(),
  'accounts@vibrnd.studio','+91 98200 11223','vibrnd.studio','3rd Floor, Design House, Andheri West, Mumbai 400053','#6366f1',
  now()
);

-- ── 3. Users (owner has password Vibrnd@2026) ───────────────
INSERT INTO users ("id","organizationId","name","email","role","isActive","passwordHash","passwordSetAt","updatedAt") VALUES
('demo_owner','demo_org','Rohit Saha','vibrnd2@gmail.com','OWNER', true,
 'scrypt$9d6e80867c765af5594ce3ecbde2773b$4d0913c001b505552582739185389cb524a5136ef9446d354bfeb244a19472415f5e2fad64b2e8ee16cff7009efdd92e88ddc88927f9cee6cf075f890292786e',
 now(), now()),
('demo_u_priya','demo_org','Priya Nair','priya@vibrnd.studio','MANAGER', true, NULL, NULL, now()),
('demo_u_arjun','demo_org','Arjun Rao','arjun@vibrnd.studio','MEMBER', true, NULL, NULL, now());

-- ── 4. Clients + contacts ───────────────────────────────────
INSERT INTO clients ("id","organizationId","name","companyName","email","phone","website","industry","address","status","updatedAt") VALUES
('demo_c_acme','demo_org','Acme Beverages','Acme Beverages','brand@acmebev.com','+91 90000 10001','https://acmebev.com','FMCG','Bandra Kurla Complex, Mumbai','ACTIVE', now()),
('demo_c_nova','demo_org','Nova Fintech','Nova Fintech Pvt Ltd','growth@novafin.io','+91 90000 20001','https://novafin.io','Fintech','Koramangala, Bengaluru','ACTIVE', now());

INSERT INTO client_contacts ("id","clientId","name","email","phone","jobTitle","isPrimary","updatedAt") VALUES
('demo_ct_meera','demo_c_acme','Meera Shah','meera@acmebev.com','+91 90000 10002','Marketing Head', true, now()),
('demo_ct_kabir','demo_c_acme','Kabir Jain','kabir@acmebev.com',NULL,'Brand Manager', false, now()),
('demo_ct_dev','demo_c_nova','Dev Menon','dev@novafin.io','+91 90000 20002','Founder', true, now());

-- ── 5. Rate cards ───────────────────────────────────────────
INSERT INTO rate_cards ("id","organizationId","name","category","unit","unitPrice","currency","description","updatedAt") VALUES
('demo_rc_1','demo_org','Brand Identity','Design','project',250000,'INR','Logo, guidelines, collateral', now()),
('demo_rc_2','demo_org','Social Media','Marketing','month',60000,'INR',NULL, now()),
('demo_rc_3','demo_org','Video Production','Production','video',85000,'INR',NULL, now()),
('demo_rc_4','demo_org','Website Design','Design','project',180000,'INR',NULL, now());

-- ── 6. Projects ─────────────────────────────────────────────
INSERT INTO projects ("id","organizationId","clientId","createdById","name","description","type","status","budget","currency","startDate","endDate","updatedAt") VALUES
('demo_p_brand','demo_org','demo_c_acme','demo_owner','Acme Rebrand 2026','Full brand refresh for Acme''s flagship line','ONE_TIME','ACTIVE',450000,'INR','2026-06-01','2026-09-15', now()),
('demo_p_retainer','demo_org','demo_c_nova','demo_owner','Nova Social Retainer','Monthly social content + campaigns','RETAINER','ACTIVE',60000,'INR','2026-05-01',NULL, now());

-- ── 7. Tasks (+ one subtask, + an assignee) ─────────────────
INSERT INTO tasks ("id","organizationId","projectId","parentId","managerId","title","status","priority","order","progress","dueDate","updatedAt") VALUES
('demo_t_logo','demo_org','demo_p_brand',NULL,'demo_u_priya','Logo exploration','IN_PROGRESS','HIGH',0,0,'2026-07-20', now()),
('demo_t_dir','demo_org','demo_p_brand','demo_t_logo',NULL,'3 logo directions','DONE','MEDIUM',0,100,NULL, now()),
('demo_t_review','demo_org','demo_p_brand','demo_t_logo',NULL,'Client review round 1','TODO','MEDIUM',1,0,NULL, now()),
('demo_t_guide','demo_org','demo_p_brand',NULL,NULL,'Brand guidelines doc','TODO','LOW',1,0,'2026-08-10', now()),
('demo_t_cal','demo_org','demo_p_retainer',NULL,NULL,'July content calendar','IN_PROGRESS','HIGH',0,0,'2026-07-19', now());

INSERT INTO task_assignees ("taskId","userId") VALUES ('demo_t_logo','demo_u_arjun');

-- ── 8. Quotation (approved) + line items ────────────────────
INSERT INTO quotations ("id","organizationId","clientId","number","title","status","pricingType","currency","discountType","discountValue","taxRate","subtotal","total","validUntil","notes","terms","updatedAt") VALUES
('demo_q_1','demo_org','demo_c_acme','QUO-2026-001','Acme Rebrand Proposal','APPROVED','FIXED','INR','PERCENT',5,18,450000,504900,'2026-08-31','50% advance to kick off.','Payment within 15 days of invoice.', now());

INSERT INTO quotation_line_items ("id","quotationId","title","description","pricingType","quantity","unitPrice","unit","subtotal","order") VALUES
('demo_qli_1','demo_q_1','Brand Identity','Logo + guidelines','FIXED',1,250000,NULL,250000,0),
('demo_qli_2','demo_q_1','Packaging Design',NULL,'PER_ITEM',4,50000,'SKUs',200000,1);

-- ── 9. Invoices + line items ────────────────────────────────
INSERT INTO invoices ("id","organizationId","projectId","quotationId","clientId","invoiceNumber","status","currency","discountPct","taxPct","dueDate","paidAt","notes","updatedAt") VALUES
('demo_i_1','demo_org','demo_p_brand','demo_q_1','demo_c_acme','INV-2026-001','PAID','INR',5,18,'2026-06-15','2026-06-12','Advance invoice — 50%.', now()),
('demo_i_2','demo_org','demo_p_retainer',NULL,'demo_c_nova','INV-2026-002','SENT','INR',NULL,18,'2026-07-31',NULL,'July retainer.', now());

INSERT INTO invoice_line_items ("id","invoiceId","description","quantity","unitPrice","order") VALUES
('demo_ili_1','demo_i_1','Advance — Acme Rebrand (50%)',1,250000,0),
('demo_ili_2','demo_i_2','Social retainer — July 2026',1,60000,0);

-- ── 10. Receipt against the paid invoice ────────────────────
INSERT INTO receipts ("id","organizationId","clientId","invoiceId","amount","currency","receivedAt","method","reference","receiptNumber","updatedAt") VALUES
('demo_r_1','demo_org','demo_c_acme','demo_i_1',295000,'INR','2026-06-12','BANK_TRANSFER','NEFT-AXIS-99120','RCPT-2026-001', now());

-- ── 11. Stakeholder + expenses ──────────────────────────────
INSERT INTO stakeholders ("id","organizationId","name","type","email","phone","updatedAt") VALUES
('demo_s_lumen','demo_org','Lumen Print Co','VENDOR','sales@lumenprint.in','+91 90000 55555', now());

INSERT INTO expenses ("id","organizationId","title","category","amount","currency","date","status","projectId","stakeholderId","updatedAt") VALUES
('demo_e_1','demo_org','Stock photography','STOCK_ASSETS',8500,'INR','2026-06-20','APPROVED','demo_p_brand',NULL, now()),
('demo_e_2','demo_org','Print proofs','PRINTING',12000,'INR','2026-06-28','PAID','demo_p_brand','demo_s_lumen', now()),
('demo_e_3','demo_org','Design software (annual)','SOFTWARE_TOOLS',45000,'INR','2026-07-01','PENDING',NULL,NULL, now());

-- ── 12. Contract + parties ──────────────────────────────────
INSERT INTO contracts ("id","organizationId","clientId","projectId","title","type","status","value","currency","startDate","notes","updatedAt") VALUES
('demo_k_1','demo_org','demo_c_acme','demo_p_brand','Master Services Agreement — Acme','SERVICE_AGREEMENT','DRAFT',450000,'INR','2026-06-01','Covers the full rebrand engagement.', now());

INSERT INTO contract_parties ("id","contractId","partyType","clientId","userId","name","email") VALUES
('demo_kp_1','demo_k_1','CLIENT','demo_c_acme',NULL,'Meera Shah','meera@acmebev.com'),
('demo_kp_2','demo_k_1','USER',NULL,'demo_owner','Rohit Saha','vibrnd2@gmail.com');

-- ── 13. Folder + files ──────────────────────────────────────
INSERT INTO folders ("id","organizationId","name","scope","clientId","updatedAt") VALUES
('demo_f_1','demo_org','Acme Brand Assets','CLIENT','demo_c_acme', now());

INSERT INTO files ("id","organizationId","uploadedById","name","mimeType","mimeCategory","size","s3Key","s3Bucket","url","status","projectId","folderId","updatedAt") VALUES
('demo_fi_1','demo_org','demo_owner','acme-logo-v1.png','image/png','image',248000,'demo/acme-logo-v1.png','local','/uploads/demo-acme-logo.png','IN_REVIEW','demo_p_brand','demo_f_1', now()),
('demo_fi_2','demo_org','demo_owner','moodboard.pdf','application/pdf','pdf',1120000,'demo/moodboard.pdf','local','/uploads/demo-moodboard.pdf','DRAFT','demo_p_brand','demo_f_1', now());

COMMIT;
