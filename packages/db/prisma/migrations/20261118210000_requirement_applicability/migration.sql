-- CreateEnum
CREATE TYPE "RequirementApplicabilityStatus" AS ENUM ('applicable', 'not_applicable', 'compensating_control', 'customized_approach');

-- CreateEnum
CREATE TYPE "RequirementApplicabilitySource" AS ENUM ('manual', 'soa');

-- CreateTable
CREATE TABLE "RequirementApplicability" (
    "id" TEXT NOT NULL DEFAULT generate_prefixed_cuid('rap'::text),
    "organizationId" TEXT NOT NULL,
    "frameworkInstanceId" TEXT NOT NULL,
    "requirementKey" TEXT NOT NULL,
    "status" "RequirementApplicabilityStatus" NOT NULL DEFAULT 'applicable',
    "justification" TEXT,
    "source" "RequirementApplicabilitySource" NOT NULL DEFAULT 'manual',
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequirementApplicability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RequirementApplicability_organizationId_idx" ON "RequirementApplicability"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "RequirementApplicability_frameworkInstanceId_requirementKey_key" ON "RequirementApplicability"("frameworkInstanceId", "requirementKey");

-- AddForeignKey
ALTER TABLE "RequirementApplicability" ADD CONSTRAINT "RequirementApplicability_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementApplicability" ADD CONSTRAINT "RequirementApplicability_frameworkInstanceId_fkey" FOREIGN KEY ("frameworkInstanceId") REFERENCES "FrameworkInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementApplicability" ADD CONSTRAINT "RequirementApplicability_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: the latest ISO 27001 Statement of Applicability answers become the
-- applicability of the matching Annex A requirements ("A." + SoA closure).
INSERT INTO "RequirementApplicability" ("organizationId", "frameworkInstanceId", "requirementKey", "status", "justification", "source", "updatedAt")
SELECT DISTINCT ON (fi."id", r."id")
  d."organizationId",
  fi."id",
  r."id",
  (CASE WHEN a."isApplicable" THEN 'applicable' ELSE 'not_applicable' END)::"RequirementApplicabilityStatus",
  a."answer",
  'soa'::"RequirementApplicabilitySource",
  CURRENT_TIMESTAMP
FROM "SOAAnswer" a
JOIN "SOADocument" d ON d."id" = a."documentId" AND d."isLatest" = true
JOIN "SOAFrameworkConfiguration" c ON c."id" = d."configurationId"
CROSS JOIN LATERAL jsonb_array_elements(c."questions"::jsonb) q
JOIN "FrameworkInstance" fi ON fi."organizationId" = d."organizationId" AND fi."frameworkId" = d."frameworkId"
JOIN "FrameworkEditorRequirement" r ON r."frameworkId" = d."frameworkId"
  AND r."identifier" = 'A.' || (q->'columnMapping'->>'closure')
WHERE a."isLatestAnswer" = true
  AND a."isApplicable" IS NOT NULL
  AND q->>'id' = a."questionId"
ORDER BY fi."id", r."id", a."answerVersion" DESC
ON CONFLICT ("frameworkInstanceId", "requirementKey") DO NOTHING;
