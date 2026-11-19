'use client';

import { Spinner } from '@trycompai/design-system';
import { EditableSOAFields } from './EditableSOAFields';
import { SOAControlCode } from './SOAControlCode';
import { resolveSoaDisplay } from './soa-display';
import type { SOARowProps } from './soa-row-types';

function Processing() {
  return (
    <div className="flex items-center gap-2">
      <Spinner />
      <span className="text-xs text-muted-foreground">Processing...</span>
    </div>
  );
}

export function SOATableRow({
  question,
  columns,
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
  const insufficientData =
    questionStatus === 'insufficient_data' || processedResult?.insufficientData === true;
  const closure = question.columnMapping.closure || '';

  // Applicability + justification are per-organization values (this document's
  // answers or an in-session autofill result), never the shared configuration.
  const { displayIsApplicable, justificationValue } = resolveSoaDisplay({
    answerData,
    processedResult,
    isFullyRemote,
    isControl7: closure.startsWith('7.'),
  });

  const renderCell = (name: string) => {
    if (name === 'closure') return <SOAControlCode closure={closure} href={link?.href} anchor />;
    if (name === 'isApplicable') {
      if (isProcessing) return <Processing />;
      return (
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
      );
    }
    if (name === 'implementation') {
      // Read-only: comes from the mapped controls, shown for applicable rows only.
      const value = displayIsApplicable === true ? link?.implementation : null;
      return <span className="text-sm text-muted-foreground">{value ?? '—'}</span>;
    }
    if (name === 'justification') {
      if (isProcessing) return <Processing />;
      // ISO 27001 needs a justification for every row, applicable or not.
      return (
        <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
          {justificationValue || '—'}
        </p>
      );
    }
    const value = question.columnMapping[name as keyof typeof question.columnMapping];
    if (insufficientData && name !== 'title' && name !== 'control_objective') {
      return <span className="text-xs text-muted-foreground italic">Insufficient data</span>;
    }
    return (
      <span
        className={`leading-relaxed whitespace-pre-wrap ${value ? 'text-foreground' : 'text-muted-foreground'}`}
      >
        {typeof value === 'string' && value ? value : '—'}
      </span>
    );
  };

  return (
    <tr className="border-b transition-colors hover:bg-muted/30 last:border-b-0">
      {columns.map((column, colIndex) => (
        <td
          key={column.name}
          className={`py-4 text-sm align-top ${colIndex === 0 ? 'pl-6 pr-6' : 'px-6'} ${
            column.name === 'isApplicable' ? 'bg-muted/10 text-center' : ''
          }`}
        >
          {renderCell(column.name)}
        </td>
      ))}
    </tr>
  );
}
