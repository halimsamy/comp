-- Offboarding SLA defaults (PCI DSS 8.2.5: terminated users' access is revoked immediately).
-- Only default items that have no SLA yet; custom items and admin choices are left alone.
UPDATE "OffboardingChecklistTemplate"
SET "dueDays" = CASE "title"
    WHEN 'Retrieve company devices' THEN 7
    WHEN 'Update org chart and documentation' THEN 7
    WHEN 'Notify relevant teams' THEN 1
    ELSE 0
  END
WHERE "kind" = 'offboarding'
  AND "isDefault" = true
  AND "dueDays" IS NULL
  AND "title" IN (
    'Revoke system access',
    'Remove from identity provider',
    'Retrieve company devices',
    'Deactivate email and accounts',
    'Revoke privileged access',
    'Notify relevant teams',
    'Exit interview completed',
    'Update org chart and documentation',
    'Collect office keys and access badges'
  );
