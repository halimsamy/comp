import { describe, expect, it } from 'vitest';
import {
  EMPTY_COUNTS,
  documentCounts,
  getControlScore,
  getRequirementScore,
  getRequirementStatusBadge,
  type FrameworkScores,
} from './control-compliance';

const scores: Pick<FrameworkScores, 'controls' | 'requirements'> = {
  controls: {
    c1: {
      status: 'completed',
      percent: 100,
      counts: { ...EMPTY_COUNTS, policies: { total: 1, completed: 1 } },
    },
  },
  requirements: {
    r1: {
      status: 'not_applicable',
      percent: 0,
      applicability: 'not_applicable',
      controlsTotal: 1,
      controlsComplete: 0,
      counts: EMPTY_COUNTS,
    },
  },
};

describe('control-compliance readers', () => {
  it('reads control and requirement scores computed by the API', () => {
    expect(getControlScore(scores, 'c1').status).toBe('completed');
    expect(getRequirementScore(scores, 'r1').applicability).toBe('not_applicable');
  });

  it('falls back to empty scores for unknown ids or missing data', () => {
    expect(getControlScore(undefined, 'x')).toMatchObject({ status: 'not_started', percent: 0 });
    expect(getRequirementScore(scores, 'x')).toMatchObject({
      status: 'no_controls',
      applicability: 'applicable',
    });
  });

  it('labels requirement statuses, including not applicable', () => {
    expect(getRequirementStatusBadge('satisfied')).toEqual({ label: 'Satisfied', variant: 'default' });
    expect(getRequirementStatusBadge('not_applicable')).toEqual({
      label: 'Not Applicable',
      variant: 'outline',
    });
  });

  it('adds ISMS documents to evidence form documents', () => {
    expect(
      documentCounts({
        ...EMPTY_COUNTS,
        documents: { total: 2, completed: 1 },
        ismsDocuments: { total: 1, completed: 1 },
      }),
    ).toEqual({ total: 3, completed: 2 });
  });
});
