-- Fix task_templates.projectType to use the updated ProjectType enum
-- (projects.type was already updated by the previous partial migration run)
ALTER TABLE "task_templates" ALTER COLUMN "projectType" TYPE "ProjectType" USING ("projectType"::text::"ProjectType");
DROP TYPE IF EXISTS "ProjectType_old";
