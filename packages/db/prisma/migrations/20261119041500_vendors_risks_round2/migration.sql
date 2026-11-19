-- Vendor archive (relationship ended; kept for audit history).
ALTER TABLE "Vendor" ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "archiveReason" TEXT;

-- Vendor review: confirmed PCI status, documents reviewed, conditions.
ALTER TABLE "VendorReview" ADD COLUMN "pciStatus" "VendorPciStatus",
ADD COLUMN "reviewedDocumentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "conditions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Risk: per-org short reference (R-001) and library framework references.
ALTER TABLE "Risk" ADD COLUMN "ref" TEXT,
ADD COLUMN "frameworkRefs" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Backfill refs per organization in creation order. Idempotent: only rows without a ref.
UPDATE "Risk" r
SET "ref" = 'R-' || lpad(x.n::text, GREATEST(3, length(x.n::text)), '0')
FROM (
  SELECT id, row_number() OVER (PARTITION BY "organizationId" ORDER BY "createdAt", id) AS n
  FROM "Risk"
) x
WHERE r.id = x.id AND r."ref" IS NULL;

CREATE UNIQUE INDEX "Risk_organizationId_ref_key" ON "Risk"("organizationId", "ref");

-- Every insert path (API, onboarding job, AI generation) gets the next ref.
-- The advisory lock serializes concurrent inserts for the same organization.
CREATE OR REPLACE FUNCTION assign_risk_ref() RETURNS trigger AS $$
DECLARE
  next_n integer;
BEGIN
  IF NEW."ref" IS NOT NULL THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('risk_ref:' || NEW."organizationId"));
  SELECT COALESCE(MAX(substring("ref" from '^R-([0-9]+)$')::integer), 0) + 1
    INTO next_n
    FROM "Risk"
    WHERE "organizationId" = NEW."organizationId";
  NEW."ref" := 'R-' || lpad(next_n::text, GREATEST(3, length(next_n::text)), '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS risk_assign_ref ON "Risk";
CREATE TRIGGER risk_assign_ref BEFORE INSERT ON "Risk"
FOR EACH ROW EXECUTE FUNCTION assign_risk_ref();

-- #110: a signed-off vendor review verifies the risk assessment. Close the
-- open "Verify risk assessment" to-dos of reviewed vendors and mark them assessed.
UPDATE "TaskItem" t
SET "status" = 'done', "completedAt" = NOW(), "updatedAt" = NOW()
WHERE t."entityType" = 'vendor'
  AND t."title" = 'Verify risk assessment'
  AND t."status" NOT IN ('done', 'canceled')
  AND EXISTS (SELECT 1 FROM "VendorReview" v WHERE v."vendorId" = t."entityId");

UPDATE "Vendor"
SET "status" = 'assessed'
WHERE "status" <> 'assessed'
  AND id IN (SELECT "vendorId" FROM "VendorReview");
