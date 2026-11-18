import type { FrameworkScores } from '@/lib/control-compliance';
import type { FrameworkEditorRequirement } from '@db';
import { describe, expect, it } from 'vitest';
import { buildRequirementItems, getStatusBadge } from './framework-controls-shared';

const makeRequirement = (overrides: Partial<FrameworkEditorRequirement>) =>
  ({
    id: 'req_1',
    frameworkId: 'fw_1',
    name: 'Requirement 1',
    identifier: 'R-1',
    description: 'desc',
    ...overrides,
  }) as FrameworkEditorRequirement;


describe('buildRequirementItems', () => {
  const counts = {
    policies: { total: 2, completed: 1 },
    tasks: { total: 0, completed: 0 },
    documents: { total: 0, completed: 0 },
    ismsDocuments: { total: 0, completed: 0 },
  };

  it('fills each row from the API requirement score', () => {
    const [item] = buildRequirementItems([makeRequirement({ id: 'r1' })], {
      requirements: {
        r1: {
          status: 'in_progress',
          percent: 50,
          applicability: 'compensating_control',
          controlsTotal: 2,
          controlsComplete: 1,
          counts,
        },
      },
    } as unknown as FrameworkScores);
    expect(item).toMatchObject({
      status: 'in_progress',
      applicability: 'compensating_control',
      compliancePercent: 50,
      mappedControlsCount: 2,
      satisfiedControlsCount: 1,
      artifactCounts: counts,
    });
  });

  it('shows no controls when the API has no score for the requirement', () => {
    const [item] = buildRequirementItems([makeRequirement({ id: 'r2' })], undefined);
    expect(item).toMatchObject({ status: 'no_controls', mappedControlsCount: 0 });
  });

  it('labels not applicable controls', () => {
    expect(getStatusBadge('not_applicable')).toEqual({ label: 'Not Applicable', variant: 'outline' });
  });
});
