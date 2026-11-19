-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "registeredAddress" TEXT;

-- AlterTable
ALTER TABLE "role_notification_setting" ADD COLUMN     "complianceDigest" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "ownershipAssignments" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "slaAlerts" BOOLEAN NOT NULL DEFAULT true;

-- Event log: relabel rows written before the interceptor's route-label map
-- (audit-log.request-meta.ts ROUTE_LABELS), e.g. "Created member" on
-- /v1/access-reviews becomes "Created access review" with resource
-- "access-reviews". Idempotent: rows already carrying the label resource are skipped.
WITH labels(prefix, resource, label, entity_type) AS (
  VALUES
    ('access-reviews', 'access-reviews', 'access review', 'people'),
    ('access', 'access-reviews', 'system access', 'people'),
    ('assets', 'assets', 'asset', 'integration'),
    ('vulnerabilities', 'vulnerabilities', 'vulnerability', 'integration'),
    ('isms', 'isms', 'ISMS document', 'organization'),
    ('roles', 'roles', 'role', 'people'),
    ('training', 'training', 'training', 'people'),
    ('audits', 'audits', 'audit', 'framework'),
    ('questionnaire', 'questionnaires', 'questionnaire', 'organization'),
    ('soa', 'soa', 'Statement of Applicability', 'framework')
)
UPDATE "AuditLog" AS a
SET
  "data" = jsonb_set(a."data", '{resource}', to_jsonb(l.resource)),
  "entityType" = COALESCE(a."entityType", l.entity_type::"AuditLogEntityType"),
  "description" = regexp_replace(
    a."description",
    '^((\[Impersonated\] )?(Created|Updated|Deleted|Viewed)) ' || (a."data"->>'resource') || '\M',
    '\1 ' || l.label
  )
FROM labels AS l
WHERE substring(a."data"->>'path' FROM '/v[0-9]+/([^/?]+)') = l.prefix
  AND a."data"->>'resource' IS DISTINCT FROM l.resource;
