-- Task.reviewDate now always holds the NEXT due date, and the task schedule
-- checks reviewDate <= now. Some done tasks stored the completion date instead
-- (bulk status change), which the old schedule pushed out by one period. Move
-- those forward by one period so their due date does not change.
UPDATE "Task" t
SET "reviewDate" = t."reviewDate" + p.period
FROM (VALUES
  ('daily'::"TaskFrequency", interval '1 day'),
  ('weekly'::"TaskFrequency", interval '7 days'),
  ('monthly'::"TaskFrequency", interval '1 month'),
  ('quarterly'::"TaskFrequency", interval '3 months'),
  ('semiannually'::"TaskFrequency", interval '6 months'),
  ('yearly'::"TaskFrequency", interval '1 year')
) AS p(frequency, period)
WHERE t."frequency" = p.frequency
  AND t."status" = 'done'
  AND t."reviewDate" <= now()
  AND t."reviewDate" + p.period > now();

-- Completed tasks without a completion timestamp: best known value.
UPDATE "Task"
SET "lastCompletedAt" = COALESCE("approvedAt", "updatedAt")
WHERE "status" = 'done' AND "lastCompletedAt" IS NULL;
