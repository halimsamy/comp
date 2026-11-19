-- CreateEnum
CREATE TYPE "VulnerabilityScanKind" AS ENUM ('internal', 'external_asv', 'pentest');

-- AlterEnum
ALTER TYPE "AttachmentEntityType" ADD VALUE 'vulnerability_scan';
ALTER TYPE "AttachmentEntityType" ADD VALUE 'vulnerability';

-- AlterEnum: "ignored" becomes "false_positive" (existing rows keep their meaning); add risk_accepted
ALTER TYPE "IntegrationFindingStatus" RENAME VALUE 'ignored' TO 'false_positive';
ALTER TYPE "IntegrationFindingStatus" ADD VALUE 'risk_accepted';

-- AlterEnum
ALTER TYPE "VulnerabilitySource" ADD VALUE 'internal_scan';

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "endOfSupportAt" TIMESTAMP(3),
ADD COLUMN     "lastReviewedAt" TIMESTAMP(3),
ADD COLUMN     "lastReviewedById" TEXT,
ADD COLUMN     "lastScannedAt" TIMESTAMP(3),
ADD COLUMN     "location" TEXT,
ADD COLUMN     "scopeJustification" TEXT,
ADD COLUMN     "vendorId" TEXT,
ADD COLUMN     "version" TEXT;

-- AlterTable
ALTER TABLE "IntegrationPlatformFinding" ADD COLUMN     "acceptedById" TEXT,
ADD COLUMN     "acceptedUntil" TIMESTAMP(3),
ADD COLUMN     "asvFail" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scanId" TEXT;

-- CreateTable
CREATE TABLE "VulnerabilityScan" (
    "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('vscan'::text),
    "organizationId" TEXT NOT NULL,
    "kind" "VulnerabilityScanKind" NOT NULL,
    "vendor" TEXT,
    "scannedAt" TIMESTAMP(3) NOT NULL,
    "passed" BOOLEAN,
    "attachmentId" TEXT,
    "findingCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VulnerabilityScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VulnerabilitySlaPolicy" (
    "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('vsla'::text),
    "organizationId" TEXT NOT NULL,
    "criticalDays" INTEGER NOT NULL DEFAULT 30,
    "highDays" INTEGER NOT NULL DEFAULT 30,
    "mediumDays" INTEGER NOT NULL DEFAULT 90,
    "lowDays" INTEGER NOT NULL DEFAULT 180,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VulnerabilitySlaPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VulnerabilityScan_organizationId_kind_scannedAt_idx" ON "VulnerabilityScan"("organizationId", "kind", "scannedAt");

-- CreateIndex
CREATE UNIQUE INDEX "VulnerabilitySlaPolicy_organizationId_key" ON "VulnerabilitySlaPolicy"("organizationId");

-- CreateIndex
CREATE INDEX "Asset_vendorId_idx" ON "Asset"("vendorId");

-- CreateIndex
CREATE INDEX "IntegrationPlatformFinding_scanId_idx" ON "IntegrationPlatformFinding"("scanId");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VulnerabilityScan" ADD CONSTRAINT "VulnerabilityScan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VulnerabilitySlaPolicy" ADD CONSTRAINT "VulnerabilitySlaPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationPlatformFinding" ADD CONSTRAINT "IntegrationPlatformFinding_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "VulnerabilityScan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

