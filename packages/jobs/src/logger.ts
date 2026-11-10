import { currentRun } from './context';

type Level = 'debug' | 'log' | 'info' | 'warn' | 'error';

function write(level: Level, message: string, attributes?: Record<string, unknown>) {
  const run = currentRun();
  const prefix = run ? `[${run.taskId} ${run.runId}]` : '[jobs]';
  const args: unknown[] = [`${prefix} ${message}`];
  if (attributes !== undefined) args.push(attributes);
  console[level](...args);
}

/** trigger.dev-compatible logger: prefixes every line with the current task id and run id. */
export const logger = {
  debug: (message: string, attributes?: Record<string, unknown>) => write('debug', message, attributes),
  log: (message: string, attributes?: Record<string, unknown>) => write('log', message, attributes),
  info: (message: string, attributes?: Record<string, unknown>) => write('info', message, attributes),
  warn: (message: string, attributes?: Record<string, unknown>) => write('warn', message, attributes),
  error: (message: string, attributes?: Record<string, unknown>) => write('error', message, attributes),
};
