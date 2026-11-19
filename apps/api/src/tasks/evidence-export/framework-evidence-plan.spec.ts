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
          control: {
            id: 'ctl_a',
            controlTemplateId: 'frk_ct_683f484fc7b5506ab97c26af',
            name: 'A',
            policyIds: ['p1'],
            taskIds: ['t1'],
            formTypes: [],
          },
        },
        {
          requirementId: null,
          customRequirementId: 'creq_1',
          control: {
            id: 'ctl_b',
            controlTemplateId: 'frk_ct_683f48ee9534e1e0a088e922',
            name: 'B',
            policyIds: ['p1'],
            taskIds: ['t2'],
            formTypes: [],
          },
        },
      ],
    });

    expect(folder).toMatchObject({
      folder: 'C-1 Custom',
      controlNames: ['A', 'B'],
      policyIds: ['p1'],
      taskIds: ['t1', 't2'],
      controlIds: ['ctl_a', 'ctl_b'],
    });
    // Risk Management + Supplier Security templates, deduped.
    expect(folder.registers).toEqual(['risks', 'risk-acceptances', 'vendors']);
  });

  it('keeps folder names unique', () => {
    const folders = planRequirementFolders({
      requirements: [requirement('a', '', 'Access'), requirement('b', '', 'access')],
      mappings: [],
    });

    expect(folders.map((f) => f.folder)).toEqual(['Access', 'access (2)']);
  });

  it('does not repeat an identifier the name already starts with', () => {
    const folders = planRequirementFolders({
      requirements: [
        requirement('a', '6.1.3', '6.1.3 Planning'),
        requirement('b', '1.1.1', 'Processes are defined'),
      ],
      mappings: [],
    });

    expect(folders.map((f) => f.folder)).toEqual(['6.1.3 Planning', '1.1.1 Processes are defined']);
  });

  it('adds the per-requirement registers for ISO 27001 and PCI DSS, not for other frameworks', () => {
    const plan = (frameworkName: string, identifier: string) =>
      planRequirementFolders({
        requirements: [requirement('r1', identifier, 'Requirement')],
        mappings: [],
        frameworkName,
      })[0].registers;

    expect(plan('PCI DSS Level 1', '7.2.4')).toEqual(['access-reviews', 'privileged-users']);
    expect(plan('ISO 27001', 'A.8.2')).toEqual(['access-reviews', 'privileged-users', 'access-roles']);
    expect(plan('ISO 27001', '7.2')).toEqual(['training-records']);
    // ISO clause 7.2 is not PCI section 7.2.
    expect(plan('PCI DSS Level 1', '7.2')).toEqual([]);
    expect(plan('SOC 2', 'A.8.2')).toEqual([]);
  });
});
