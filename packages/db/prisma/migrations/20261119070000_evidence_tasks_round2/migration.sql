-- AlterTable: owner and cadence per company form (#50, #136)
ALTER TABLE "EvidenceFormSetting" ADD COLUMN     "cadenceMonthsOverride" INTEGER,
ADD COLUMN     "ownerMemberId" TEXT;

-- Data: due dates for open tasks that have none (#4, #41). Task.reviewDate is the
-- due date. The later of now + 30 days and createdAt + one task cycle, so nothing
-- lands overdue on deploy. Idempotent: only rows without a reviewDate.
UPDATE "Task" SET "reviewDate" = GREATEST(
  now() + interval '30 days',
  "createdAt" + CASE "frequency"
    WHEN 'daily' THEN interval '1 day'
    WHEN 'weekly' THEN interval '7 days'
    WHEN 'monthly' THEN interval '1 month'
    WHEN 'quarterly' THEN interval '3 months'
    WHEN 'semiannually' THEN interval '6 months'
    ELSE interval '12 months'
  END
)
WHERE "reviewDate" IS NULL
  AND "archivedAt" IS NULL
  AND "status" NOT IN ('done', 'not_relevant');

-- Data: validity for task evidence uploaded before validity existed (#107):
-- valid from upload for one task cycle (same rule as new uploads). Idempotent:
-- only rows without a validFrom.
UPDATE "Attachment" a SET
  "validFrom" = a."createdAt",
  "validUntil" = COALESCE(a."validUntil", CASE t."frequency"
    WHEN 'daily' THEN a."createdAt" + interval '1 day'
    WHEN 'weekly' THEN a."createdAt" + interval '7 days'
    WHEN 'monthly' THEN a."createdAt" + interval '1 month'
    WHEN 'quarterly' THEN a."createdAt" + interval '3 months'
    WHEN 'semiannually' THEN a."createdAt" + interval '6 months'
    WHEN 'yearly' THEN a."createdAt" + interval '12 months'
    ELSE NULL
  END)
FROM "Task" t
WHERE a."entityType" = 'task'
  AND a."entityId" = t."id"
  AND a."organizationId" = t."organizationId"
  AND a."validFrom" IS NULL;
