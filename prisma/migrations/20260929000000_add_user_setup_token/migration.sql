-- QA-001: single-use, hashed, expiring first-password setup token on users.
ALTER TABLE "users" ADD COLUMN "setupTokenHash" TEXT;
ALTER TABLE "users" ADD COLUMN "setupTokenExpiresAt" TIMESTAMP(3);
