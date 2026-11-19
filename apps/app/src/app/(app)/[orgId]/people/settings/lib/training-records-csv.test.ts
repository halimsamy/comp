import { describe, expect, it } from 'vitest';
import { buildTrainingRecordsCsv, parseTrainingImportCsv } from './training-records-csv';

describe('training records CSV (#94)', () => {
  it('parses email, training and completed columns and reports bad rows', () => {
    const { rows, errors } = parseTrainingImportCsv(
      'Email,Training,Completed\njane@acme.com,Security awareness,2026-03-01\nbob@acme.com,,2026-03-01\n',
    );
    expect(rows).toEqual([{ email: 'jane@acme.com', module: 'Security awareness', completedAt: '2026-03-01' }]);
    expect(errors).toEqual(['Row 3: needs an email, a training and a valid date']);
  });

  it('rejects a file without the required columns', () => {
    expect(parseTrainingImportCsv('Name,Date\nJane,2026-01-01').errors).toHaveLength(1);
  });

  it('exports one row per completion', () => {
    const csv = buildTrainingRecordsCsv([
      {
        memberId: 'mem_1',
        name: 'Jane',
        email: 'jane@acme.com',
        training: 'HIPAA training',
        completedAt: '2026-03-01T00:00:00.000Z',
        expiresAt: '2027-03-01T00:00:00.000Z',
        source: 'import',
        hasAttachment: true,
      },
    ]);
    expect(csv.split('\r\n')[1]).toBe('"Jane","jane@acme.com","HIPAA training","2026-03-01","2027-03-01","import","yes"');
  });
});
