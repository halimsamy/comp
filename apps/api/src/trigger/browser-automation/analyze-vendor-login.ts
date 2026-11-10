import { task } from '@trycompai/jobs';
import { BrowserLoginAnalyzerService } from '../../browserbase/browser-login-analyzer.service';
import type { LoginAnalysis } from '../../browserbase/browser-login-analysis';

const analyzer = new BrowserLoginAnalyzerService();

/**
 * Runs the vendor login analysis (open a cloud browser, navigate to the sign-in
 * page, and detect the login methods) in the background. Kept off the HTTP
 * request path because the browser + AI work can outlast request/browser
 * timeouts. The connect flow subscribes to the run for the result.
 */
export const analyzeVendorLogin = task({
  id: 'analyze-vendor-login',
  // Browser open + AI navigate + AI extract; generous headroom, still well under
  // the Browserbase session lifetime.
  maxDuration: 180,
  // Analysis already degrades to a manual fallback on failure, so a blind retry
  // just wastes a browser session.
  retry: { maxAttempts: 1 },
  // organizationId scopes the run for GET /v1/job-runs/:runId (JobRun.organizationId).
  run: async (payload: {
    url: string;
    organizationId: string;
  }): Promise<LoginAnalysis> => {
    return analyzer.analyzeLogin(payload.url);
  },
});
