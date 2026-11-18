-- CreateEnum
CREATE TYPE "ChecklistKind" AS ENUM ('onboarding', 'offboarding');

-- AlterTable
ALTER TABLE "OffboardingChecklistTemplate" ADD COLUMN     "kind" "ChecklistKind" NOT NULL DEFAULT 'offboarding',
ADD COLUMN     "dueDays" INTEGER,
ADD COLUMN     "autoCompleteSource" TEXT;

-- CreateIndex
CREATE INDEX "OffboardingChecklistTemplate_organizationId_kind_idx" ON "OffboardingChecklistTemplate"("organizationId", "kind");

-- AlterTable
ALTER TABLE "background_check_requests" ADD COLUMN     "completedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "OrganizationChartSnapshot" (
    "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('ocs'::text),
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nodes" JSONB NOT NULL DEFAULT '[]',
    "edges" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationChartSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingModule" (
    "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('trm'::text),
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "contentUrl" TEXT,
    "frameworkReference" TEXT,
    "targetRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetDepartments" "Departments"[] DEFAULT ARRAY[]::"Departments"[],
    "recurrenceMonths" INTEGER NOT NULL DEFAULT 12,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingCompletionRecord" (
    "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('tcr'::text),
    "organizationId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingCompletionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrganizationChartSnapshot_organizationId_createdAt_idx" ON "OrganizationChartSnapshot"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "TrainingModule_organizationId_idx" ON "TrainingModule"("organizationId");

-- CreateIndex
CREATE INDEX "TrainingCompletionRecord_organizationId_idx" ON "TrainingCompletionRecord"("organizationId");

-- CreateIndex
CREATE INDEX "TrainingCompletionRecord_memberId_moduleId_idx" ON "TrainingCompletionRecord"("memberId", "moduleId");

-- AddForeignKey
ALTER TABLE "OrganizationChartSnapshot" ADD CONSTRAINT "OrganizationChartSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingModule" ADD CONSTRAINT "TrainingModule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCompletionRecord" ADD CONSTRAINT "TrainingCompletionRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCompletionRecord" ADD CONSTRAINT "TrainingCompletionRecord_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Background check completedAt: one trigger covers every status write path
-- (webhooks, reconciliation job, manual attach, reruns).
CREATE OR REPLACE FUNCTION set_background_check_completed_at() RETURNS trigger AS $$
BEGIN
  IF NEW."status" IN ('completed', 'completed_with_flags') THEN
    IF NEW."completedAt" IS NULL THEN
      NEW."completedAt" := CURRENT_TIMESTAMP;
    END IF;
  ELSE
    NEW."completedAt" := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER background_check_requests_completed_at
BEFORE INSERT OR UPDATE OF "status" ON "background_check_requests"
FOR EACH ROW EXECUTE FUNCTION set_background_check_completed_at();

-- Backfill: best known completion time for checks already done.
UPDATE "background_check_requests"
SET "completedAt" = COALESCE("reportSyncedAt", "updatedAt")
WHERE "status" IN ('completed', 'completed_with_flags');

-- Backfill the training history with every completion we already know about.
INSERT INTO "TrainingCompletionRecord" ("organizationId", "memberId", "moduleId", "completedAt", "expiresAt")
SELECT m."organizationId", c."memberId", c."videoId", c."completedAt", c."completedAt" + INTERVAL '12 months'
FROM "EmployeeTrainingVideoCompletion" c
JOIN "Member" m ON m."id" = c."memberId"
WHERE c."completedAt" IS NOT NULL;

-- Offboarding: office keys and badges get their own item (PCI DSS 9.2.3 / ISO 27001 A.5.11).
INSERT INTO "OffboardingChecklistTemplate" ("organizationId", "title", "description", "evidenceRequired", "sortOrder", "isDefault", "isEnabled", "kind", "updatedAt")
SELECT DISTINCT t."organizationId",
  'Collect office keys and access badges',
  'Collect physical keys, access cards and badges, and deactivate badge access in the building or office access system.',
  false, 9, true, true, 'offboarding'::"ChecklistKind", CURRENT_TIMESTAMP
FROM "OffboardingChecklistTemplate" t
WHERE t."kind" = 'offboarding'
  AND NOT EXISTS (
    SELECT 1 FROM "OffboardingChecklistTemplate" x
    WHERE x."organizationId" = t."organizationId" AND x."title" = 'Collect office keys and access badges'
  );
