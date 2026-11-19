import {
  classifyAssetName,
  classifyEnvironment,
  classifyResourceType,
  displayNameFromResourceId,
} from './asset-classify';
import {
  integrationVulnerabilityKey,
  isVulnerabilityResult,
  scanPrefixOf,
  vulnerabilityResourceKey,
} from './vulnerability-signals';
import { slaDueDate, slaStatus } from './vulnerability-sla';
import { statusChangeError } from './vulnerability-status-rules';

jest.mock('@db', () => ({ db: {} }));

describe('classifyAssetName', () => {
  it.each([
    ['AWS Secrets Manager', 'key_secret'],
    ['ECR repositories', 'repository'],
    ['Aurora MySQL 8.0 cluster', 'database'],
    ['Step Functions state machine spare-prod-rds-export', 'serverless'],
    ['Application Load Balancer spare-server', 'network'],
    ['IAM', 'other'],
  ])('%s → %s', (name, expected) => {
    expect(classifyAssetName(name)).toBe(expected);
  });
});

describe('vulnerability status rules', () => {
  const now = new Date('2026-11-18T00:00:00Z');
  const base = {
    note: 'Compensating control',
    source: 'asv_scan' as const,
    severity: 'medium' as const,
    assetScope: null,
    acceptedUntil: new Date('2027-01-01T00:00:00Z'),
    acceptedById: 'mem_cto',
    requesterMemberId: 'mem_me',
    now,
  };

  it('allows a justified, time-boxed acceptance approved by someone else', () => {
    expect(statusChangeError({ ...base, status: 'risk_accepted' })).toBeNull();
  });

  it.each([
    [{ acceptedById: 'mem_me' }, 'Someone other than you'],
    [{ acceptedById: null }, 'Choose who approves'],
    [{ acceptedUntil: new Date('2026-11-01') }, 'future date'],
    [{ acceptedUntil: new Date('2028-01-01') }, 'at most one year'],
    [{ note: null }, 'Explain why'],
    [
      { severity: 'high' as const, assetScope: 'connected' as const },
      'cannot be risk-accepted',
    ],
  ])('rejects %o', (over, message) => {
    expect(
      statusChangeError({ ...base, ...over, status: 'risk_accepted' }),
    ).toContain(message);
  });

  it('lets a high finding on an out-of-scope asset be accepted', () => {
    expect(
      statusChangeError({
        ...base,
        status: 'risk_accepted',
        severity: 'high',
        assetScope: 'out_of_scope',
      }),
    ).toBeNull();
  });

  it('needs a note for a false positive and blocks resolving integration findings', () => {
    expect(
      statusChangeError({ ...base, note: null, status: 'false_positive' }),
    ).toContain('false positive');
    expect(
      statusChangeError({ ...base, source: 'integration', status: 'resolved' }),
    ).toContain('resolve automatically');
  });
});

describe('classifyResourceType', () => {
  it.each([
    ['repository', 'repository'],
    ['AwsEcrRepository', 'repository'],
    ['aws-s3-bucket', 'storage'],
    ['AwsS3Bucket', 'storage'],
    ['aws-rds-instance', 'database'],
    ['AwsDynamoDbTable', 'database'],
    ['AwsLambdaFunction', 'serverless'],
    ['AwsEksCluster', 'container'],
    ['aws-security-group', 'network'],
    ['AwsEc2Instance', 'compute'],
    ['virtual-machine', 'compute'],
    ['aws-kms-key', 'key_secret'],
    ['AwsSqsQueue', 'messaging'],
    ['aws-account', 'cloud_account'],
    ['gcp-project', 'cloud_account'],
    ['azure-subscription', 'cloud_account'],
  ])('%s → %s', (resourceType, expected) => {
    expect(classifyResourceType(resourceType)).toBe(expected);
  });

  it.each([
    'user',
    'organization',
    'workspace',
    'AwsIamUser',
    'AwsIamAccessKey',
    'aws-cloudtrail',
    'aws-environment-separation',
    'AwsGuardDutyDetector',
    'policy-state',
    'something-new',
    '',
  ])('%s is not an asset', (resourceType) => {
    expect(classifyResourceType(resourceType)).toBeNull();
  });
});

describe('classifyEnvironment', () => {
  it.each([
    ['payments-prod-db', 'production'],
    ['arn:aws:s3:::spare-production-logs', 'production'],
    ['api-staging', 'staging'],
    ['app-pre-prod', 'staging'],
    ['web_dev', 'development'],
    ['qa-runner', 'test'],
    ['non-prod-shared', 'unknown'],
    ['product-catalog', 'unknown'],
  ])('%s → %s', (name, expected) => {
    expect(classifyEnvironment(name)).toBe(expected);
  });
});

