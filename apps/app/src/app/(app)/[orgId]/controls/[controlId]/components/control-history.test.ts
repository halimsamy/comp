import type { AuditLogWithRelations } from '@/hooks/use-audit-logs';
import { describe, expect, it } from 'vitest';
import { mergeControlHistory } from './control-history';

const log = (id: string, timestamp: string, path: string) =>
  ({ id, timestamp: new Date(timestamp), data: { path } }) as unknown as AuditLogWithRelations;

describe('mergeControlHistory', () => {
  it('adds applicability changes of mapped requirements only, newest first', () => {
    const merged = mergeControlHistory({
      controlLogs: [log('a1', '2026-11-01', '/v1/controls/ctl_1/owner')],
      frameworkLogs: [
        log('f1', '2026-11-03', '/v1/frameworks/fi_1/requirements/req_1/applicability'),
        log('f2', '2026-11-04', '/v1/frameworks/fi_1/requirements/req_other/applicability'),
      ],
      requirementKeys: ['req_1'],
    });
    expect(merged.map((l) => l.id)).toEqual(['f1', 'a1']);
  });
});
