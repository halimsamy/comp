/**
 * Universal logger that works in both NestJS and background job worker runtimes
 *
 * In job worker tasks, we use console.log with structured output
 * In NestJS services, we use the NestJS Logger
 *
 * This allows shared lib files to be imported by both job worker tasks and NestJS services
 */

type LogPayload = Record<string, unknown> | undefined;

const formatMessage = (message: string, payload?: LogPayload): string => {
  if (!payload) {
    return message;
  }
  try {
    return `${message} ${JSON.stringify(payload)}`;
  } catch {
    return message;
  }
};

/** True inside a background job worker (startWorker sets JOBS_WORKER=1). */
const isJobWorkerRuntime = (): boolean => process.env.JOBS_WORKER === '1';

/**
 * Create a logger that works in both environments
 * - In a job worker: uses console methods
 * - In NestJS: uses NestJS Logger
 */
const createLogger = () => {
  // Job worker: use console logging
  if (isJobWorkerRuntime()) {
    return {
      info: (message: string, payload?: LogPayload): void => {
        console.log(`[VectorStore] ${formatMessage(message, payload)}`);
      },
      warn: (message: string, payload?: LogPayload): void => {
        console.warn(`[VectorStore] ${formatMessage(message, payload)}`);
      },
      error: (message: string, payload?: LogPayload): void => {
        console.error(`[VectorStore] ${formatMessage(message, payload)}`);
      },
    };
  }

  // In NestJS environment, try to use NestJS Logger
  // We import dynamically to avoid issues in the job worker runtime
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Logger } = require('@nestjs/common');
    const baseLogger = new Logger('VectorStore');

    return {
      info: (message: string, payload?: LogPayload): void => {
        baseLogger.log(formatMessage(message, payload));
      },
      warn: (message: string, payload?: LogPayload): void => {
        baseLogger.warn(formatMessage(message, payload));
      },
      error: (message: string, payload?: LogPayload): void => {
        baseLogger.error(formatMessage(message, payload));
      },
    };
  } catch {
    // Fallback to console if NestJS is not available
    return {
      info: (message: string, payload?: LogPayload): void => {
        console.log(`[VectorStore] ${formatMessage(message, payload)}`);
      },
      warn: (message: string, payload?: LogPayload): void => {
        console.warn(`[VectorStore] ${formatMessage(message, payload)}`);
      },
      error: (message: string, payload?: LogPayload): void => {
        console.error(`[VectorStore] ${formatMessage(message, payload)}`);
      },
    };
  }
};

export const logger = createLogger();
