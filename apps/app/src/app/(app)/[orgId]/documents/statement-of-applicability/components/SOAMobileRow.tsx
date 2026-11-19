'use client';

import { Spinner } from '@trycompai/design-system';
import { EditableSOAFields } from './EditableSOAFields';
import { SOAControlCode } from './SOAControlCode';
import { resolveSoaDisplay } from './soa-display';
import type { SOARowProps } from './soa-row-types';

function Label({ children }: { children: string }) {
  return (
    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{children}</p>
  );
}

export function SOAMobileRow({
  question,
  answerData,
  questionStatus,
  processedResult,
  isFullyRemote,
  documentId,
  isPendingApproval,
  organizationId,
  link,
  onUpdate,
}: SOARowProps) {
  const isProcessing = questionStatus === 'processing';
  const closure = question.columnMapping.closure || '';

  // Applicability + justification are per-organization values from this
  // document's own answers or an in-session autofill result — never from the
  // shared framework configuration.
  const { displayIsApplicable, justificationValue } = resolveSoaDisplay({
    answerData,
    processedResult,
    isFullyRemote,
    isControl7: closure.startsWith('7.'),
  });

  return (
    <div className="p-4 space-y-3">
      <div>
        <Label>Control</Label>
        <p className="mt-0.5 flex flex-wrap items-baseline gap-2 text-sm font-medium text-foreground">
          <SOAControlCode closure={closure} href={link?.href} />
          <span>{question.columnMapping.title}</span>
        </p>
      </div>

      {question.columnMapping.control_objective && (
        <div>
          <Label>Control Objective</Label>
          <p className="text-sm text-foreground mt-0.5 leading-relaxed">
            {question.columnMapping.control_objective}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <Label>Applicable</Label>
        {isProcessing ? (
          <div className="flex items-center gap-2">
            <Spinner />
            <span className="text-xs text-muted-foreground">Processing...</span>
          </div>
        ) : (
          <EditableSOAFields
            documentId={documentId}
            questionId={question.id}
            isApplicable={displayIsApplicable}
            justification={justificationValue}
            inheritedVendorId={answerData?.inheritedVendorId ?? null}
            isPendingApproval={isPendingApproval}
            organizationId={organizationId}
            onUpdate={onUpdate}
          />
        )}
      </div>

      {displayIsApplicable === true && link?.implementation && (
        <div className="flex items-center justify-between gap-3">
          <Label>Implementation</Label>
          <span className="text-sm text-muted-foreground">{link.implementation}</span>
        </div>
      )}

      {/* Justification (shown for both Applicable and Not Applicable per ISO 27001) */}
      {!isProcessing && (
        <div>
          <Label>Justification</Label>
          <p className="text-sm text-foreground mt-0.5 leading-relaxed whitespace-pre-wrap">
            {justificationValue || '—'}
          </p>
        </div>
      )}
    </div>
  );
}
