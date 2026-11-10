import { metadata, schedules, tags, task, tasks } from '../../index';

export const itChild = task({
  id: 'it-child',
  run: async (payload: { i: number }) => {
    metadata.parent.increment('done', 1);
    metadata.parent.set(`child_${payload.i}`, 'ok');
    return payload.i * 2;
  },
});

export const itParent = task({
  id: 'it-parent',
  run: async (payload: { organizationId: string }) => {
    metadata.set('phase', 'fanout');
    const batch = await itChild.batchTriggerAndWait([1, 2, 3].map((i) => ({ payload: { i } })));
    const single = await tasks.triggerAndWait<typeof itChild>('it-child', { i: 10 });
    await tags.add('fanned-out');
    metadata.set('phase', 'done');
    const sum = batch.runs.reduce((acc, run) => acc + (run.ok ? run.output : 0), 0);
    return { organizationId: payload.organizationId, sum: sum + (single.ok ? single.output : 0) };
  },
});

export const itFlaky = task({
  id: 'it-flaky',
  retry: { maxAttempts: 2, minTimeoutInMs: 1000 },
  run: async (_payload: { organizationId: string }, { ctx }) => {
    if (ctx.attempt.number === 1) throw new Error('first attempt fails');
    return { attempt: ctx.attempt.number };
  },
});

export const itSlow = task({
  id: 'it-slow',
  maxDuration: 1,
  run: () => new Promise<never>(() => {}),
});

export const itCron = schedules.task({ id: 'it-cron', cron: '0 5 * * *', run: async () => 'tick' });
