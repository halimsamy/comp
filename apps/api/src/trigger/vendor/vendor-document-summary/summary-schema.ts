import { z } from 'zod';

/** Structured AI summary of a vendor assurance report (SOC 2, ISO, AOC, pentest). */
export const vendorDocumentSummarySchema = z.object({
  reportType: z
    .string()
    .describe(
      'e.g. "SOC 2 Type II", "ISO/IEC 27001:2022 certificate", "PCI DSS v4.0.1 AOC for Service Providers"',
    ),
  auditor: z
    .string()
    .nullable()
    .describe('Audit firm, certification body or QSA company'),
  periodStart: z
    .string()
    .nullable()
    .describe('Start of the audit period, YYYY-MM-DD'),
  periodEnd: z
    .string()
    .nullable()
    .describe('End of the audit period or report/AOC date, YYYY-MM-DD'),
  expiresAt: z
    .string()
    .nullable()
    .describe('Certificate or AOC expiry date if stated, YYYY-MM-DD'),
  opinion: z.enum([
    'unqualified',
    'qualified',
    'adverse',
    'disclaimer',
    'compliant',
    'non_compliant',
    'not_stated',
  ]),
  scope: z
    .string()
    .describe('Systems, services and locations in scope, one or two sentences'),
  exceptions: z
    .array(z.object({ control: z.string(), description: z.string() }))
    .describe('Testing exceptions, deviations or non-conformities'),
  complementaryUserEntityControls: z
    .array(z.string())
    .describe('CUECs / customer responsibilities the user entity must operate'),
  subserviceOrganizations: z
    .array(z.string())
    .describe('Carved-out or inclusive subservice orgs'),
  keyRisks: z
    .array(z.string())
    .describe('Points a reviewer should follow up on, max 5'),
  summary: z
    .string()
    .describe('3-5 sentence plain-English summary for the vendor reviewer'),
});

export type VendorDocumentSummary = z.infer<typeof vendorDocumentSummarySchema>;

export const VENDOR_DOCUMENT_SUMMARY_TASK_ID =
  'vendor-document-summary' as const;

/** "2026-03-31" → Date, or null for anything unparsable. */
export function parseSummaryDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
