-- ISMS 4.3 scope drafts stop carrying frozen copies of People / Vendors / device
-- counts: the scope now points at those registers instead. Strip only the exact
-- phrases the platform generated, from editable drafts only. Published versions
-- (IsmsDocumentVersion) stay frozen as approved.
UPDATE "IsmsDocument"
SET "draftNarrative" = regexp_replace(
      regexp_replace(
        regexp_replace(
          "draftNarrative"::text,
          ' \(\d+ workforce members\)', '', 'g'),
        ' This includes the \d+ managed endpoints in the device inventory\.', '', 'g'),
      'service providers \(\d+\)', 'service providers', 'g')::jsonb
WHERE "type" = 'isms_scope'
  AND "status" IN ('draft', 'declined')
  AND "draftNarrative" IS NOT NULL
  AND "draftNarrative"::text ~ '(\(\d+ workforce members\)|This includes the \d+ managed endpoints in the device inventory\.|service providers \(\d+\))';
