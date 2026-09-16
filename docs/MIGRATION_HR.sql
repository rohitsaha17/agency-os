-- HR: attendance, staff records, leave, payroll.
--
-- Run against PRODUCTION, in the Supabase SQL editor. Paste the whole file.
-- Safe to run twice: every statement is guarded.
--
-- PURELY ADDITIVE. Six enums and five new tables. Not one existing table,
-- column or constraint is touched, so the currently-deployed app keeps
-- working either side of this and there is nothing to undo if the deploy is
-- delayed. Checked by reading the generated diff rather than assuming: no
-- DROP anywhere, and no ALTER of anything that already exists.
--
-- What the tables are for:
--
--   attendance       One row per person per day they were in. Absence is the
--                    absence of a row -- deliberately, because a table that
--                    also stored "not in today" needs a nightly job to write
--                    it for everyone, and would be wrong every time that job
--                    did not run.
--   leave_requests   A request and the decision on it. `kind` (paid/unpaid)
--                    stays null until somebody approves, because it is the
--                    approver's call and not the requester's.
--   staff_profiles   Date of birth, joining date, phone, salary. A separate
--                    table rather than more columns on `users`, because
--                    /api/users is fetched by half the components in the app
--                    and salary on `users` would be one careless select away
--                    from the whole team.
--   salary_payments  One row per person per month. The salary sheet is a
--                    query over these.
--   staff_advances   Advances and loans, with a running repaid total.
--                    Outstanding is derived, never stored, so the two cannot
--                    disagree.
--
-- Nothing is backfilled. Empty is the correct starting state for all five:
-- nobody has checked in yet, and inventing attendance would be worse than
-- having none.
--
-- Expect: 6 enums, 5 tables, 9 indexes, 12 foreign keys, then a final table
-- listing the five new tables with 0 rows each.

BEGIN;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AttendanceSource') THEN
    CREATE TYPE "AttendanceSource" AS ENUM ('SELF', 'ADMIN');
  END IF;
END
$$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LeaveStatus') THEN
    CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
  END IF;
END
$$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LeaveKind') THEN
    CREATE TYPE "LeaveKind" AS ENUM ('PAID', 'UNPAID');
  END IF;
END
$$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmploymentType') THEN
    CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN');
  END IF;
END
$$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SalaryStatus') THEN
    CREATE TYPE "SalaryStatus" AS ENUM ('UNPAID', 'PAID');
  END IF;
END
$$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AdvanceKind') THEN
    CREATE TYPE "AdvanceKind" AS ENUM ('ADVANCE', 'LOAN');
  END IF;
END
$$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "attendance" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "source" "AttendanceSource" NOT NULL DEFAULT 'SELF',
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "leave_requests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "kind" "LeaveKind",
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "staff_profiles" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "dateOfJoining" TIMESTAMP(3),
    "address" TEXT,
    "emergencyName" TEXT,
    "emergencyPhone" TEXT,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "monthlySalary" DECIMAL(12,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "salary_payments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "grossAmount" DECIMAL(12,2) NOT NULL,
    "advanceDeducted" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(12,2) NOT NULL,
    "status" "SalaryStatus" NOT NULL DEFAULT 'UNPAID',
    "paidOn" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "staff_advances" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "AdvanceKind" NOT NULL DEFAULT 'ADVANCE',
    "amount" DECIMAL(12,2) NOT NULL,
    "amountRepaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "givenOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_advances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "attendance_organizationId_date_idx" ON "attendance"("organizationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_userId_date_key" ON "attendance"("userId", "date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "leave_requests_organizationId_status_idx" ON "leave_requests"("organizationId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "leave_requests_userId_startDate_idx" ON "leave_requests"("userId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "staff_profiles_userId_key" ON "staff_profiles"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "staff_profiles_organizationId_idx" ON "staff_profiles"("organizationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "salary_payments_organizationId_month_idx" ON "salary_payments"("organizationId", "month");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "salary_payments_userId_month_key" ON "salary_payments"("userId", "month");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "staff_advances_organizationId_userId_idx" ON "staff_advances"("organizationId", "userId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_organizationId_fkey') THEN
    ALTER TABLE "attendance" ADD CONSTRAINT "attendance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_userId_fkey') THEN
    ALTER TABLE "attendance" ADD CONSTRAINT "attendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_recordedById_fkey') THEN
    ALTER TABLE "attendance" ADD CONSTRAINT "attendance_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leave_requests_organizationId_fkey') THEN
    ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leave_requests_userId_fkey') THEN
    ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leave_requests_decidedById_fkey') THEN
    ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_profiles_organizationId_fkey') THEN
    ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_profiles_userId_fkey') THEN
    ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'salary_payments_organizationId_fkey') THEN
    ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'salary_payments_userId_fkey') THEN
    ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_advances_organizationId_fkey') THEN
    ALTER TABLE "staff_advances" ADD CONSTRAINT "staff_advances_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_advances_userId_fkey') THEN
    ALTER TABLE "staff_advances" ADD CONSTRAINT "staff_advances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

COMMIT;

-- Check it landed. Expect five rows, every count 0.
SELECT 'attendance'      AS table_name, count(*) AS rows FROM "attendance"
UNION ALL SELECT 'leave_requests',  count(*) FROM "leave_requests"
UNION ALL SELECT 'salary_payments', count(*) FROM "salary_payments"
UNION ALL SELECT 'staff_advances',  count(*) FROM "staff_advances"
UNION ALL SELECT 'staff_profiles',  count(*) FROM "staff_profiles"
ORDER BY 1;
