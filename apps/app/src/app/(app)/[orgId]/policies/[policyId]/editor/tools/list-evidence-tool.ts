import { AI_READABLE_EVIDENCE_FORM_TYPES } from '@trycompai/company';
import { tool } from 'ai';
import { z } from 'zod';

const SUBMISSIONS_LIMIT = 5;
const readableFormTypes: ReadonlySet<string> = new Set(AI_READABLE_EVIDENCE_FORM_TYPES);

interface EvidenceSubmission {
  submittedAt: string;
  status: string;
  submittedBy: { name: string | null } | null;
  data: unknown;
}

const isUploadedFile = (value: object): value is { fileName: string } =>
  'fileKey' in value && 'fileName' in value && typeof value.fileName === 'string';

/** Uploaded files become their name: no contents, and no signed download URLs. */
function withFileNames(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withFileNames);
  if (typeof value !== 'object' || value === null) return value;
  if (isUploadedFile(value)) return { uploadedFile: value.fileName };
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, withFileNames(entry)]),
  );
}

export function buildListEvidenceTool({
  apiCall,
}: {
  apiCall: <T>(endpoint: string) => Promise<T>;
}) {
  return tool({
    description:
      'List evidence submissions from the Documents section (infrastructure inventory, RBAC matrix, account types, network diagram, penetration test, tabletop exercises, meeting minutes, access requests). Without formType: which forms have been submitted and when. With formType: the latest submissions of that form with their full data. Uploaded files are listed by name only.',
    inputSchema: z.object({
      formType: z
        .enum(AI_READABLE_EVIDENCE_FORM_TYPES)
        .optional()
        .describe('Evidence form to read; omit to see which forms have submissions'),
    }),
    execute: async ({ formType }) => {
      try {
        if (!formType) {
          const statuses = await apiCall<Record<string, unknown>>('/v1/evidence-forms/statuses');
          return {
            forms: Object.fromEntries(
              Object.entries(statuses).filter(([type]) => readableFormTypes.has(type)),
            ),
          };
        }
        const result = await apiCall<{ submissions: EvidenceSubmission[]; total: number }>(
          `/v1/evidence-forms/${formType}?limit=${SUBMISSIONS_LIMIT}`,
        );
        return {
          evidence: result.submissions.map((submission) => ({
            submittedAt: submission.submittedAt,
            status: submission.status,
            submittedBy: submission.submittedBy?.name ?? null,
            data: withFileNames(submission.data),
          })),
          count: result.total,
        };
      } catch (error) {
        return {
          error: `Could not load evidence: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  });
}
