import { describe, expect, it } from 'vitest';
import { parseRequestCsv } from './request-csv';

const requirements = [{ id: 'req_1', identifier: 'A.5.15' }];
const members = [{ id: 'mem_1', name: 'Dana Owner', email: 'dana@spare.com' }];

describe('parseRequestCsv (#109)', () => {
  it('maps requirement identifiers and owners to ids', () => {
    const text = 'Request,Requirement,Owner,Due\n"Access review, Q2",A.5.15,dana@spare.com,2026-12-01\nPopulation of leavers,,Dana Owner,';
    expect(parseRequestCsv({ text, requirements, members })).toEqual({
      rows: [
        { title: 'Access review, Q2', requirementId: 'req_1', ownerMemberId: 'mem_1', dueDate: '2026-12-01' },
        { title: 'Population of leavers', ownerMemberId: 'mem_1' },
      ],
      errors: [],
    });
  });

  it('reports rows it cannot map instead of dropping them silently', () => {
    const text = 'Title,Requirement,Owner,Due\nA,9.9,,\nB,,nobody@x.com,\nC,,,01/12/2026';
    const { rows, errors } = parseRequestCsv({ text, requirements, members });
    expect(rows).toEqual([]);
    expect(errors).toEqual([
      'Row 2: no requirement "9.9" in this audit',
      'Row 3: no member "nobody@x.com"',
      'Row 4: due date must be YYYY-MM-DD',
    ]);
  });

  it('needs a request column', () => {
    expect(parseRequestCsv({ text: 'Owner\nx', requirements, members }).errors).toEqual([
      'The file needs a Request (or Title) column',
    ]);
  });
});
