-- Done tasks completed by an automation (e.g. AWS auto-satisfy) could have no
-- reviewDate, so the task schedule never brought them due again. Give them
-- one: last completion + one period (lastCompletedAt was backfilled above).
UPDATE "Task" t
SET "reviewDate" = t."lastCompletedAt" + p.period
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
  AND t."reviewDate" IS NULL
  AND t."lastCompletedAt" IS NOT NULL;
