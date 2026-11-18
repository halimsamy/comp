-- CreateEnum
CREATE TYPE "AssetSource" AS ENUM ('integration', 'device', 'manual');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('computer', 'compute', 'container', 'serverless', 'database', 'storage', 'network', 'repository', 'key_secret', 'messaging', 'cloud_account', 'application', 'other');

-- CreateEnum
CREATE TYPE "AssetEnvironment" AS ENUM ('production', 'staging', 'development', 'test', 'unknown');

-- CreateEnum
CREATE TYPE "AssetCdeScope" AS ENUM ('unassessed', 'in_scope', 'connected', 'out_of_scope');

-- CreateEnum
CREATE TYPE "AssetDataClassification" AS ENUM ('unclassified', 'public', 'internal', 'confidential', 'restricted');

-- CreateEnum
CREATE TYPE "VulnerabilitySource" AS ENUM ('integration', 'asv_scan', 'pentest', 'manual');

-- AlterTable
ALTER TABLE "IntegrationPlatformFinding" ADD COLUMN     "assetId" TEXT,
ADD COLUMN     "cveId" TEXT,
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "slaDueAt" TIMESTAMP(3),
ADD COLUMN     "source" "VulnerabilitySource" NOT NULL DEFAULT 'integration',
ADD COLUMN     "statusNote" TEXT,
ALTER COLUMN "connectionId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('ast'::text),
    "organizationId" TEXT NOT NULL,
    "source" "AssetSource" NOT NULL,
    "connectionId" TEXT,
    "providerSlug" TEXT,
    "externalId" TEXT NOT NULL,
    "resourceType" TEXT,
    "name" TEXT NOT NULL,
    "type" "AssetType" NOT NULL,
    "environment" "AssetEnvironment" NOT NULL DEFAULT 'unknown',
    "cdeScope" "AssetCdeScope" NOT NULL DEFAULT 'unassessed',
    "dataClassification" "AssetDataClassification" NOT NULL DEFAULT 'unclassified',
    "ownerId" TEXT,
    "description" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Asset_organizationId_archivedAt_idx" ON "Asset"("organizationId", "archivedAt");

-- CreateIndex
CREATE INDEX "Asset_connectionId_idx" ON "Asset"("connectionId");

-- CreateIndex
CREATE INDEX "Asset_ownerId_idx" ON "Asset"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_organizationId_source_externalId_key" ON "Asset"("organizationId", "source", "externalId");

-- CreateIndex
CREATE INDEX "IntegrationPlatformFinding_organizationId_status_idx" ON "IntegrationPlatformFinding"("organizationId", "status");

-- CreateIndex
CREATE INDEX "IntegrationPlatformFinding_assetId_idx" ON "IntegrationPlatformFinding"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationPlatformFinding_organizationId_source_externalId_key" ON "IntegrationPlatformFinding"("organizationId", "source", "externalId");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationPlatformFinding" ADD CONSTRAINT "IntegrationPlatformFinding_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationPlatformFinding" ADD CONSTRAINT "IntegrationPlatformFinding_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationPlatformFinding" ADD CONSTRAINT "IntegrationPlatformFinding_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: legacy webhook findings take their connection's organization and
-- their creation time as first/last seen.
UPDATE "IntegrationPlatformFinding" f
SET "organizationId" = c."organizationId",
    "firstSeenAt" = f."createdAt",
    "lastSeenAt" = f."updatedAt"
FROM "IntegrationConnection" c
WHERE c."id" = f."connectionId";
