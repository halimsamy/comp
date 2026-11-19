import {
  matchMember,
  matchVendor,
  nameFromSystemType,
  rowsFromCsv,
  rowsFromInventoryForm,
  toAssetDraft,
} from './asset-inventory-import';

jest.mock('@db', () => ({}));

const members = [
  { id: 'mem_halim', name: 'Abdelhalim Samy', email: 'halim@spare.com' },
  { id: 'mem_ali', name: 'Ali', email: 'ali@spare.com' },
];
const vendors = [
  { id: 'vnd_aws', name: 'Amazon Web Services' },
  { id: 'vnd_vercel', name: 'Vercel' },
  { id: 'vnd_atl', name: 'Atlassian' },
  { id: 'vnd_mpgs', name: 'Mastercard Payment Gateway Services (MPGS)' },
];
const form = {
  submissionDate: '2026-11-11',
  inventoryRows: [
    {
      assetId: '004',
      location: 'AWS eu-central-1 (Frankfurt), private subnets',
      systemType:
        'ECS Fargate cluster spare-prod-cluster (Container Insights, ECS Exec logging)',
      environment: 'Production',
      lastReviewed: '2026-11-11',
      assignedOwner: 'Engineering - Abdelhalim Samy',
    },
    {
      assetId: '022',
      location: 'AWS eu-central-1 (Frankfurt)',
      systemType: 'AWS Secrets Manager: application and database secrets',
      environment: 'Production',
      lastReviewed: '2026-11-11',
      assignedOwner: 'Engineering',
    },
    {
      assetId: '032',
      location: 'Atlassian (SaaS)',
      systemType:
        'Bitbucket Cloud: source code repositories and Pipelines CI/CD',
      environment: 'Staging',
      lastReviewed: 'not a date',
      assignedOwner: 'halim@spare.com',
    },
    { assetId: '', systemType: 'broken row' },
  ],
};

describe('Infrastructure Inventory import mapping', () => {
  const drafts = rowsFromInventoryForm(form).map((row) =>
    toAssetDraft({ row, members, vendors }),
  );

  it('maps every valid row with a stable key and skips malformed ones', () => {
    expect(drafts.map((d) => d.externalId)).toEqual([
      'infra-form:004',
      'infra-form:022',
      'infra-form:032',
    ]);
  });

  it('derives name, description, type, environment, location and review date', () => {
    expect(drafts[0]).toMatchObject({
      name: 'ECS Fargate cluster spare-prod-cluster',
      description: form.inventoryRows[0].systemType,
      type: 'container',
      environment: 'production',
      location: 'AWS eu-central-1 (Frankfurt), private subnets',
      lastReviewedAt: new Date('2026-11-11T00:00:00Z'),
    });
    expect(drafts[1]).toMatchObject({
      name: 'AWS Secrets Manager',
      type: 'key_secret',
    });
    expect(drafts[2]).toMatchObject({
      name: 'Bitbucket Cloud',
      type: 'repository',
      environment: 'staging',
      lastReviewedAt: null,
    });
  });

  it('matches the owner by name or email, else leaves it empty', () => {
    expect(drafts.map((d) => d.ownerId)).toEqual([
      'mem_halim',
      null,
      'mem_halim',
    ]);
  });

  it('matches vendors by name, bracketed name or acronym', () => {
    expect(drafts.map((d) => d.vendorId)).toEqual([
      'vnd_aws',
      'vnd_aws',
      'vnd_atl',
    ]);
    expect(matchVendor(['Hosted by MPGS'], vendors)).toBe('vnd_mpgs');
    expect(
      matchVendor(['aws lowercase is not the acronym'], vendors),
    ).toBeNull();
  });

  it('cuts the name at the first colon or bracket', () => {
    expect(nameFromSystemType('Vercel: hosting (web)')).toBe('Vercel');
    expect(nameFromSystemType('IAM (per-person users)')).toBe('IAM');
  });

  it('prefers the longest member name match', () => {
    expect(
      matchMember('Owner: Ali Hassan', [
        { id: 'a', name: 'Ali', email: 'a@x' },
        { id: 'b', name: 'Ali Hassan', email: 'b@x' },
      ]),
    ).toBe('b');
  });
});

describe('asset CSV rows', () => {
  it('reads aliased columns and requires a name column', () => {
    const [row] = rowsFromCsv(
      'Asset Name,Type,Env,Region,Owner Email,Provider,EOL\nEdge firewall,network,prod,Office,ali@spare.com,Vercel,2027-01-31',
    );
    expect(toAssetDraft({ row, members, vendors })).toMatchObject({
      externalId: 'csv:edge firewall',
      name: 'Edge firewall',
      type: 'network',
      environment: 'production',
      location: 'Office',
      ownerId: 'mem_ali',
      vendorId: 'vnd_vercel',
      endOfSupportAt: new Date('2027-01-31T00:00:00Z'),
    });
    expect(() => rowsFromCsv('type\nnetwork')).toThrow('name column');
  });
});
