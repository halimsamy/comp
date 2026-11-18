-- CreateEnum
CREATE TYPE "AccessReviewStatus" AS ENUM ('in_progress', 'completed');

-- CreateEnum
CREATE TYPE "AccessReviewDecision" AS ENUM ('keep', 'revoke', 'modify');

-- CreateTable
CREATE TABLE "AccessSystem" (
    "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('asy'::text),
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "importedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessSystem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessSystemAccount" (
    "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('asa'::text),
    "systemId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "type" TEXT,
    "status" TEXT,
    "roles" TEXT[],
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "mfaEnabled" BOOLEAN,
    "lastLoginAt" TIMESTAMP(3),
    "accountCreatedAt" TIMESTAMP(3),

    CONSTRAINT "AccessSystemAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessAccountOwner" (
    "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('aao'::text),
    "organizationId" TEXT NOT NULL,
    "systemKey" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "memberId" TEXT,
    "isServiceAccount" BOOLEAN NOT NULL DEFAULT false,
    "justification" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessAccountOwner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessReview" (
    "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('arv'::text),
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "AccessReviewStatus" NOT NULL DEFAULT 'in_progress',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "createdByName" TEXT,
    "signedOffById" TEXT,
    "signedOffByName" TEXT,
    "signedOffAt" TIMESTAMP(3),
    "signOffNote" TEXT,
    "reportAttachmentId" TEXT,
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessReviewSystem" (
    "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('ars'::text),
    "reviewId" TEXT NOT NULL,
    "systemKey" TEXT NOT NULL,
    "systemName" TEXT NOT NULL,
    "reviewerId" TEXT,
    "reviewerName" TEXT,

    CONSTRAINT "AccessReviewSystem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessReviewItem" (
    "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('ari'::text),
    "reviewId" TEXT NOT NULL,
    "reviewSystemId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "email" TEXT,
    "ownerMemberId" TEXT,
    "ownerName" TEXT,
    "accountType" TEXT,
    "accountStatus" TEXT,
    "roles" TEXT[],
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "mfaEnabled" BOOLEAN,
    "lastLoginAt" TIMESTAMP(3),
    "flags" TEXT[],
    "decision" "AccessReviewDecision",
    "comment" TEXT,
    "decidedById" TEXT,
    "decidedByName" TEXT,
    "decidedAt" TIMESTAMP(3),
    "remediatedAt" TIMESTAMP(3),
    "remediationNote" TEXT,

    CONSTRAINT "AccessReviewItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccessSystem_organizationId_name_key" ON "AccessSystem"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "AccessSystemAccount_systemId_externalId_key" ON "AccessSystemAccount"("systemId", "externalId");

-- CreateIndex
CREATE INDEX "AccessAccountOwner_organizationId_memberId_idx" ON "AccessAccountOwner"("organizationId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessAccountOwner_organizationId_systemKey_accountId_key" ON "AccessAccountOwner"("organizationId", "systemKey", "accountId");

-- CreateIndex
CREATE INDEX "AccessReview_organizationId_status_idx" ON "AccessReview"("organizationId", "status");

-- CreateIndex
CREATE INDEX "AccessReviewSystem_reviewId_idx" ON "AccessReviewSystem"("reviewId");

-- CreateIndex
CREATE INDEX "AccessReviewItem_reviewId_idx" ON "AccessReviewItem"("reviewId");

-- CreateIndex
CREATE INDEX "AccessReviewItem_organizationId_idx" ON "AccessReviewItem"("organizationId");

-- AddForeignKey
ALTER TABLE "AccessSystem" ADD CONSTRAINT "AccessSystem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessSystemAccount" ADD CONSTRAINT "AccessSystemAccount_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "AccessSystem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessAccountOwner" ADD CONSTRAINT "AccessAccountOwner_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessReview" ADD CONSTRAINT "AccessReview_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessReviewSystem" ADD CONSTRAINT "AccessReviewSystem_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "AccessReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessReviewItem" ADD CONSTRAINT "AccessReviewItem_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "AccessReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessReviewItem" ADD CONSTRAINT "AccessReviewItem_reviewSystemId_fkey" FOREIGN KEY ("reviewSystemId") REFERENCES "AccessReviewSystem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
