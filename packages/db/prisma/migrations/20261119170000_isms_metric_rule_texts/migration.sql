-- The four computed 9.1 metrics now use the owning module's rule (People
-- training, Overview policy acknowledgement, Vendors review scope, 10.2
-- register). Seeding never overwrites, so existing orgs still describe the old
-- rule next to a value computed with the new one. Replace only texts that are
-- still the exact old platform default; customer-edited texts are untouched.
-- Mirrors apps/api/src/isms/documents/monitoring-defaults.ts.
UPDATE "IsmsMetric" AS m
SET "whatIsMeasured" = CASE WHEN m."whatIsMeasured" = d.old_what THEN d.new_what ELSE m."whatIsMeasured" END,
    "method" = CASE WHEN m."method" = d.old_method THEN d.new_method ELSE m."method" END,
    "target" = CASE WHEN m."target" = d.old_target THEN d.new_target ELSE m."target" END
FROM (VALUES
  ('training_completion',
   'Percentage of workforce members who have completed their assigned security-awareness training.',
   'Percentage of in-scope workforce members whose security-awareness and assigned role training is complete and not expired.',
   'Comp AI training tracker: completed assignments over total assigned, per campaign with monthly follow-up.',
   'Computed by Comp AI with the People training rule (the same one the Overview training card uses): members with complete, in-date training over all members who must train.',
   NULL, NULL),
  ('vendor_review_currency',
   'Percentage of critical vendors with an in-date security review and a signed DPA.',
   'Percentage of vendors in periodic-review scope with an in-date security review.',
   'Comp AI vendor register: critical vendors with a review inside its window and a signed DPA, over all critical vendors.',
   'Computed by Comp AI with the Vendors review rule: non-archived vendors in review scope (critical or high criticality, PCI DSS 12.8 scope, or high inherent risk) whose review is not overdue or missing, over all vendors in scope.',
   '100% of critical vendors current',
   '100% of in-scope vendors current'),
  ('finding_ageing',
   'Count of open audit findings and the age of each open corrective action.',
   'Count of open nonconformities and auditor findings in the 10.2 register, and the age of each.',
   'Corrective-action records in Comp AI: open findings and days since each was raised, against its due date.',
   'Computed by Comp AI from the 10.2 nonconformity register (internal-audit nonconformities, auditor findings and standalone records; observations and OFIs are excluded): open items by days since raised, against their due date.',
   NULL, NULL),
  ('policy_acknowledgement',
   'Percentage of workforce members who have acknowledged all policies assigned to them.',
   'Percentage of workforce members who have acknowledged all policies assigned to them.',
   'Comp AI policy tracker: members with all assigned policies acknowledged, over all members with assignments.',
   'Computed by Comp AI with the Overview acknowledgement rule: members who signed every published policy that requires sign-off and is visible to them (department-scoped policies count only for those departments), over all members with such policies.',
   NULL, NULL)
) AS d("metricKey", old_what, new_what, old_method, new_method, old_target, new_target)
WHERE m."metricKey" = d."metricKey"
  AND (m."whatIsMeasured" = d.old_what OR m."method" = d.old_method OR m."target" = d.old_target);
