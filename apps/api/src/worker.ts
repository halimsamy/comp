/**
 * Background job worker for apps/api (pg-boss via @trycompai/jobs). Replaces `trigger dev`/deploy.
 *   bun run worker            # process jobs
 *   bun run worker:dry-run    # list registered tasks without connecting
 * Runs under bun so the @db and @/ path aliases resolve from tsconfig.json.
 */
import { startWorker } from '@trycompai/jobs/worker';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Was provided by caBundleExtension on trigger.dev. Docker images set it already;
// this covers local runs. Prefer setting it in the environment before start.
const rdsBundle = resolve(__dirname, '../../../packages/db/certs/rds-global-bundle.pem');
if (!process.env.NODE_EXTRA_CA_CERTS && existsSync(rdsBundle)) {
  process.env.NODE_EXTRA_CA_CERTS = rdsBundle;
}

startWorker({ name: 'api', dirs: [join(__dirname, 'trigger')] }).catch((error) => {
  console.error('[worker] failed to start', error);
  process.exit(1);
});
