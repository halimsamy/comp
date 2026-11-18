-- CreateEnum
CREATE TYPE "VendorCriticality" AS ENUM ('critical', 'high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "VendorAssuranceType" AS ENUM ('soc2_type1', 'soc2_type2', 'iso27001', 'pci_aoc', 'pci_roc', 'other', 'none');

-- CreateEnum
CREATE TYPE "VendorPciStatus" AS ENUM ('compliant', 'non_compliant', 'in_progress', 'not_applicable', 'unknown');

-- CreateEnum
CREATE TYPE "VendorDocumentType" AS ENUM ('soc2_type1', 'soc2_type2', 'iso27001_certificate', 'pci_aoc', 'dpa', 'contract', 'nda', 'pentest_report', 'insurance', 'questionnaire', 'other');

-- CreateEnum
CREATE TYPE "VendorDocumentSummaryStatus" AS ENUM ('pending', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "VendorReviewOutcome" AS ENUM ('approved', 'approved_with_conditions', 'rejected');

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "affectsCdeSecurity" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "assuranceExpiresAt" TIMESTAMP(3),
ADD COLUMN     "assurancePeriodEnd" TIMESTAMP(3),
ADD COLUMN     "assurancePeriodStart" TIMESTAMP(3),
ADD COLUMN     "assuranceType" "VendorAssuranceType",
ADD COLUMN     "confidentialityClausesConfirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "contractEndDate" TIMESTAMP(3),
ADD COLUMN     "contractStartDate" TIMESTAMP(3),
ADD COLUMN     "criticality" "VendorCriticality",
ADD COLUMN     "dataTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "handlesCardholderData" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastReviewedAt" TIMESTAMP(3),
ADD COLUMN     "nextReviewDue" TIMESTAMP(3),
ADD COLUMN     "pciStatus" "VendorPciStatus",
ADD COLUMN     "pciStatusCheckedAt" TIMESTAMP(3),
ADD COLUMN     "responsibilityMatrix" JSONB,
ADD COLUMN     "securityClausesConfirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tpspAcknowledgementDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "VendorDocument" (
    "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('vdoc'::text),
    "organizationId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "type" "VendorDocumentType" NOT NULL,
    "name" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "uploadedById" TEXT,
    "aiSummary" JSONB,
    "aiSummaryStatus" "VendorDocumentSummaryStatus",
    "aiSummaryRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorReview" (
    "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('vrv'::text),
    "organizationId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "outcome" "VendorReviewOutcome" NOT NULL,
    "notes" TEXT,
    "checklist" JSONB NOT NULL,
    "criticality" "VendorCriticality",
    "reviewedByUserId" TEXT,
    "reviewedByName" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextReviewDue" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VendorDocument_attachmentId_key" ON "VendorDocument"("attachmentId");

-- CreateIndex
CREATE INDEX "VendorDocument_vendorId_idx" ON "VendorDocument"("vendorId");

-- CreateIndex
CREATE INDEX "VendorDocument_organizationId_expiresAt_idx" ON "VendorDocument"("organizationId", "expiresAt");

-- CreateIndex
CREATE INDEX "VendorReview_vendorId_reviewedAt_idx" ON "VendorReview"("vendorId", "reviewedAt");

-- CreateIndex
CREATE INDEX "VendorReview_organizationId_idx" ON "VendorReview"("organizationId");

-- CreateIndex
CREATE INDEX "Vendor_organizationId_nextReviewDue_idx" ON "Vendor"("organizationId", "nextReviewDue");

-- AddForeignKey
ALTER TABLE "VendorDocument" ADD CONSTRAINT "VendorDocument_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorDocument" ADD CONSTRAINT "VendorDocument_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorReview" ADD CONSTRAINT "VendorReview_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
