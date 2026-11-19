-- CreateEnum
CREATE TYPE "AuditRequestSource" AS ENUM ('auditor', 'team');

-- CreateEnum
CREATE TYPE "IsmsMeetingType" AS ENUM ('management_review', 'board', 'it_leadership', 'risk_committee', 'pci_bau');

-- AlterTable
ALTER TABLE "AuditEvidenceRequest" ADD COLUMN     "ownerMemberId" TEXT,
ADD COLUMN     "source" "AuditRequestSource" NOT NULL DEFAULT 'auditor';

-- AlterTable
ALTER TABLE "Finding" ADD COLUMN     "auditId" TEXT,
ADD COLUMN     "requirementId" TEXT;

-- AlterTable
ALTER TABLE "IsmsManagementReview" ADD COLUMN     "meetingType" "IsmsMeetingType" NOT NULL DEFAULT 'management_review';

-- AlterTable
ALTER TABLE "IsmsMeasurement" ADD COLUMN     "provisional" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Finding_auditId_idx" ON "Finding"("auditId");

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "AuditEngagement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Data: metrics Comp AI computes itself are not manual entry (#49). Idempotent.
UPDATE "IsmsMetric" SET "dataSource" = 'computed'
WHERE "dataSource" = 'manual'
  AND "metricKey" IN (
    'training_completion', 'policy_acknowledgement', 'finding_ageing',
    'risk_treatment_status', 'vendor_review_currency', 'task_on_time',
    'vulnerability_remediation'
  );

-- Data: the vulnerability metric is now computed from the Vulnerabilities
-- register against the org's SLA policy. Only rows still holding the seeded
-- text are touched, so customer edits survive. Idempotent.
UPDATE "IsmsMetric" SET
  "name" = 'Critical and High vulnerabilities remediated within SLA',
  "method" = 'Computed by Comp AI from the Vulnerabilities register: share of Critical and High vulnerabilities closed by their remediation SLA due date (open ones past due count as missed).',
  "target" = '100% within SLA (PCI DSS 6.3.3: critical within one month)'
WHERE "metricKey" = 'vulnerability_remediation'
  AND "method" = 'SAST / SCA findings and tracker SLA timers: days from detection to closure per Critical/High vulnerability.';
