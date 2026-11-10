import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getTaskDefinition, type TaskDefinition } from '../task';

const SKIP_FILE = /\.(spec|test)\.tsx?$|\.d\.ts$/;
const SKIP_DIR = new Set(['node_modules', '__tests__', '__mocks__']);

export async function listTaskModules(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return SKIP_DIR.has(entry.name) ? [] : listTaskModules(path);
      return /\.tsx?$/.test(entry.name) && !SKIP_FILE.test(entry.name) ? [path] : [];
    }),
  );
  return nested.flat().sort();
}

export interface LoadedTask {
  definition: TaskDefinition;
  file: string;
}

/** Imports every non-test module under `dirs` and collects exported task handles. */
export async function loadTasks(params: { dirs: string[] }): Promise<LoadedTask[]> {
  const byId = new Map<string, LoadedTask>();
  for (const dir of params.dirs) {
    for (const file of await listTaskModules(resolve(dir))) {
      const mod: Record<string, unknown> = await import(pathToFileURL(file).href);
      for (const value of Object.values(mod)) {
        const definition = getTaskDefinition(value);
        if (!definition) continue;
        const existing = byId.get(definition.id);
        // Re-exports of the same handle are fine; two handles with one id would share a queue.
        if (existing && existing.definition !== definition) {
          throw new Error(
            `Duplicate task id "${definition.id}" in ${existing.file} and ${file}. Task ids must be unique across ALL workers.`,
          );
        }
        byId.set(definition.id, { definition, file });
      }
    }
  }
  return [...byId.values()];
}

/** Ids present in more than one worker manifest (api + app share the pg-boss tables). */
export function findDuplicateTaskIds(manifests: Record<string, string[]>): Record<string, string[]> {
  const owners = new Map<string, string[]>();
  for (const [worker, ids] of Object.entries(manifests)) {
    for (const id of new Set(ids)) owners.set(id, [...(owners.get(id) ?? []), worker]);
  }
  return Object.fromEntries([...owners].filter(([, workers]) => workers.length > 1));
}
