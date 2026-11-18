-- CreateTable
CREATE TABLE "ComplianceSnapshot" (
    "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('csnap'::text),
    "organizationId" TEXT NOT NULL,
    "frameworkInstanceId" TEXT NOT NULL,
    "frameworkName" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "scorePercent" INTEGER NOT NULL,
    "controlsComplete" INTEGER NOT NULL,
    "controlsTotal" INTEGER NOT NULL,
    "requirementsSatisfied" INTEGER NOT NULL,
    "requirementsTotal" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComplianceSnapshot_organizationId_date_idx" ON "ComplianceSnapshot"("organizationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceSnapshot_frameworkInstanceId_date_key" ON "ComplianceSnapshot"("frameworkInstanceId", "date");

-- AddForeignKey
ALTER TABLE "ComplianceSnapshot" ADD CONSTRAINT "ComplianceSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceSnapshot" ADD CONSTRAINT "ComplianceSnapshot_frameworkInstanceId_fkey" FOREIGN KEY ("frameworkInstanceId") REFERENCES "FrameworkInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
