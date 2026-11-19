import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { IsmsMetric } from '../isms-types';
import { ismsDesignSystemMock, ismsIconsMock, ismsSharedMock } from './__test-helpers__/dsMocks';

vi.mock('@trycompai/design-system', () => ismsDesignSystemMock());
vi.mock('@trycompai/design-system/icons', () => ismsIconsMock());
vi.mock('./shared', () => ismsSharedMock());

import { MonitoringRow } from './MonitoringRow';

const metric: IsmsMetric = {
  id: 'met_1',
  metricKey: 'training_completion',
  name: 'Training completion',
  whatIsMeasured: 'Share of staff with completed training.',
  method: 'Computed by Comp AI.',
  cadence: 'quarterly',
  monitorMemberId: null,
  analyzeMemberId: null,
  target: '95% completion or above',
  objectiveId: 'obj_1',
  objective: {
    id: 'obj_1',
    objective: 'Achieve high security-awareness training completion',
    target: 'Training completion ≥ 95%',
  },
  dataSource: 'computed',
  isActive: true,
  source: 'derived',
  derivedFrom: 'seed:training_completion',
  position: 0,
  createdAt: new Date().toISOString(),
  measurements: [],
};

const handlers = {
  onUpdateMetric: vi.fn(),
  onDeleteMetric: vi.fn(),
  onRecordMeasurement: vi.fn(),
  onBulkSaveMeasurements: vi.fn(),
  onDeleteMeasurement: vi.fn(),
};

describe('MonitoringRow target linked to a 6.2 objective', () => {
  it('shows the objective target instead of the metric target', () => {
    render(
      <MonitoringRow metric={metric} canEdit={false} memberOptions={[]} memberNames={{}} {...handlers} />,
    );
    expect(
      screen.getByText('Training completion ≥ 95% (from the 6.2 objective)'),
    ).toBeInTheDocument();
    expect(screen.queryByText('95% completion or above')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Edit /)).not.toBeInTheDocument();
  });

  it('keeps the target read-only while an editor edits the metric', () => {
    render(<MonitoringRow metric={metric} canEdit memberOptions={[]} memberNames={{}} {...handlers} />);
    fireEvent.click(screen.getByLabelText('Edit Training completion'));
    expect(screen.queryByLabelText('Metric target')).not.toBeInTheDocument();
    expect(
      screen.getByText('Training completion ≥ 95% (from the 6.2 objective)'),
    ).toBeInTheDocument();
  });

  it('lets an editor set the metric target when no objective is linked', () => {
    render(
      <MonitoringRow
        metric={{ ...metric, objectiveId: null, objective: null }}
        canEdit
        memberOptions={[]}
        memberNames={{}}
        {...handlers}
      />,
    );
    fireEvent.click(screen.getByLabelText('Edit Training completion'));
    expect(screen.getByLabelText('Metric target')).toHaveValue('95% completion or above');
  });
});
