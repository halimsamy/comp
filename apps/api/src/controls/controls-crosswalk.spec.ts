import { buildCrosswalkCsv, type CrosswalkControl } from './controls-crosswalk';

const evidence = (completed: number, total: number) => ({ completed, total });

const accessRights: CrosswalkControl = {
  name: 'Access Rights',
  description: 'Access is granted on least privilege',
  owner: { name: 'Dana', deactivated: true },
  status: 'in_progress',
  frameworks: [
    {
      frameworkInstanceId: 'fi_iso',
      frameworkName: 'ISO 27001',
      requirements: [
        { identifier: 'A.5.15', name: 'Access control' },
        { identifier: 'A.5.18', name: 'Access rights' },
      ],
    },
    {
      frameworkInstanceId: 'fi_pci',
      frameworkName: 'PCI DSS',
      requirements: [{ identifier: '7.2.1', name: 'Access control model' }],
    },
  ],
  evidence: {
    policies: evidence(1, 1),
    tasks: evidence(1, 2),
    forms: evidence(0, 0),
    ismsDocuments: evidence(0, 0),
  },
};

const isoOnly: CrosswalkControl = {
  ...accessRights,
  name: 'Context of the organization',
  owner: null,
  status: 'no_evidence',
  frameworks: [accessRights.frameworks[0]],
};

describe('buildCrosswalkCsv', () => {
  it('puts each framework in its own column, codes side by side', () => {
    // Every cell is quoted; none of these values contain a quote.
    const cells = (line: string) => line.slice(1, -1).split('","');
    const [header, row, second] = buildCrosswalkCsv([accessRights, isoOnly]).split('\n').map(cells);

    expect(header).toEqual([
      'Control',
      'Description',
      'Owner',
      'Status',
      'ISO 27001 requirements',
      'PCI DSS requirements',
      'Policies published',
      'Tasks done',
      'Evidence forms current',
      'ISMS documents approved',
    ]);
    expect(row).toEqual([
      'Access Rights',
      'Access is granted on least privilege',
      'Dana (left, needs reassignment)',
      'In progress',
      'A.5.15; A.5.18',
      '7.2.1',
      '1/1',
      '1/2',
      '',
      '',
    ]);
    expect(second.slice(2, 6)).toEqual(['', 'No evidence linked', 'A.5.15; A.5.18', '']);
  });

  it('returns only the header when there are no controls', () => {
    expect(buildCrosswalkCsv([]).split('\n')).toHaveLength(1);
  });
});
