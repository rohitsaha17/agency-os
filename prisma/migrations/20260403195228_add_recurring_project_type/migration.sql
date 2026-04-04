-- AlterEnum
ALTER TYPE "ProjectType" ADD VALUE 'RECURRING';

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "recurringFrequency" TEXT;
