-- Migration: Rename Vendors → Stakeholders
-- Steps 1-6 applied in a previous (partial) run.
-- This migration completes the remaining steps.

-- 1. Rename VendorType enum to StakeholderType (skip if already done)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VendorType') THEN
    ALTER TYPE "VendorType" RENAME TO "StakeholderType";
  END IF;
END $$;

-- 2. Add INTERNAL_TEAM value to StakeholderType (skip if already exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'StakeholderType' AND e.enumlabel = 'INTERNAL_TEAM'
  ) THEN
    ALTER TYPE "StakeholderType" ADD VALUE 'INTERNAL_TEAM';
  END IF;
END $$;

-- 3. Create StakeholderRole enum (skip if already exists)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StakeholderRole') THEN
    CREATE TYPE "StakeholderRole" AS ENUM ('OWNER', 'ADMIN', 'EXECUTIVE', 'MANAGER', 'MEMBER');
  END IF;
END $$;

-- 4. Rename vendors table to stakeholders (skip if already renamed)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='vendors') THEN
    ALTER TABLE "vendors" RENAME TO "stakeholders";
  END IF;
END $$;

-- 5. Add role column to stakeholders (skip if already exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='stakeholders' AND column_name='role'
  ) THEN
    ALTER TABLE "stakeholders" ADD COLUMN "role" "StakeholderRole";
  END IF;
END $$;

-- 6. Rename vendorId → stakeholderId in expenses (skip if already renamed)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='expenses' AND column_name='vendorId'
  ) THEN
    ALTER TABLE "expenses" RENAME COLUMN "vendorId" TO "stakeholderId";
  END IF;
END $$;

-- 7. Rename vendorId → stakeholderId in contract_parties (skip if already renamed)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='contract_parties' AND column_name='vendorId'
  ) THEN
    ALTER TABLE "contract_parties" RENAME COLUMN "vendorId" TO "stakeholderId";
  END IF;
END $$;

-- 8. Rename VENDOR → STAKEHOLDER in ContractPartyType enum (skip if already renamed)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'ContractPartyType' AND e.enumlabel = 'VENDOR'
  ) THEN
    ALTER TYPE "ContractPartyType" RENAME VALUE 'VENDOR' TO 'STAKEHOLDER';
  END IF;
END $$;
