import { computeTrainingCycles, addMonths } from './training-cycles';

jest.mock('@trycompai/company', () => ({
  GENERAL_TRAINING_VIDEO_IDS: ['sat-1', 'sat-2'],
  HIPAA_TRAINING_ID: 'hipaa-sat-1',
}));

const d = (iso: string) => new Date(iso);

describe('computeTrainingCycles', () => {
  const now = d('2026-11-18T00:00:00Z');

  it('builds one general cycle per full set of videos, valid 12 months from the oldest video', () => {
    const cycles = computeTrainingCycles({
      now,
      moduleTitles: {},
      entries: [
        { moduleId: 'sat-1', completedAt: d('2024-01-01T00:00:00Z') },
        { moduleId: 'sat-2', completedAt: d('2024-01-05T00:00:00Z') },
        { moduleId: 'sat-1', completedAt: d('2026-02-01T00:00:00Z') },
        { moduleId: 'sat-2', completedAt: d('2026-02-02T00:00:00Z') },
        // duplicate of a current row also present in history
        { moduleId: 'sat-2', completedAt: d('2026-02-02T00:00:00Z') },
      ],
    });

    expect(cycles).toHaveLength(2);
    expect(cycles[0]).toMatchObject({
      moduleId: 'general',
      completedAt: d('2026-02-02T00:00:00Z'),
      expiresAt: addMonths({ date: d('2026-02-01T00:00:00Z'), months: 12 }),
      expired: false,
    });
    expect(cycles[1].expired).toBe(true);
  });

  it('ignores an incomplete general set', () => {
    const cycles = computeTrainingCycles({
      now,
      moduleTitles: {},
      entries: [{ moduleId: 'sat-1', completedAt: d('2026-01-01T00:00:00Z') }],
    });
    expect(cycles).toEqual([]);
  });

  it('keeps custom module expiry and drops unknown modules', () => {
    const cycles = computeTrainingCycles({
      now,
      moduleTitles: { trm_1: 'Secure coding' },
      entries: [
        {
          moduleId: 'trm_1',
          completedAt: d('2026-01-01T00:00:00Z'),
          expiresAt: d('2026-07-01T00:00:00Z'),
        },
        { moduleId: 'trm_gone', completedAt: d('2026-01-01T00:00:00Z') },
        { moduleId: 'hipaa-sat-1', completedAt: d('2026-03-01T00:00:00Z') },
      ],
    });
    expect(cycles.map((c) => c.title)).toEqual([
      'HIPAA Security Awareness Training',
      'Secure coding',
    ]);
    expect(cycles[1].expired).toBe(true);
  });
});
