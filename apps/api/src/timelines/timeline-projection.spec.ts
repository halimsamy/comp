import { findAuditPhaseIndex, projectPhases } from './timeline-projection';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const phase = (
  orderIndex: number,
  name: string,
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED',
  start: string,
  end: string,
  extra: Partial<{ completionType: string; durationWeeks: number; datesPinned: boolean }> = {},
) => ({
  orderIndex,
  name,
  status,
  completionType: extra.completionType ?? 'MANUAL',
  durationWeeks: extra.durationWeeks ?? 2,
  datesPinned: extra.datesPinned ?? false,
  startDate: d(start),
  endDate: d(end),
});

const iso = [
  phase(0, 'Evidence Gathering', 'IN_PROGRESS', '2026-05-12', '2026-07-07', { completionType: 'AUTO_TASKS' }),
  phase(1, 'Stage 1 & 2 Audit', 'PENDING', '2026-07-07', '2026-08-11', { durationWeeks: 5 }),
  phase(2, 'Certification', 'PENDING', '2026-08-11', '2026-08-18', {
    completionType: 'AUTO_UPLOAD',
    durationWeeks: 1,
  }),
];

describe('projectPhases', () => {
  it('flags an overdue active phase and moves later estimates out from today', () => {
    const [active, audit, cert] = projectPhases({ phases: iso, now: d('2026-11-18') });
    expect(active.isOverdue).toBe(true);
    expect(audit.startDate).toEqual(d('2026-11-18'));
    expect(audit.endDate).toEqual(d('2026-12-23'));
    expect(cert.startDate).toEqual(d('2026-12-23'));
    expect(cert.isOverdue).toBe(false);
  });

  it('keeps dates when nothing is overdue', () => {
    const projected = projectPhases({ phases: iso, now: d('2026-06-01') });
    expect(projected.map((p) => p.isOverdue)).toEqual([false, false, false]);
    expect(projected[1].startDate).toEqual(d('2026-07-07'));
  });

  it('pins the audit phase to the audit engagement period', () => {
    const [, audit, cert] = projectPhases({
      phases: iso,
      now: d('2026-11-18'),
      audit: { periodStart: d('2027-02-01'), periodEnd: d('2027-02-20') },
    });
    expect(audit.startDate).toEqual(d('2027-02-01'));
    expect(audit.endDate).toEqual(d('2027-02-20'));
    expect(cert.startDate).toEqual(d('2027-02-20'));
  });

  it('never moves a pinned phase', () => {
    const phases = [iso[0], { ...iso[1], datesPinned: true }, iso[2]];
    const [, audit] = projectPhases({ phases, now: d('2026-11-18') });
    expect(audit.startDate).toEqual(d('2026-07-07'));
  });
});

describe('findAuditPhaseIndex', () => {
  it('finds the audit by name, else the phase before the final upload', () => {
    expect(findAuditPhaseIndex(iso)).toBe(1);
    expect(
      findAuditPhaseIndex([
        { name: 'Scoping', completionType: 'MANUAL' },
        { name: 'Internal Review', completionType: 'MANUAL' },
        { name: 'Final Report', completionType: 'AUTO_UPLOAD' },
      ]),
    ).toBe(1);
    expect(findAuditPhaseIndex([{ name: 'Scoping', completionType: 'MANUAL' }])).toBe(-1);
  });
});
