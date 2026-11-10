import { queue, schemaTask } from '@trycompai/jobs';
import { TrustEmailService } from '../../trust-portal/email.service';
import { trustAccessSubmissionSchema } from '../../trust-portal/trust-access-submission';
import { processTrustAccessSubmissionPayload } from '../../trust-portal/trust-access-submission.processor';

// concurrencyLimit 1 makes this a pg-boss singleton queue keyed by the recipient
// concurrencyKey: one active submission per recipient cluster-wide, so retries and
// submissions for one recipient cannot create duplicates.
const accessSubmissionQueue = queue({
  name: 'trust-portal-access-submissions',
  concurrencyLimit: 1,
});

export const processTrustAccessSubmission = schemaTask({
  id: 'trust-portal-process-access-submission',
  schema: trustAccessSubmissionSchema,
  queue: accessSubmissionQueue,
  retry: {
    maxAttempts: 5,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30000,
    factor: 2,
  },
  run: async (payload, { ctx }) => {
    await processTrustAccessSubmissionPayload({
      payload,
      runId: ctx.run.id,
      emailService: new TrustEmailService(),
    });
  },
});
