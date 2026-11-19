import { describe, expect, it } from 'vitest';
import { parseNonconformityCsv } from './nonconformity-csv';

const members = [{ id: 'mem_1', name: 'Dana Owner' }];

describe('parseNonconformityCsv (#171)', () => {
  it('maps source labels, owners and statuses', () => {
    const text =
      'Nonconformity,Source,Reference,Owner,Due,Status\n' +
      'Access review skipped,Security incident,INC-4,Dana Owner,2026-12-01,In progress\n' +
      'Backup not tested,Spreadsheet,,,,';
    expect(parseNonconformityCsv({ text, members })).toEqual({
      errors: [],
      rows: [
        {
          source: 'incident',
          description: 'Access review skipped',
          sourceRef: 'INC-4',
          rootCause: null,
          correctiveAction: null,
          ownerMemberId: 'mem_1',
          dueDate: '2026-12-01',
          status: 'in_progress',
        },
        expect.objectContaining({ source: 'other', description: 'Backup not tested', status: 'open' }),
      ],
    });
  });

  it('never imports an external audit source by hand', () => {
    const { rows } = parseNonconformityCsv({ text: 'Description,Source\nX,external_audit', members });
    expect(rows[0].source).toBe('other');
  });

  it('reports rows it cannot map', () => {
    const text = 'Description,Owner,Status\n,Dana Owner,\nY,Nobody,\nZ,,done';
    expect(parseNonconformityCsv({ text, members }).errors).toEqual([
      'Row 2: the nonconformity is empty',
      'Row 3: no member "Nobody"',
      'Row 4: unknown status "done" (use open, in progress or closed)',
    ]);
  });
});
