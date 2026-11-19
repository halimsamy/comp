'use client';

import { Card } from '@trycompai/ui';
import { Button } from '@trycompai/design-system';
import { ChevronUp, ChevronDown } from '@trycompai/design-system/icons';
import type { SoaRowLink } from '../hooks/useSoaRequirementLinks';
import type {
  SOAFieldSavePayload,
  SOAProcessedResult,
  SOATableAnswerData,
} from './EditableSOAFields';
import { SOA_COLUMN_LABELS, type SOAColumn, type SOAQuestion } from './soa-row-types';
import { SOATableRow } from './SOATableRow';
import { SOAMobileRow } from './SOAMobileRow';

export type { SOATableAnswerData };

interface SOATableProps {
  columns: SOAColumn[];
  questions: SOAQuestion[];
  answersMap: Map<string, SOATableAnswerData>;
  questionStatuses: Map<string, string>;
  processedResults: Map<string, SOAProcessedResult>;
  isFullyRemote: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  documentId: string;
  isPendingApproval: boolean;
  organizationId: string;
  rowLinks: Map<string, SoaRowLink>;
  onAnswerUpdate?: (questionId: string, payload: SOAFieldSavePayload) => void;
}

/** The configured columns plus the read-only Implementation column after Applicable. */
export function withImplementationColumn(columns: SOAColumn[]): SOAColumn[] {
  if (columns.some((c) => c.name === 'implementation')) return columns;
  const at = columns.findIndex((c) => c.name === 'isApplicable');
  const implementation: SOAColumn = { name: 'implementation', type: 'string' };
  if (at < 0) return [...columns, implementation];
  return [...columns.slice(0, at + 1), implementation, ...columns.slice(at + 1)];
}

export function SOATable({
  columns: configuredColumns,
  questions,
  answersMap,
  questionStatuses,
  processedResults,
  isFullyRemote,
  isExpanded,
  onToggleExpand,
  documentId,
  isPendingApproval,
  organizationId,
  rowLinks,
  onAnswerUpdate,
}: SOATableProps) {
  const columns = withImplementationColumn(configuredColumns);
  const displayedQuestions = isExpanded ? questions : questions.slice(0, 5);
  const hasMoreQuestions = questions.length > 5;

  const sharedRowProps = (question: SOAQuestion) => ({
    question,
    columns,
    answerData: answersMap.get(question.id),
    questionStatus: questionStatuses.get(question.id),
    processedResult: processedResults.get(question.id),
    isFullyRemote,
    documentId,
    isPendingApproval,
    organizationId,
    link: rowLinks.get(question.columnMapping.closure),
    onUpdate: (payload: SOAFieldSavePayload) => onAnswerUpdate?.(question.id, payload),
  });

  if (questions.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        Every control has a decision.
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      {/* Desktop table */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full border-separate border-spacing-0" style={{ minWidth: '900px' }}>
          <colgroup>
            {columns.map((column) => (
              <col key={column.name} style={{ width: getColumnWidth(column.name) }} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b bg-muted/30">
              {columns.map((column, index) => (
                <th
                  key={column.name}
                  className={`py-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground ${
                    index === 0 ? 'pl-6 pr-6' : 'px-6'
                  }`}
                >
                  {SOA_COLUMN_LABELS[column.name] ?? column.name.replace(/_/g, ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayedQuestions.map((question) => (
              <SOATableRow key={question.id} {...sharedRowProps(question)} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile stacked cards */}
      <div className="lg:hidden divide-y divide-border">
        {displayedQuestions.map((question) => (
          <SOAMobileRow key={question.id} {...sharedRowProps(question)} />
        ))}
      </div>

      {hasMoreQuestions && (
        <div className="border-t p-4 flex items-center justify-center">
          <Button
            variant="ghost"
            onClick={onToggleExpand}
            iconLeft={isExpanded ? <ChevronUp /> : undefined}
            iconRight={!isExpanded ? <ChevronDown /> : undefined}
          >
            {isExpanded ? 'Show Less' : `Show All (${questions.length} total)`}
          </Button>
        </div>
      )}
    </Card>
  );
}

function getColumnWidth(colName: string): string {
  switch (colName) {
    case 'closure': return '8%';
    case 'isApplicable': return '12%';
    case 'implementation': return '10%';
    case 'title': return '15%';
    case 'control_objective': return '30%';
    case 'justification': return '25%';
    default: return '15%';
  }
}
