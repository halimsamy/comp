-- AlterTable
ALTER TABLE "PolicyVersion" ADD COLUMN     "approvalComment" TEXT,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT;

-- CreateTable
CREATE TABLE "PolicyReview" (
    "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('prv'::text),
    "organizationId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "policyVersionId" TEXT,
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "nextReviewDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyAcknowledgement" (
    "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('pak'::text),
    "organizationId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "policyVersionId" TEXT,
    "memberId" TEXT,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyAcknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PolicyReview_policyId_reviewedAt_idx" ON "PolicyReview"("policyId", "reviewedAt");

-- CreateIndex
CREATE INDEX "PolicyReview_organizationId_idx" ON "PolicyReview"("organizationId");

-- CreateIndex
CREATE INDEX "PolicyAcknowledgement_policyId_memberId_idx" ON "PolicyAcknowledgement"("policyId", "memberId");

-- CreateIndex
CREATE INDEX "PolicyAcknowledgement_memberId_idx" ON "PolicyAcknowledgement"("memberId");

-- CreateIndex
CREATE INDEX "PolicyAcknowledgement_organizationId_acknowledgedAt_idx" ON "PolicyAcknowledgement"("organizationId", "acknowledgedAt");

-- AddForeignKey
ALTER TABLE "PolicyVersion" ADD CONSTRAINT "PolicyVersion_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyReview" ADD CONSTRAINT "PolicyReview_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyReview" ADD CONSTRAINT "PolicyReview_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyReview" ADD CONSTRAINT "PolicyReview_policyVersionId_fkey" FOREIGN KEY ("policyVersionId") REFERENCES "PolicyVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyReview" ADD CONSTRAINT "PolicyReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyAcknowledgement" ADD CONSTRAINT "PolicyAcknowledgement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyAcknowledgement" ADD CONSTRAINT "PolicyAcknowledgement_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyAcknowledgement" ADD CONSTRAINT "PolicyAcknowledgement_policyVersionId_fkey" FOREIGN KEY ("policyVersionId") REFERENCES "PolicyVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyAcknowledgement" ADD CONSTRAINT "PolicyAcknowledgement_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: keep today's sign-offs as acknowledgement history for the current
-- version. The exact sign time was never stored, so the last publish time is
-- the best lower bound.
INSERT INTO "PolicyAcknowledgement" ("organizationId", "policyId", "policyVersionId", "memberId", "acknowledgedAt")
SELECT p."organizationId", p."id", p."currentVersionId", m."id", COALESCE(p."lastPublishedAt", p."updatedAt")
FROM "Policy" p
CROSS JOIN LATERAL unnest(p."signedBy") AS s("memberId")
JOIN "Member" m ON m."id" = s."memberId" AND m."organizationId" = p."organizationId";
