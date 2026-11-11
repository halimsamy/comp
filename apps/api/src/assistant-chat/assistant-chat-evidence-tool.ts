import { db } from '@db';
import {
  AI_READABLE_EVIDENCE_FORM_TYPES,
  evidenceFormDefinitions,
  toDbEvidenceFormType,
  type EvidenceFormType,
} from '@trycompai/company';
import { z } from 'zod';

// Roles the evidence-forms API requires to read submissions (evidence-forms.service.ts).
const EVIDENCE_READER_ROLES = ['owner', 'admin', 'auditor'];
const DEFAULT_SUBMISSIONS = 3;
const MAX_SUBMISSIONS = 10;

interface EvidenceToolContext {
  organizationId: string;
  permissions: Record<string, string[]>;
  roles: string[];
}

const isUploadedFile = (value: object): value is { fileName: string } =>
  'fileKey' in value &&
  'fileName' in value &&
  typeof value.fileName === 'string';

/** Uploaded files become their name: no contents, and no signed download URLs. */
function withFileNames(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withFileNames);
  if (typeof value !== 'object' || value === null) return value;
  if (isUploadedFile(value)) return { uploadedFile: value.fileName };
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, withFileNames(entry)]),
  );
}

function fieldLabels(formType: EvidenceFormType) {
  return evidenceFormDefinitions[formType].fields.map((field) => ({
    key: field.key,
    label: field.label,
    ...(field.columns && {
      columns: field.columns.map((column) => ({
        key: column.key,
        label: column.label,
      })),
    }),
  }));
}

export function buildEvidenceTool(ctx: EvidenceToolContext) {
  const canRead =
    ctx.permissions.evidence?.includes('read') &&
    ctx.roles.some((role) => EVIDENCE_READER_ROLES.includes(role.trim()));
  if (!canRead) return undefined;

  return {
    description:
      "Read the organization's submitted evidence forms (the Documents section): infrastructure inventory, RBAC matrix, account types, network diagram, penetration test summary, tabletop exercises, board / IT leadership / risk committee meeting minutes, access requests. Returns the latest submissions with all their data and the form's field labels. Uploaded files are listed by name only; their contents are not available.",
    inputSchema: z.object({
      formType: z.enum(AI_READABLE_EVIDENCE_FORM_TYPES),
      limit: z.number().int().min(1).max(MAX_SUBMISSIONS).optional(),
    }),
    execute: async ({
      formType,
      limit = DEFAULT_SUBMISSIONS,
    }: {
      formType: EvidenceFormType;
      limit?: number;
    }) => {
      const title = evidenceFormDefinitions[formType].title;
      const submissions = await db.evidenceSubmission.findMany({
        where: {
          organizationId: ctx.organizationId,
          formType: toDbEvidenceFormType(formType),
        },
        orderBy: { submittedAt: 'desc' },
        take: limit,
        select: {
          submittedAt: true,
          status: true,
          data: true,
          submittedBy: { select: { name: true } },
        },
      });
      if (submissions.length === 0) {
        return {
          form: title,
          submissions: [],
          message: `No ${title} submissions found`,
        };
      }
      return {
        form: title,
        fields: fieldLabels(formType),
        submissions: submissions.map((submission) => ({
          submittedAt: submission.submittedAt.toISOString(),
          status: submission.status,
          submittedBy: submission.submittedBy?.name ?? null,
          data: withFileNames(submission.data),
        })),
      };
    },
  };
}
