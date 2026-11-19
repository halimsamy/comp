-- AlterTable
ALTER TABLE "AuditEngagement" ADD COLUMN     "pendingAuditorEmails" TEXT[] DEFAULT ARRAY[]::TEXT[];
