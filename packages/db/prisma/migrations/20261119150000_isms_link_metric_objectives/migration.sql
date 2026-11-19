-- Link the seeded 9.1 metrics to the default 6.2 objective they measure, so the
-- objective holds the target and the metric only the measured value. Same org
-- and framework, exact default objective text, and only metrics with no link
-- yet (a chosen link is never overwritten). Mirrors seedMetricsIfMissing in
-- apps/api/src/isms/documents/monitoring.ts, which links new seeds the same way.
UPDATE "IsmsMetric" AS m
SET "objectiveId" = (
  SELECT o."id"
  FROM "IsmsObjective" AS o
  JOIN "IsmsDocument" AS od ON od."id" = o."documentId"
  WHERE od."organizationId" = md."organizationId"
    AND od."frameworkId" = md."frameworkId"
    AND od."type" = 'objectives_plan'
    AND o."objective" = map."objective"
  ORDER BY o."position" ASC
  LIMIT 1
)
FROM "IsmsDocument" AS md,
  (VALUES
    ('training_completion', 'Achieve high security-awareness training completion'),
    ('risk_treatment_status', 'Resolve high and critical risks within SLA'),
    ('vendor_review_currency', 'Complete scheduled vendor security reviews')
  ) AS map("metricKey", "objective")
WHERE md."id" = m."documentId"
  AND m."metricKey" = map."metricKey"
  AND m."objectiveId" IS NULL;
