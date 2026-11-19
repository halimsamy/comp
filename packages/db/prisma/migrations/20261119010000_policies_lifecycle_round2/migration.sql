-- AlterTable
ALTER TABLE "PolicyAcknowledgement" ADD COLUMN     "attestation" TEXT;

-- AlterTable
ALTER TABLE "PolicyVersion" ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedById" TEXT,
ADD COLUMN     "rejectionComment" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "submittedById" TEXT;

-- CreateTable
CREATE TABLE "PolicyAckReminder" (
    "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('par'::text),
    "policyId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "policyVersionId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyAckReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PolicyAckReminder_policyId_memberId_sentAt_idx" ON "PolicyAckReminder"("policyId", "memberId", "sentAt");

-- AddForeignKey
ALTER TABLE "PolicyVersion" ADD CONSTRAINT "PolicyVersion_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyVersion" ADD CONSTRAINT "PolicyVersion_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyAckReminder" ADD CONSTRAINT "PolicyAckReminder_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyAckReminder" ADD CONSTRAINT "PolicyAckReminder_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data: "needs_review" now only means "waiting for approval". Policies the
-- review scheduler flagged (no pending version, published before) go back to
-- published; "review due" is derived from reviewDate instead.
UPDATE "Policy"
SET "status" = 'published'
WHERE "status" = 'needs_review'
  AND "pendingVersionId" IS NULL
  AND "lastPublishedAt" IS NOT NULL;

-- Data: versions already waiting for approval get a submission time so the
-- approver reminder (3 days) has a starting point.
UPDATE "PolicyVersion" v
SET "submittedAt" = v."updatedAt"
FROM "Policy" p
WHERE p."pendingVersionId" = v."id"
  AND v."submittedAt" IS NULL;
