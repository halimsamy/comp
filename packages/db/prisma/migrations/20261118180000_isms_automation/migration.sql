-- CreateEnum
CREATE TYPE "IsmsNonconformitySource" AS ENUM ('incident', 'external_audit', 'management_review', 'monitoring', 'complaint', 'other');

-- AlterTable: owner + last review on interested-party requirements (4.2b)
ALTER TABLE "IsmsInterestedPartyRequirement" ADD COLUMN "ownerMemberId" TEXT,
ADD COLUMN "lastReviewedAt" DATE;

-- AlterTable: role acknowledgement (5.3, PCI 12.4.1)
ALTER TABLE "IsmsRoleAssignment" ADD COLUMN "acknowledgedAt" TIMESTAMP(3),
ADD COLUMN "acknowledgedByMemberId" TEXT;

-- AlterTable: corrective action fields on audit findings (10.2)
ALTER TABLE "IsmsAuditFinding" ADD COLUMN "rootCause" TEXT,
ADD COLUMN "correctiveAction" TEXT,
ADD COLUMN "effectivenessReviewedAt" DATE,
ADD COLUMN "effectivenessReviewedById" TEXT,
ADD COLUMN "effectivenessNotes" TEXT;

-- CreateTable: standalone nonconformities (10.2)
CREATE TABLE "IsmsNonconformity" (
    "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('isms_nc'::text),
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "source" "IsmsNonconformitySource" NOT NULL,
    "sourceRef" TEXT,
    "description" TEXT NOT NULL,
    "rootCause" TEXT,
    "correctiveAction" TEXT,
    "ownerMemberId" TEXT,
    "dueDate" DATE,
    "status" "IsmsAuditFindingStatus" NOT NULL DEFAULT 'open',
    "closureEvidence" TEXT,
    "effectivenessReviewedAt" DATE,
    "effectivenessReviewedById" TEXT,
    "effectivenessNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IsmsNonconformity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IsmsNonconformity_organizationId_reference_key" ON "IsmsNonconformity"("organizationId", "reference");

-- CreateIndex
CREATE INDEX "IsmsNonconformity_organizationId_idx" ON "IsmsNonconformity"("organizationId");

-- AddForeignKey
ALTER TABLE "IsmsNonconformity" ADD CONSTRAINT "IsmsNonconformity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
