import type { SoaRowLink } from '../hooks/useSoaRequirementLinks';
import type { SOAFieldSavePayload, SOAProcessedResult, SOATableAnswerData } from './soa-field-types';

export type SOAColumn = {
  name: string;
  type: 'string' | 'boolean' | 'text';
};

export type SOAQuestion = {
  id: string;
  text: string;
  columnMapping: {
    closure: string;
    title: string;
    control_objective: string | null;
    isApplicable: boolean | null;
    justification?: string | null;
  };
};

/** Props shared by the desktop row and the mobile card. */
export interface SOARowProps {
  question: SOAQuestion;
  columns: SOAColumn[];
  answerData?: SOATableAnswerData;
  questionStatus?: string;
  processedResult?: SOAProcessedResult;
  isFullyRemote: boolean;
  documentId: string;
  isPendingApproval: boolean;
  organizationId: string;
  /** Requirement page link + implementation status, when the ISO instance is loaded. */
  link?: SoaRowLink;
  onUpdate?: (payload: SOAFieldSavePayload) => void;
}

export const SOA_COLUMN_LABELS: Record<string, string> = {
  closure: 'Control',
  title: 'Title',
  control_objective: 'Control Objective',
  isApplicable: 'Applicable',
  implementation: 'Implementation',
  justification: 'Justification',
};
