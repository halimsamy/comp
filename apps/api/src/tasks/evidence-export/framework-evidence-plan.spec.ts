import { planRequirementFolders, safeSegment } from './framework-evidence-plan';

const requirement = (id: string, identifier: string, name: string) => ({
  id,
  identifier,
  name,
  description: '',
  frameworkId: null,
  customFrameworkId: null,
  kind: 'custom' as const,
});

describe('safeSegment', () => {
  it('removes path and reserved characters and trailing dots', () => {
    expect(safeSegment('A/B: "C"? <d>|e.')).toBe('A-B- -C- -d-e');
  });

  it('falls back when nothing is left', () => {
    expect(safeSegment('///')).toBe('-');
    expect(safeSegment('   ')).toBe('untitled');
  });

  it('caps the length', () => {
    expect(safeSegment('x'.repeat(200))).toHaveLength(80);
  });
});

describe('planRequirementFolders', () => {
  it('matches custom requirements and dedupes evidence across controls', () => {
    const [folder] = planRequirementFolders({
      requirements: [requirement('creq_1', 'C-1', 'Custom')],
      mappings: [
        {
          requirementId: null,
          customRequirementId: 'creq_1',
          control: { name: 'A', policyIds: ['p1'], taskIds: ['t1'], formTypes: [] },
        },
        {
          requirementId: null,
          customRequirementId: 'creq_1',
          control: { name: 'B', policyIds: ['p1'], taskIds: ['t2'], formTypes: [] },
        },
      ],
    });

    expect(folder).toMatchObject({
      folder: 'C-1 Custom',
      controlNames: ['A', 'B'],
      policyIds: ['p1'],
      taskIds: ['t1', 't2'],
    });
  });

  it('keeps folder names unique', () => {
    const folders = planRequirementFolders({
      requirements: [requirement('a', '', 'Access'), requirement('b', '', 'access')],
      mappings: [],
    });

    expect(folders.map((f) => f.folder)).toEqual(['Access', 'access (2)']);
  });
});
