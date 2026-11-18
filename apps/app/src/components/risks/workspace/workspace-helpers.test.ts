import { describe, expect, it } from 'vitest';
import type { RiskTreatmentAction } from '@/hooks/use-risk-workspace';
import { isAcceptanceRequired } from '@/hooks/use-risk-workspace';
import { countActions, filterActions } from './action-filters';
import { buildHeatmapCounts, formatHeatmapCell, parseHeatmapCell, riskInCell } from './heatmap-cells';
import { registerGroup, sortByGroup } from './register-grouping';
import { buildRiskActionsCsv } from './risk-actions-csv';
import { daysUntil } from './workspace-types';

const action = (overrides: Partial<RiskTreatmentAction>): RiskTreatmentAction => ({
  id: 'tski_1',
  title: 'Enable MFA',
  description: null,
  status: 'todo',
  priority: 'medium',
  dueDate: '2026-01-10T00:00:00.000Z',
  completedAt: null,
  entityId: 'rsk_1',
  createdAt: '2026-01-01T00:00:00.000Z',
  isOverdue: false,
  risk: { id: 'rsk_1', title: 'Account takeover', status: 'open' },
  assignee: { id: 'mem_1', user: { id: 'usr_1', name: 'Jane', email: 'j@x.com', image: null } },
  ...overrides,
});

describe('action filters', () => {
  const actions = [
    action({ id: 'a', isOverdue: true }),
    action({ id: 'b', status: 'done', completedAt: '2026-01-05T00:00:00.000Z' }),
    action({ id: 'c', status: 'canceled', assignee: null }),
    action({ id: 'd', status: 'in_progress', assignee: null }),
  ];

  it('counts open, overdue, completed and all', () => {
    expect(countActions(actions)).toEqual({ open: 2, overdue: 1, done: 1, all: 4 });
  });

  it('filters by status and owner', () => {
    expect(filterActions({ actions, filter: 'open', ownerId: 'all' }).map((a) => a.id)).toEqual(['a', 'd']);
    expect(filterActions({ actions, filter: 'all', ownerId: 'none' }).map((a) => a.id)).toEqual(['c', 'd']);
    expect(filterActions({ actions, filter: 'all', ownerId: 'mem_1' }).map((a) => a.id)).toEqual(['a', 'b']);
  });
});

describe('buildRiskActionsCsv', () => {
  it('writes one row per action and neutralises formulas', () => {
    const csv = buildRiskActionsCsv([action({ title: '=HYPERLINK("x")', isOverdue: true })]);
    const [header, row] = csv.split('\r\n');
    expect(header).toBe('"Action","Risk","Owner","Due date","Status","Completed on","Overdue"');
    expect(row).toBe('"\'=HYPERLINK(""x"")","Account takeover","Jane","2026-01-10","To do","","Yes"');
  });
});

describe('heatmap cells', () => {
  const risk = {
    likelihood: 'likely',
    impact: 'severe',
    residualLikelihood: 'unlikely',
    residualImpact: 'minor',
  } as const;

  it('counts risks per inherent and residual cell', () => {
    expect(buildHeatmapCounts({ risks: [risk, risk], kind: 'inherent' })[3][4]).toBe(2);
    expect(buildHeatmapCounts({ risks: [risk], kind: 'residual' })[1][1]).toBe(1);
  });

  it('round-trips the URL cell and matches risks in it', () => {
    const cell = parseHeatmapCell(formatHeatmapCell({ kind: 'residual', likelihood: 2, impact: 2 }));
    expect(cell).toEqual({ kind: 'residual', likelihood: 2, impact: 2 });
    expect(cell && riskInCell({ risk, cell })).toBe(true);
    expect(parseHeatmapCell('inherent:9:1')).toBeNull();
  });
});

describe('register grouping', () => {
  const risks = [
    { id: '1', category: 'technology', assignee: null },
    { id: '2', category: 'fraud', assignee: { user: { name: 'Zed', email: 'z@x.com' } } },
    { id: '3', category: 'technology', assignee: { user: { name: 'Amy', email: 'a@x.com' } } },
  ];

  it('groups by owner with unassigned last', () => {
    const sorted = sortByGroup({ risks, groupBy: 'owner', severityOf: () => 'low' });
    expect(sorted.map((risk) => risk.id)).toEqual(['3', '2', '1']);
    expect(registerGroup({ risk: risks[0], groupBy: 'owner', severity: 'low' }).label).toBe('Unassigned');
  });

  it('groups by category label', () => {
    expect(registerGroup({ risk: risks[1], groupBy: 'category', severity: 'low' }).label).toBe('Fraud');
  });
});

describe('isAcceptanceRequired', () => {
  it('requires acceptance from the threshold up', () => {
    expect(isAcceptanceRequired({ level: 'medium', threshold: 'medium' })).toBe(true);
    expect(isAcceptanceRequired({ level: 'low', threshold: 'medium' })).toBe(false);
  });
});

describe('daysUntil', () => {
  it('counts whole calendar days', () => {
    const now = new Date(2026, 10, 18, 23, 0);
    expect(daysUntil({ value: new Date(2026, 10, 20, 1, 0).toISOString(), now })).toBe(2);
    expect(daysUntil({ value: new Date(2026, 10, 17).toISOString(), now })).toBe(-1);
  });
});
