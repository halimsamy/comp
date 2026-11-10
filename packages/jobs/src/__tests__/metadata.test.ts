import { beforeEach, describe, expect, it } from 'bun:test';
import { runWithContext, type ActiveRun } from '../context';
import { metadata } from '../metadata';
import { installFakeBoss } from './fake-boss';

let fake: ReturnType<typeof installFakeBoss>;
beforeEach(() => {
  fake = installFakeBoss();
});

const child = (): ActiveRun => ({
  runId: 'jrun_child', taskId: 'update-policy', parentRunId: 'jrun_parent', rootRunId: 'jrun_root',
  attempt: 1, tags: [], metadata: { existing: 1 },
});

describe('metadata', () => {
  it('updates the local copy synchronously and persists ops in order', async () => {
    const run = child();
    await runWithContext(run, async () => {
      metadata.set('phase', 'start').increment('done', 2).append('log', 'a').decrement('existing');
      metadata.del('phase');
      expect(metadata.get('done')).toBe(2);
      expect(metadata.current()).toEqual({ existing: 0, done: 2, log: ['a'] });
      await metadata.flush();
    });
    expect(fake.db.metadataOps.map((op) => [op.runId, op.key, op.value])).toEqual([
      ['jrun_child', 'phase', 'start'],
      ['jrun_child', 'done', 2],
      ['jrun_child', 'log', 'a'],
      ['jrun_child', 'existing', -1],
      ['jrun_child', 'phase', null],
    ]);
    expect(fake.db.metadataOps[1]!.sql).toContain('numeric');
    expect(fake.db.metadataOps[4]!.sql).toContain(`"metadata" - $2`);
  });

  it('writes parent/root ops to the parent and root runs', async () => {
    await runWithContext(child(), async () => {
      metadata.parent.set('policy_1_status', 'completed');
      metadata.parent.increment('policiesCompleted', 1);
      metadata.root.increment('total');
      await metadata.flush();
    });
    expect(fake.db.metadataOps.map((op) => op.runId)).toEqual(['jrun_parent', 'jrun_parent', 'jrun_root']);
  });

  it('treats a root run as its own parent and root', async () => {
    const root: ActiveRun = { ...child(), parentRunId: null, rootRunId: null, runId: 'jrun_top' };
    await runWithContext(root, async () => {
      metadata.root.set('x', 1);
      expect(metadata.get('x')).toBe(1);
      await metadata.flush();
    });
    expect(fake.db.metadataOps[0]!.runId).toBe('jrun_top');
  });

  it('is a no-op outside a run', async () => {
    metadata.set('x', 1);
    metadata.parent.increment('y');
    await metadata.flush();
    expect(metadata.get('x')).toBeUndefined();
    expect(metadata.current()).toBeUndefined();
    expect(fake.db.metadataOps).toEqual([]);
  });
});
