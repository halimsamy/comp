-- Control owner (controls list "Owner" column)
ALTER TABLE "Control" ADD COLUMN "ownerId" TEXT;
CREATE INDEX "Control_ownerId_idx" ON "Control"("ownerId");
ALTER TABLE "Control" ADD CONSTRAINT "Control_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Evidence once, map many: a policy / task / evidence form linked to a control
-- counts for every framework instance that maps that control. Idempotent backfill.

-- 1. Framework-scoped links -> control-level links (so control-level readers see them).
INSERT INTO "_ControlToPolicy" ("A", "B")
SELECT DISTINCT l."controlId", l."policyId" FROM "FrameworkControlPolicyLink" l
ON CONFLICT DO NOTHING;

INSERT INTO "_ControlToTask" ("A", "B")
SELECT DISTINCT l."controlId", l."taskId" FROM "FrameworkControlTaskLink" l
ON CONFLICT DO NOTHING;

INSERT INTO "ControlDocumentType" ("controlId", "formType")
SELECT DISTINCT l."controlId", l."formType" FROM "FrameworkControlDocumentTypeLink" l
ON CONFLICT DO NOTHING;

-- 2. Control-level links -> every framework instance (same org) that maps the control.
WITH mapped AS (
  SELECT DISTINCT rm."controlId", rm."frameworkInstanceId"
  FROM "RequirementMap" rm
  JOIN "Control" c ON c."id" = rm."controlId"
  JOIN "FrameworkInstance" fi ON fi."id" = rm."frameworkInstanceId" AND fi."organizationId" = c."organizationId"
  WHERE rm."archivedAt" IS NULL
)
INSERT INTO "FrameworkControlPolicyLink" ("frameworkInstanceId", "controlId", "policyId")
SELECT m."frameworkInstanceId", cp."A", cp."B"
FROM "_ControlToPolicy" cp
JOIN mapped m ON m."controlId" = cp."A"
JOIN "Policy" p ON p."id" = cp."B" AND p."archivedAt" IS NULL
ON CONFLICT DO NOTHING;

WITH mapped AS (
  SELECT DISTINCT rm."controlId", rm."frameworkInstanceId"
  FROM "RequirementMap" rm
  JOIN "Control" c ON c."id" = rm."controlId"
  JOIN "FrameworkInstance" fi ON fi."id" = rm."frameworkInstanceId" AND fi."organizationId" = c."organizationId"
  WHERE rm."archivedAt" IS NULL
)
INSERT INTO "FrameworkControlTaskLink" ("frameworkInstanceId", "controlId", "taskId")
SELECT m."frameworkInstanceId", ct."A", ct."B"
FROM "_ControlToTask" ct
JOIN mapped m ON m."controlId" = ct."A"
JOIN "Task" t ON t."id" = ct."B" AND t."archivedAt" IS NULL
ON CONFLICT DO NOTHING;

WITH mapped AS (
  SELECT DISTINCT rm."controlId", rm."frameworkInstanceId"
  FROM "RequirementMap" rm
  JOIN "Control" c ON c."id" = rm."controlId"
  JOIN "FrameworkInstance" fi ON fi."id" = rm."frameworkInstanceId" AND fi."organizationId" = c."organizationId"
  WHERE rm."archivedAt" IS NULL
)
INSERT INTO "FrameworkControlDocumentTypeLink" ("frameworkInstanceId", "controlId", "formType")
SELECT m."frameworkInstanceId", d."controlId", d."formType"
FROM "ControlDocumentType" d
JOIN mapped m ON m."controlId" = d."controlId"
ON CONFLICT DO NOTHING;
