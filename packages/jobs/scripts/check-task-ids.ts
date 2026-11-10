/**
 * Fails when a task id is defined by more than one worker. All workers share the
 * pg-boss tables, so a duplicate id would let either worker run the other's jobs.
 *   bun run --cwd packages/jobs check-ids
 */
import { resolve } from 'node:path';
import { findDuplicateTaskIds } from '../src/worker/load';

const WORKERS = { api: '../../../apps/api', app: '../../../apps/app' };

async function manifest(cwd: string): Promise<string[]> {
  const proc = Bun.spawn([process.execPath, 'src/worker.ts'], {
    cwd: resolve(import.meta.dir, cwd),
    env: { ...process.env, JOBS_DRY_RUN: '1', SKIP_ENV_VALIDATION: '1' },
    stdout: 'pipe',
    stderr: 'inherit',
  });
  const output = await new Response(proc.stdout).text();
  if ((await proc.exited) !== 0) throw new Error(`dry run failed in ${cwd}`);
  const start = output.indexOf('{\n  "worker"');
  const parsed: { tasks: Array<{ id: string }> } = JSON.parse(output.slice(start));
  return parsed.tasks.map((task) => task.id);
}

const manifests: Record<string, string[]> = {};
for (const [name, cwd] of Object.entries(WORKERS)) manifests[name] = await manifest(cwd);
const duplicates = findDuplicateTaskIds(manifests);
if (Object.keys(duplicates).length > 0) {
  console.error('Duplicate task ids across workers:', duplicates);
  process.exit(1);
}
console.log('Task ids are unique:', Object.fromEntries(Object.entries(manifests).map(([k, v]) => [k, v.length])));
