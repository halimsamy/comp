import {
  evidenceFormDefinitions,
  evidenceFormSubmissionSchemaMap,
} from '@/app/(app)/[orgId]/documents/forms';
import {
  toDbEvidenceFormTypeValue,
  toExternalEvidenceFormTypeValue,
  type EvidenceFormType,
} from '@trycompai/company';
import { describe, expect, it } from 'vitest';

const file = {
  fileName: 'ack.pdf',
  fileKey: 'org/ack.pdf',
  downloadUrl: 'https://example.com/ack.pdf',
};

const cryptoRow = {
  dataStore: 'orders-db',
  dataProtected: 'no PAN – PSP-hosted',
  protectionMethod: 'Disk encryption',
  algorithmKeyStrength: 'AES-256',
  protocolCipherSuites: '',
  keyLocation: 'alias/orders in AWS KMS',
  keyUsage: 'Data encryption',
  expiryCryptoperiod: '1 year',
  lastRotation: '2026-01-01',
  prodTestKeysSeparated: 'Yes',
  keyCustodian: 'Jane Doe',
};

const tra = {
  submissionDate: '2026-06-10',
  requirementAddressed: 'PCI DSS 5.3.2.1',
  assetsProtected: 'Cardholder data environment workstations',
  threats: 'Malware',
  likelihoodImpactFactors: 'Low exposure, EDR in place',
  chosenApproach: 'Weekly scans because ...',
  approver: 'Jane Doe, CISO',
  approvalDate: '2026-06-10',
  nextReviewDate: '2027-06-01',
};

const change = {
  submissionDate: '2026-06-10',
  changeDescription: 'CHG-42 move checkout to new VPC',
  changeDate: '2026-06-01',
  systemsAffected: 'checkout-api',
  significanceRationale: 'Changes network segmentation',
  pciRequirementsReconfirmed: '1.2, 1.3, 11.3',
  retestLink: 'https://example.com/scan/1',
  docsUpdated: 'Network diagram, inventory',
  testDataRemoved: 'Yes',
  approver: 'Jane Doe',
  approvalDate: '2026-06-05',
};

describe('PCI document type definitions', () => {
  it.each([
    ['cryptographic-inventory', 'Cryptographic Inventory'],
    ['targeted-risk-analysis', 'Targeted Risk Analysis'],
    ['significant-change-record', 'Significant Change Record'],
  ] as const)('%s has title %s and is framework-specific', (type, title) => {
    const definition = evidenceFormDefinitions[type];
    expect(definition.type).toBe(type);
    expect(definition.title).toBe(title);
    expect(definition.category).toBe('Security');
    expect(definition.hidden).toBe(true);
    expect(definition.optional).toBe(true);
  });

  it('cryptographic-inventory has the inventory columns and a custodian acknowledgement', () => {
    const fields = evidenceFormDefinitions['cryptographic-inventory'].fields;
    const columns = fields.find((f) => f.type === 'matrix')?.columns ?? [];
    expect(columns.map((c) => c.key)).toEqual(Object.keys(cryptoRow));
    expect(columns.find((c) => c.key === 'protectionMethod')?.options?.map((o) => o.value)).toEqual(
      ['Token', 'Truncation', 'Keyed hash', 'Field encryption', 'Disk encryption', 'TLS', 'Other'],
    );
    expect(columns.find((c) => c.key === 'prodTestKeysSeparated')?.type).toBe('select');
    expect(fields.find((f) => f.key === 'custodianAcknowledgement')?.type).toBe('file');
  });

  it('every schema key matches a definition field', () => {
    for (const [type, data] of [
      ['targeted-risk-analysis', tra],
      ['significant-change-record', change],
    ] as const) {
      const keys = evidenceFormDefinitions[type].fields.map((f) => f.key);
      for (const key of Object.keys(data)) {
        if (key !== 'submissionDate') expect(keys).toContain(key);
      }
    }
  });
});

