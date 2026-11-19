-- people-access round 2: approved roles per system, allowed account types,
-- remediation proof, offboarding revocations keyed by access system,
-- checklist targeting, training record provenance and employee reminders.

-- AlterEnum
ALTER TYPE "AttachmentEntityType" ADD VALUE 'access_review_item';

-- AlterTable
ALTER TABLE "AccessReviewItem" ADD COLUMN "remediationUrl" TEXT;

-- AlterTable
ALTER TABLE "AccessSystem" ADD COLUMN "allowedAccountTypes" JSONB;

-- Offboarding revocations: key by access-inventory system, vendors become the fallback.
ALTER TABLE "OffboardingAccessRevocation" ADD COLUMN "systemKey" TEXT,
ADD COLUMN "systemName" TEXT,
ALTER COLUMN "vendorId" DROP NOT NULL;
UPDATE "OffboardingAccessRevocation" SET "systemKey" = 'vendor:' || "vendorId" WHERE "systemKey" IS NULL;
ALTER TABLE "OffboardingAccessRevocation" ALTER COLUMN "systemKey" SET NOT NULL;

-- AlterTable
ALTER TABLE "OffboardingChecklistTemplate" ADD COLUMN "appliesToDepartments" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "appliesToRoles" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "TrainingCompletionRecord" ADD COLUMN "attachmentId" TEXT,
ADD COLUMN "openedAt" TIMESTAMP(3),
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'portal';

-- CreateTable
CREATE TABLE "AccessSystemRole" (
    "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('asr'::text),
    "organizationId" TEXT NOT NULL,
    "systemKey" TEXT NOT NULL,
    "systemName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "permissionsScope" TEXT,
    "isPrivileged" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" TEXT,
    "approvedByName" TEXT,
    "approvedAt" TIMESTAMP(3),
    "lastReviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessSystemRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeReminderSetting" (
    "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('ers'::text),
    "organizationId" TEXT NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'weekly',
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeReminderSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccessSystemRole_organizationId_idx" ON "AccessSystemRole"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessSystemRole_organizationId_systemKey_name_key" ON "AccessSystemRole"("organizationId", "systemKey", "name");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeReminderSetting_organizationId_key" ON "EmployeeReminderSetting"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OffboardingAccessRevocation_memberId_systemKey_key" ON "OffboardingAccessRevocation"("memberId", "systemKey");

-- AddForeignKey
ALTER TABLE "AccessSystemRole" ADD CONSTRAINT "AccessSystemRole_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeReminderSetting" ADD CONSTRAINT "EmployeeReminderSetting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- #84: start/offboard dates picked in a UTC+ browser were stored at local
-- midnight (the previous UTC evening). Shift them to the intended UTC midnight.
-- Idempotent: shifted values are at midnight and no longer match.
UPDATE "Member"
SET "onboardDate" = date_trunc('day', "onboardDate") + interval '1 day'
WHERE "onboardDate" IS NOT NULL AND "onboardDate"::time >= time '20:00';

UPDATE "Member"
SET "offboardDate" = date_trunc('day', "offboardDate") + interval '1 day'
WHERE "offboardDate" IS NOT NULL AND "offboardDate"::time >= time '20:00';
