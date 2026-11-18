-- Risk workspace: treatment-action dates on TaskItem and periodic risk reviews (ISO 27001 8.2).

-- AlterTable
ALTER TABLE "TaskItem" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "dueDate" TIMESTAMP(3);

-- Backfill: items already done count as completed when last updated.
UPDATE "TaskItem" SET "completedAt" = "updatedAt" WHERE "status" = 'done';

-- CreateTable
CREATE TABLE "RiskReview" (
    "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('rskrv'::text),
    "organizationId" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedByName" TEXT NOT NULL,
    "notes" TEXT,
    "snapshot" JSONB NOT NULL,
    "nextReviewDue" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RiskReview_organizationId_createdAt_idx" ON "RiskReview"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "RiskReview" ADD CONSTRAINT "RiskReview_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskReview" ADD CONSTRAINT "RiskReview_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
