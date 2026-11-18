-- CreateEnum
CREATE TYPE "AuditEngagementStatus" AS ENUM ('planned', 'in_progress', 'awaiting_report', 'completed');

-- CreateEnum
CREATE TYPE "AuditItemStatus" AS ENUM ('accepted', 'flagged', 'requested');

-- CreateEnum
CREATE TYPE "AuditRequestStatus" AS ENUM ('open', 'submitted', 'accepted');

-- AlterEnum
ALTER TYPE "AttachmentEntityType" ADD VALUE 'audit_request';

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "uploadedById" TEXT,
ADD COLUMN     "validFrom" TIMESTAMP(3),
ADD COLUMN     "validUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AuditEngagement" (
    "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('aud'::text),
    "organizationId" TEXT NOT NULL,
    "frameworkInstanceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "firmName" TEXT,
    "status" "AuditEngagementStatus" NOT NULL DEFAULT 'planned',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "accessEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditEngagement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEngagementAuditor" (
    "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('aua'::text),
    "auditId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEngagementAuditor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditRequirementReview" (
    "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('arr'::text),
    "auditId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "status" "AuditItemStatus" NOT NULL,
    "note" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditRequirementReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditComment" (
    "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('acm'::text),
    "auditId" TEXT NOT NULL,
    "requirementId" TEXT,
    "authorId" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvidenceRequest" (
    "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('aer'::text),
    "auditId" TEXT NOT NULL,
    "requirementId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "AuditRequestStatus" NOT NULL DEFAULT 'open',
    "dueDate" TIMESTAMP(3),
    "requestedById" TEXT,
    "response" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditEvidenceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditEngagement_organizationId_idx" ON "AuditEngagement"("organizationId");

-- CreateIndex
CREATE INDEX "AuditEngagement_frameworkInstanceId_idx" ON "AuditEngagement"("frameworkInstanceId");

-- CreateIndex
CREATE INDEX "AuditEngagementAuditor_memberId_idx" ON "AuditEngagementAuditor"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEngagementAuditor_auditId_memberId_key" ON "AuditEngagementAuditor"("auditId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditRequirementReview_auditId_requirementId_key" ON "AuditRequirementReview"("auditId", "requirementId");

-- CreateIndex
CREATE INDEX "AuditComment_auditId_requirementId_idx" ON "AuditComment"("auditId", "requirementId");

-- CreateIndex
CREATE INDEX "AuditEvidenceRequest_auditId_idx" ON "AuditEvidenceRequest"("auditId");

-- AddForeignKey
ALTER TABLE "AuditEngagement" ADD CONSTRAINT "AuditEngagement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEngagement" ADD CONSTRAINT "AuditEngagement_frameworkInstanceId_fkey" FOREIGN KEY ("frameworkInstanceId") REFERENCES "FrameworkInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEngagementAuditor" ADD CONSTRAINT "AuditEngagementAuditor_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "AuditEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEngagementAuditor" ADD CONSTRAINT "AuditEngagementAuditor_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditRequirementReview" ADD CONSTRAINT "AuditRequirementReview_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "AuditEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditRequirementReview" ADD CONSTRAINT "AuditRequirementReview_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditComment" ADD CONSTRAINT "AuditComment_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "AuditEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditComment" ADD CONSTRAINT "AuditComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvidenceRequest" ADD CONSTRAINT "AuditEvidenceRequest_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "AuditEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvidenceRequest" ADD CONSTRAINT "AuditEvidenceRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