it('derives a display name from an ARN or path', () => {
  expect(displayNameFromResourceId('arn:aws:s3:::my-bucket')).toBe('my-bucket');
  expect(displayNameFromResourceId('acme/api')).toBe('api');
  expect(displayNameFromResourceId('plain')).toBe('plain');
});

describe('isVulnerabilityResult', () => {
  const base = { passed: false, evidence: {} };

  it('accepts Dependabot alerts but not configuration failures', () => {
    expect(
      isVulnerabilityResult({
        ...base,
        checkId: 'dependabot_enabled',
        title: '3 unresolved Dependabot alerts on api',
      }),
    ).toBe(true);
    expect(
      isVulnerabilityResult({
        ...base,
        checkId: 'dependabot_enabled',
        title: 'Dependabot not enabled on api',
      }),
    ).toBe(false);
  });

  it('accepts Aikido open issues and Inspector findings', () => {
    expect(
      isVulnerabilityResult({
        ...base,
        checkId: 'open_security_issues',
        title: 'x',
      }),
    ).toBe(true);
    expect(
      isVulnerabilityResult({
        ...base,
        checkId: 'aws-security-scan',
        title: 'CVE-2024-1 in openssl',
        evidence: { generatorId: 'arn:aws:inspector2:eu-west-1:1:finding' },
      }),
    ).toBe(true);
  });

  it('rejects passes and ordinary cloud tests', () => {
    expect(
      isVulnerabilityResult({
        ...base,
        passed: true,
        checkId: 'open_security_issues',
        title: 'x',
      }),
    ).toBe(false);
    expect(
      isVulnerabilityResult({
        ...base,
        checkId: 'aws-security-scan',
        title: 'S3 public',
        evidence: { generatorId: 'aws-foundational/S3.1' },
      }),
    ).toBe(false);
  });

  it('keys count-based checks per resource and per-finding sources per title', () => {
    expect(
      vulnerabilityResourceKey({
        checkId: 'dependabot_enabled',
        resourceId: 'acme/api',
        title: '3 alerts',
      }),
    ).toBe('acme/api');
    expect(
      vulnerabilityResourceKey({
        checkId: 'aws-security-scan',
        resourceId: 'i-1',
        title: 'CVE-2024-1 in openssl',
      }),
    ).toBe('i-1#CVE-2024-1 in openssl');
  });

  it('builds keys whose prefix identifies the scanned check', () => {
    const key = integrationVulnerabilityKey({
      connectionId: 'icn_1',
      checkId: 'dependabot_enabled',
      resourceId: 'acme/api:x',
    });
    expect(key).toBe('icn_1:dependabot_enabled:acme/api:x');
    expect(scanPrefixOf(key)).toBe('icn_1:dependabot_enabled');
  });
});

describe('remediation SLA', () => {
  const firstSeenAt = new Date('2026-11-01T00:00:00Z');

  it('gives critical and high findings one month (PCI DSS 6.3.3) and info none', () => {
    expect(
      slaDueDate({ severity: 'critical', firstSeenAt })?.toISOString(),
    ).toBe('2026-12-01T00:00:00.000Z');
    expect(slaDueDate({ severity: 'high', firstSeenAt })?.toISOString()).toBe(
      '2026-12-01T00:00:00.000Z',
    );
    expect(slaDueDate({ severity: 'medium', firstSeenAt })?.toISOString()).toBe(
      '2027-01-30T00:00:00.000Z',
    );
    expect(slaDueDate({ severity: 'info', firstSeenAt })).toBeNull();
  });

  it('uses the org policy days and caps ASV failures at the next quarterly scan', () => {
    const days = { critical: 7, high: 14, medium: 120, low: 180, info: null };
    expect(slaDueDate({ severity: 'critical', firstSeenAt, days })).toEqual(
      new Date('2026-11-08T00:00:00Z'),
    );
    expect(
      slaDueDate({
        severity: 'medium',
        firstSeenAt,
        days,
        asvScannedAt: firstSeenAt,
      }),
    ).toEqual(new Date('2027-01-30T00:00:00Z'));
  });

  it('classifies SLA status', () => {
    const now = new Date('2026-11-20T00:00:00Z');
    const due = (iso: string) => new Date(iso);
    expect(
      slaStatus({ status: 'open', slaDueAt: due('2026-11-19T00:00:00Z'), now }),
    ).toBe('overdue');
    expect(
      slaStatus({ status: 'open', slaDueAt: due('2026-11-30T00:00:00Z'), now }),
    ).toBe('due_soon');
    expect(
      slaStatus({ status: 'open', slaDueAt: due('2027-01-30T00:00:00Z'), now }),
    ).toBe('due_later');
    expect(slaStatus({ status: 'open', slaDueAt: null, now })).toBe('no_sla');
    expect(
      slaStatus({
        status: 'resolved',
        slaDueAt: due('2026-11-19T00:00:00Z'),
        now,
      }),
    ).toBe('closed');
  });
});
