-- AddColumn: letterheadConfig to company_settings
ALTER TABLE "public"."company_settings" ADD COLUMN IF NOT EXISTS "letterheadConfig" TEXT;
