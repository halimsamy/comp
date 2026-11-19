-- AlterTable
ALTER TABLE "RequirementApplicability" ADD COLUMN     "details" JSONB;

-- AlterTable
ALTER TABLE "SOAAnswer" ADD COLUMN     "inheritedVendorId" TEXT;

-- CreateIndex
CREATE INDEX "SOAAnswer_inheritedVendorId_idx" ON "SOAAnswer"("inheritedVendorId");

-- AddForeignKey
ALTER TABLE "SOAAnswer" ADD CONSTRAINT "SOAAnswer_inheritedVendorId_fkey" FOREIGN KEY ("inheritedVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Catalog data (idempotent): ISO 27001 and PCI DSS Level 1 requirement families,
-- natural sort order, and ISO Annex A names set to the control titles.
-- ---------------------------------------------------------------------------

-- Annex A names: "A.5.15 Organizational Controls" -> "A.5.15 Access control".
UPDATE "FrameworkEditorRequirement" r
SET "name" = v.name
FROM (VALUES
  ('A.5.1', 'A.5.1 Policies for information security'),
  ('A.5.2', 'A.5.2 Information security roles and responsibilities'),
  ('A.5.3', 'A.5.3 Segregation of duties'),
  ('A.5.4', 'A.5.4 Management responsibilities'),
  ('A.5.5', 'A.5.5 Contact with authorities'),
  ('A.5.6', 'A.5.6 Contact with special interest groups'),
  ('A.5.7', 'A.5.7 Threat intelligence'),
  ('A.5.8', 'A.5.8 Information security in project management'),
  ('A.5.9', 'A.5.9 Inventory of information and other associated assets'),
  ('A.5.10', 'A.5.10 Acceptable use of information and other associated assets'),
  ('A.5.11', 'A.5.11 Return of assets'),
  ('A.5.12', 'A.5.12 Classification of information'),
  ('A.5.13', 'A.5.13 Labelling of information'),
  ('A.5.14', 'A.5.14 Information transfer'),
  ('A.5.15', 'A.5.15 Access control'),
  ('A.5.16', 'A.5.16 Identity management'),
  ('A.5.17', 'A.5.17 Authentication information'),
  ('A.5.18', 'A.5.18 Access rights'),
  ('A.5.19', 'A.5.19 Information security in supplier relationships'),
  ('A.5.20', 'A.5.20 Addressing information security within supplier agreements'),
  ('A.5.21', 'A.5.21 Managing information security in the ICT supply chain'),
  ('A.5.22', 'A.5.22 Monitoring, review and change management of supplier services'),
  ('A.5.23', 'A.5.23 Information security for use of cloud services'),
  ('A.5.24', 'A.5.24 Information security incident management planning and preparation'),
  ('A.5.25', 'A.5.25 Assessment and decision on information security events'),
  ('A.5.26', 'A.5.26 Response to information security incidents'),
  ('A.5.27', 'A.5.27 Learning from information security incidents'),
  ('A.5.28', 'A.5.28 Collection of evidence'),
  ('A.5.29', 'A.5.29 Information security during disruption'),
  ('A.5.30', 'A.5.30 ICT readiness for business continuity'),
  ('A.5.31', 'A.5.31 Legal, statutory, regulatory and contractual requirements'),
  ('A.5.32', 'A.5.32 Intellectual property rights'),
  ('A.5.33', 'A.5.33 Protection of records'),
  ('A.5.34', 'A.5.34 Privacy and protection of PII'),
  ('A.5.35', 'A.5.35 Independent review of information security'),
  ('A.5.36', 'A.5.36 Compliance with policies, rules and standards for information security'),
  ('A.5.37', 'A.5.37 Documented operating procedures'),
  ('A.6.1', 'A.6.1 Screening'),
  ('A.6.2', 'A.6.2 Terms and conditions of employment'),
  ('A.6.3', 'A.6.3 Information security awareness, education and training'),
  ('A.6.4', 'A.6.4 Disciplinary process'),
  ('A.6.5', 'A.6.5 Responsibilities after termination or change of employment'),
  ('A.6.6', 'A.6.6 Confidentiality or non-disclosure agreements'),
  ('A.6.7', 'A.6.7 Remote working'),
  ('A.6.8', 'A.6.8 Information security event reporting'),
  ('A.7.1', 'A.7.1 Physical security perimeters'),
  ('A.7.2', 'A.7.2 Physical entry'),
  ('A.7.3', 'A.7.3 Securing offices, rooms and facilities'),
  ('A.7.4', 'A.7.4 Physical security monitoring'),
  ('A.7.5', 'A.7.5 Protecting against physical and environmental threats'),
  ('A.7.6', 'A.7.6 Working in secure areas'),
  ('A.7.7', 'A.7.7 Clear desk and clear screen'),
  ('A.7.8', 'A.7.8 Equipment siting and protection'),
  ('A.7.9', 'A.7.9 Security of assets off-premises'),
  ('A.7.10', 'A.7.10 Storage media'),
  ('A.7.11', 'A.7.11 Supporting utilities'),
  ('A.7.12', 'A.7.12 Cabling security'),
  ('A.7.13', 'A.7.13 Equipment maintenance'),
  ('A.7.14', 'A.7.14 Secure disposal or re-use of equipment'),
  ('A.8.1', 'A.8.1 User endpoint devices'),
  ('A.8.2', 'A.8.2 Privileged access rights'),
  ('A.8.3', 'A.8.3 Information access restriction'),
  ('A.8.4', 'A.8.4 Access to source code'),
  ('A.8.5', 'A.8.5 Secure authentication'),
  ('A.8.6', 'A.8.6 Capacity management'),
  ('A.8.7', 'A.8.7 Protection against malware'),
  ('A.8.8', 'A.8.8 Management of technical vulnerabilities'),
  ('A.8.9', 'A.8.9 Configuration management'),
  ('A.8.10', 'A.8.10 Information deletion'),
  ('A.8.11', 'A.8.11 Data masking'),
  ('A.8.12', 'A.8.12 Data leakage prevention'),
  ('A.8.13', 'A.8.13 Information backup'),
  ('A.8.14', 'A.8.14 Redundancy of information processing facilities'),
  ('A.8.15', 'A.8.15 Logging'),
  ('A.8.16', 'A.8.16 Monitoring activities'),
  ('A.8.17', 'A.8.17 Clock synchronization'),
  ('A.8.18', 'A.8.18 Use of privileged utility programs'),
  ('A.8.19', 'A.8.19 Installation of software on operational systems'),
  ('A.8.20', 'A.8.20 Networks security'),
  ('A.8.21', 'A.8.21 Security of network services'),
  ('A.8.22', 'A.8.22 Segregation of networks'),
  ('A.8.23', 'A.8.23 Web filtering'),
  ('A.8.24', 'A.8.24 Use of cryptography'),
  ('A.8.25', 'A.8.25 Secure development life cycle'),
  ('A.8.26', 'A.8.26 Application security requirements'),
  ('A.8.27', 'A.8.27 Secure system architecture and engineering principles'),
  ('A.8.28', 'A.8.28 Secure coding'),
  ('A.8.29', 'A.8.29 Security testing in development and acceptance'),
  ('A.8.30', 'A.8.30 Outsourced development'),
  ('A.8.31', 'A.8.31 Separation of development, test and production environments'),
  ('A.8.32', 'A.8.32 Change management'),
  ('A.8.33', 'A.8.33 Test information'),
  ('A.8.34', 'A.8.34 Protection of information systems during audit testing')
) AS v(identifier, name)
WHERE r."frameworkId" = 'frk_681ecc34e85064efdbb76993'
  AND r."identifier" = v.identifier
  AND r."name" IS DISTINCT FROM v.name;

-- Families: ISO clauses 4-10 and Annex A themes; PCI requirements 1-12 and appendices A1-A3.
UPDATE "FrameworkEditorRequirement" r
SET "requirementFamily" = CASE
  WHEN r."identifier" ~ '^A\.5\.' THEN 'A.5 Organizational controls'
  WHEN r."identifier" ~ '^A\.6\.' THEN 'A.6 People controls'
  WHEN r."identifier" ~ '^A\.7\.' THEN 'A.7 Physical controls'
  WHEN r."identifier" ~ '^A\.8\.' THEN 'A.8 Technological controls'
  WHEN r."identifier" ~ '^4(\.|$)' THEN 'Clause 4 Context of the organization'
  WHEN r."identifier" ~ '^5(\.|$)' THEN 'Clause 5 Leadership'
  WHEN r."identifier" ~ '^6(\.|$)' THEN 'Clause 6 Planning'
  WHEN r."identifier" ~ '^7(\.|$)' THEN 'Clause 7 Support'
  WHEN r."identifier" ~ '^8(\.|$)' THEN 'Clause 8 Operation'
  WHEN r."identifier" ~ '^9(\.|$)' THEN 'Clause 9 Performance evaluation'
  WHEN r."identifier" ~ '^10(\.|$)' THEN 'Clause 10 Improvement'
  ELSE r."requirementFamily"
END
WHERE r."frameworkId" = 'frk_681ecc34e85064efdbb76993';

UPDATE "FrameworkEditorRequirement" r
SET "requirementFamily" = CASE split_part(r."identifier", '.', 1)
  WHEN '1' THEN 'Requirement 1: Install and maintain network security controls'
  WHEN '2' THEN 'Requirement 2: Apply secure configurations to all system components'
  WHEN '3' THEN 'Requirement 3: Protect stored account data'
  WHEN '4' THEN 'Requirement 4: Protect cardholder data with strong cryptography during transmission'
  WHEN '5' THEN 'Requirement 5: Protect all systems and networks from malicious software'
  WHEN '6' THEN 'Requirement 6: Develop and maintain secure systems and software'
  WHEN '7' THEN 'Requirement 7: Restrict access by business need to know'
  WHEN '8' THEN 'Requirement 8: Identify users and authenticate access'
  WHEN '9' THEN 'Requirement 9: Restrict physical access to cardholder data'
  WHEN '10' THEN 'Requirement 10: Log and monitor all access to system components and cardholder data'
  WHEN '11' THEN 'Requirement 11: Test security of systems and networks regularly'
  WHEN '12' THEN 'Requirement 12: Support information security with organizational policies and programs'
  WHEN 'A1' THEN 'Appendix A1: Multi-tenant service providers'
  WHEN 'A2' THEN 'Appendix A2: SSL/early TLS for card-present POS POI terminals'
  WHEN 'A3' THEN 'Appendix A3: Designated Entities Supplemental Validation (DESV)'
  ELSE r."requirementFamily"
END
WHERE r."frameworkId" = 'frk_69dcfb280b550e7ee231f312';

-- Natural sort (4.1 < 4.2 < 10.1; clauses before Annex A; 12.x before A1.x).
UPDATE "FrameworkEditorRequirement" r
SET "sortOrder" = o.rn
FROM (
  SELECT id, row_number() OVER (
    PARTITION BY "frameworkId"
    ORDER BY ("identifier" ~ '^[A-Za-z]'),
      (SELECT array_agg(m[1]::int ORDER BY ord)
         FROM regexp_matches("identifier", '(\d+)', 'g') WITH ORDINALITY AS t(m, ord)),
      "identifier"
  )::int AS rn
  FROM "FrameworkEditorRequirement"
  WHERE "frameworkId" IN ('frk_681ecc34e85064efdbb76993', 'frk_69dcfb280b550e7ee231f312')
) o
WHERE r.id = o.id AND r."sortOrder" IS DISTINCT FROM o.rn;

-- Pinned framework versions read requirements from their manifest: copy the same values in.
UPDATE "FrameworkVersion" fv
SET "manifest" = jsonb_set(fv."manifest", '{requirements}', (
  SELECT COALESCE(jsonb_agg(
    CASE WHEN r.id IS NULL THEN e
      ELSE e || jsonb_build_object('name', r."name", 'requirementFamily', r."requirementFamily", 'sortOrder', r."sortOrder")
    END ORDER BY ord), '[]'::jsonb)
  FROM jsonb_array_elements(fv."manifest"->'requirements') WITH ORDINALITY AS t(e, ord)
  LEFT JOIN "FrameworkEditorRequirement" r ON r.id = e->>'id'
))
WHERE fv."frameworkId" IN ('frk_681ecc34e85064efdbb76993', 'frk_69dcfb280b550e7ee231f312')
  AND jsonb_typeof(fv."manifest"->'requirements') = 'array';
