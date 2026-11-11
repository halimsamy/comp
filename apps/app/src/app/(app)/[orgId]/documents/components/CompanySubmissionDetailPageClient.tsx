'use client';

import {
  evidenceFormDefinitions,
  type EvidenceFormType,
} from '@/app/(app)/[orgId]/documents/forms';
import { usePermissions } from '@/hooks/use-permissions';
import { api } from '@/lib/api-client';
import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Field,
  FieldLabel,
  PageHeader,
  Section,
  Text,
  Textarea,
} from '@trycompai/design-system';
import { Document, Download } from '@trycompai/design-system/icons';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import useSWR from 'swr';
import { downloadCsv } from '../isms/components/monitoring-csv';
import { buildMatrixCsv, matrixCsvFilename } from './matrix-csv';
import {
  StatusBadge,
  formatSubmissionDate,
  isMatrixField,
  normalizeMatrixRows,
  renderSubmissionValue,
} from './submission-utils';
import { SubmissionMatrixField } from './SubmissionMatrixField';

type EvidenceSubmissionRow = {
  id: string;
  submittedAt: string;
  status: string;
  reviewedAt?: string | null;
  reviewReason?: string | null;
  data: Record<string, unknown>;
  submittedBy?: {
    name: string | null;
    email: string;
  } | null;
  reviewedBy?: {
    name: string | null;
    email: string;
  } | null;
};

type EvidenceSubmissionResponse = {
  form: (typeof evidenceFormDefinitions)[EvidenceFormType];
  submission: EvidenceSubmissionRow;
};