describe('cryptographic-inventory validation', () => {
  const schema = evidenceFormSubmissionSchemaMap['cryptographic-inventory'];
  const submission = (rows: unknown[]) => ({
    submissionDate: '2026-06-10',
    cryptoRows: rows,
    custodianAcknowledgement: file,
  });

  it('accepts a complete row', () => {
    expect(schema.safeParse(submission([cryptoRow])).success).toBe(true);
  });

  it('accepts a keyless row with blank optional columns', () => {
    const row = {
      ...cryptoRow,
      protectionMethod: 'Truncation',
      algorithmKeyStrength: '',
      prodTestKeysSeparated: '',
    };
    expect(schema.safeParse(submission([row])).success).toBe(true);
  });

  it('rejects an unknown protection method, missing custodian, or no rows', () => {
    expect(
      schema.safeParse(submission([{ ...cryptoRow, protectionMethod: 'ROT13' }])).success,
    ).toBe(false);
    expect(schema.safeParse(submission([{ ...cryptoRow, keyCustodian: ' ' }])).success).toBe(false);
    expect(schema.safeParse(submission([])).success).toBe(false);
  });

  it('requires the custodian acknowledgement', () => {
    const { custodianAcknowledgement: _omit, ...rest } = submission([cryptoRow]);
    expect(schema.safeParse(rest).success).toBe(false);
  });
});

describe('targeted-risk-analysis validation', () => {
  const schema = evidenceFormSubmissionSchemaMap['targeted-risk-analysis'];

  it('accepts a complete analysis, with or without an attachment', () => {
    expect(schema.safeParse(tra).success).toBe(true);
    expect(schema.safeParse({ ...tra, evidenceFile: file }).success).toBe(true);
  });

  it('rejects a missing requirement', () => {
    expect(schema.safeParse({ ...tra, requirementAddressed: '' }).success).toBe(false);
  });

  it('requires the next review within 12 months after approval', () => {
    const tooLate = schema.safeParse({ ...tra, nextReviewDate: '2027-06-11' });
    expect(tooLate.success).toBe(false);
    if (!tooLate.success) expect(tooLate.error.issues[0]?.path).toEqual(['nextReviewDate']);
    expect(schema.safeParse({ ...tra, nextReviewDate: '2026-06-10' }).success).toBe(false);
    expect(schema.safeParse({ ...tra, nextReviewDate: '2027-06-10' }).success).toBe(true);
  });
});

describe('significant-change-record validation', () => {
  const schema = evidenceFormSubmissionSchemaMap['significant-change-record'];

  it('accepts a complete record', () => {
    expect(schema.safeParse(change).success).toBe(true);
  });

  it('requires a Yes/No answer for test data removal', () => {
    expect(schema.safeParse({ ...change, testDataRemoved: '' }).success).toBe(false);
    expect(schema.safeParse({ ...change, testDataRemoved: 'No' }).success).toBe(true);
  });

  it('rejects a missing approver', () => {
    expect(schema.safeParse({ ...change, approver: '' }).success).toBe(false);
  });
});

describe('penetration-test rules of engagement field', () => {
  const schema = evidenceFormSubmissionSchemaMap['penetration-test'];
  const pentest = {
    submissionDate: '2026-06-10',
    testDate: '2026-06-01',
    vendorName: 'Acme Security',
    summary: 'No critical findings',
    pentestReport: file,
  };

  it('is defined as an optional field', () => {
    const field = evidenceFormDefinitions['penetration-test'].fields.find(
      (f) => f.key === 'rulesOfEngagementApproval',
    );
    expect(field?.required).toBe(false);
  });

  it('keeps existing submissions valid and accepts the new value', () => {
    expect(schema.safeParse(pentest).success).toBe(true);
    expect(
      schema.safeParse({ ...pentest, rulesOfEngagementApproval: 'Jane Doe, CISO, 2026-05-01' })
        .success,
    ).toBe(true);
  });
});

describe('db form type mapping', () => {
  it.each([
    ['cryptographic-inventory', 'cryptographic_inventory'],
    ['targeted-risk-analysis', 'targeted_risk_analysis'],
    ['significant-change-record', 'significant_change_record'],
  ] as const)('round-trips %s <-> %s', (external: EvidenceFormType, db) => {
    expect(toDbEvidenceFormTypeValue(external)).toBe(db);
    expect(toExternalEvidenceFormTypeValue(db)).toBe(external);
  });
});