function MarkdownPreview({ content }: { content: string }) {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert text-sm">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          ol({ children }) {
            return <ol className="list-decimal list-outside pl-5 space-y-1 my-2">{children}</ol>;
          },
          ul({ children }) {
            return <ul className="list-disc list-outside pl-5 space-y-1 my-2">{children}</ul>;
          },
          li({ children }) {
            return <li className="leading-normal">{children}</li>;
          },
          p({ children }) {
            return <p className="my-2">{children}</p>;
          },
          strong({ children }) {
            return <strong className="font-semibold">{children}</strong>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export function CompanySubmissionDetailPageClient({
  organizationId,
  formType,
  submissionId,
}: {
  organizationId: string;
  formType: EvidenceFormType;
  submissionId: string;
}) {
  const endpoint = `/v1/evidence-forms/${formType}/submissions/${submissionId}`;
  const swrKey: readonly [string, string] = [endpoint, organizationId];

  const { data, isLoading, error, mutate } = useSWR<EvidenceSubmissionResponse>(
    swrKey,
    async ([path, orgId]: readonly [string, string]) => {
      const response = await api.get<EvidenceSubmissionResponse>(path);
      if (response.error || !response.data) {
        throw new Error(response.error ?? 'Failed to load submission');
      }
      return response.data;
    },
  );

  const [reviewReason, setReviewReason] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const { hasPermission } = usePermissions();
  const canReview = hasPermission('evidence', 'update');

  const handleReview = async (action: 'approved' | 'rejected') => {
    if (action === 'rejected' && !reviewReason.trim()) {
      toast.error('A reason is required when rejecting a submission');
      return;
    }

    setIsSubmittingReview(true);
    try {
      const response = await api.patch(
        `/v1/evidence-forms/${formType}/submissions/${submissionId}/review`,
        { action, reason: reviewReason.trim() || undefined },
      );

      if (response.error) {
        toast.error(response.error);
        return;
      }

      toast.success(action === 'approved' ? 'Submission approved' : 'Submission rejected');
      setReviewReason('');
      mutate();
    } catch {
      toast.error('Failed to submit review');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const title = `${evidenceFormDefinitions[formType].title} Submission`;

  if (isLoading) {
    return (
      <>
        <PageHeader title={title} />
        <Empty>
          <EmptyMedia variant="icon">
            <Document size={24} />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>Loading submission...</EmptyTitle>
            <EmptyDescription>Fetching the selected document details.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </>
    );
  }

  if (error || !data?.submission) {
    return (
      <>
        <PageHeader title={title} />
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Submission not found</EmptyTitle>
            <EmptyDescription>
              This submission may have been removed or you may not have access.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </>
    );
  }

  const submission = data.submission;
  const fields = data.form.fields.filter((field) => field.key !== 'submissionDate');
  const compactFields = fields.filter((f) => f.type === 'text' || f.type === 'date');
  const selectFields = fields.filter((f) => f.type === 'select');
  const textareaFields = fields.filter((f) => f.type === 'textarea');
  const fileFields = fields.filter((f) => f.type === 'file');
  const matrixFields = fields.filter(isMatrixField);
  // Every matrix form has a single table (RBAC matrix, infrastructure inventory, account types).
  const matrixField = matrixFields[0];
  const matrixRows = matrixField ? normalizeMatrixRows(submission.data[matrixField.key]) : [];

  const handleExportCsv = () => {
    if (!matrixField) return;
    const submittedOn =
      typeof submission.data.submissionDate === 'string'
        ? submission.data.submissionDate
        : submission.submittedAt;
    downloadCsv(
      matrixCsvFilename({ formType, submittedOn }),
      buildMatrixCsv({ columns: matrixField.columns, rows: matrixRows }),
    );
  };

  return (
    <>
      <PageHeader
        title={title}
        actions={
          matrixRows.length > 0 ? (
            <Button
              type="button"
              variant="secondary"
              iconLeft={<Download size={16} />}
              onClick={handleExportCsv}
            >
              Export CSV
            </Button>
          ) : undefined
        }
      />
      <Section>
        <div className="space-y-6">
          <div className="rounded-md border border-border">
            <div className="divide-y divide-border">
              {formType === 'access-request' && (
                <div className="grid grid-cols-1 gap-2 p-4 lg:grid-cols-3">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Status
                  </div>
                  <div className="lg:col-span-2 text-sm">
                    <StatusBadge status={submission.status} />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 gap-2 p-4 lg:grid-cols-3">
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Submission Date
                </div>
                <div className="lg:col-span-2 text-sm">
                  {formatSubmissionDate(submission.data.submissionDate, submission.submittedAt)}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 p-4 lg:grid-cols-3">
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Submitted By
                </div>
                <div className="lg:col-span-2 text-sm">
                  {submission.submittedBy?.name ?? submission.submittedBy?.email ?? 'Unknown'}
                </div>
              </div>
              {formType === 'access-request' && submission.status !== 'pending' && (
                <>
                  <div className="grid grid-cols-1 gap-2 p-4 lg:grid-cols-3">
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Reviewed By
                    </div>
                    <div className="lg:col-span-2 text-sm">
                      {submission.reviewedBy?.name ?? submission.reviewedBy?.email ?? '—'}
                    </div>
                  </div>
                  {submission.reviewReason && (
                    <div className="grid grid-cols-1 gap-2 p-4 lg:grid-cols-3">
                      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Review Reason
                      </div>
                      <div className="lg:col-span-2 text-sm whitespace-pre-wrap">
                        {submission.reviewReason}
                      </div>
                    </div>
                  )}
                </>
              )}
              {compactFields.map((field) => (
                <div key={field.key} className="grid grid-cols-1 gap-2 p-4 lg:grid-cols-3">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {field.label}
                  </div>
                  <div className="lg:col-span-2 text-sm">
                    {renderSubmissionValue(submission.data[field.key], field)}
                  </div>
                </div>
              ))}
              {selectFields.map((field) => (
                <div key={field.key} className="grid grid-cols-1 gap-2 p-4 lg:grid-cols-3">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {field.label}
                  </div>
                  <div className="lg:col-span-2 text-sm">
                    {renderSubmissionValue(submission.data[field.key], field)}
                  </div>
                </div>
              ))}
              {textareaFields.map((field) => {
                const value = submission.data[field.key];
                const content = typeof value === 'string' ? value : '';
                return (
                  <div key={field.key} className="grid grid-cols-1 gap-2 p-4 lg:grid-cols-3">
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {field.label}
                    </div>
                    <div className="lg:col-span-2 text-sm">
                      {content ? (
                        <MarkdownPreview content={content} />
                      ) : (
                        <Text size="sm" variant="muted">
                          —
                        </Text>
                      )}
                    </div>
                  </div>
                );
              })}
              {fileFields.map((field) => (
                <div key={field.key} className="grid grid-cols-1 gap-2 p-4 lg:grid-cols-3">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {field.label}
                  </div>
                  <div className="lg:col-span-2 text-sm">
                    {renderSubmissionValue(submission.data[field.key], field)}
                  </div>
                </div>
              ))}
              {Boolean(submission.data.evidenceFile) &&
                !fields.some((f) => f.key === 'evidenceFile') && (
                  <div className="grid grid-cols-1 gap-2 p-4 lg:grid-cols-3">
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Uploaded Evidence
                    </div>
                    <div className="lg:col-span-2 text-sm">
                      {renderSubmissionValue(submission.data.evidenceFile)}
                    </div>
                  </div>
                )}
              {matrixFields.map((field) => (
                <SubmissionMatrixField
                  key={field.key}
                  label={field.label}
                  columns={field.columns}
                  rows={normalizeMatrixRows(submission.data[field.key])}
                />
              ))}
            </div>
          </div>

          {/* Review action area — only for access requests when user has update permission */}
          {formType === 'access-request' && submission.status === 'pending' && canReview && (
            <div className="rounded-md border border-border">
              <div className="divide-y divide-border">
                <div className="p-4">
                  <Text size="sm" weight="medium">
                    Review this submission
                  </Text>
                </div>
                <div className="p-4 space-y-4">
                  <Field>
                    <FieldLabel htmlFor="reviewReason">Reason (required for rejection)</FieldLabel>
                    <Textarea
                      id="reviewReason"
                      value={reviewReason}
                      onChange={(e) => setReviewReason(e.target.value)}
                      placeholder="Provide a reason for your decision..."
                      rows={4}
                      style={{
                        width: '100%',
                        maxWidth: 'none',
                      }}
                    />
                  </Field>
                  <div className="flex items-center gap-2 justify-end">
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => handleReview('rejected')}
                      disabled={isSubmittingReview}
                    >
                      Reject
                    </Button>
                    <Button
                      type="button"
                      onClick={() => handleReview('approved')}
                      disabled={isSubmittingReview}
                    >
                      Approve
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </Section>
    </>
  );
}
