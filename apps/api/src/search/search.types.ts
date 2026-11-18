export type SearchEntryType =
  | 'requirement'
  | 'control'
  | 'policy'
  | 'task'
  | 'risk'
  | 'vendor'
  | 'person'
  | 'isms_document';

export interface SearchEntry {
  type: SearchEntryType;
  id: string;
  label: string;
  /** Secondary text, e.g. the framework name or a status. */
  description: string | null;
  keywords: string[];
  /** The framework instance a requirement belongs to (needed for its URL). */
  parentId: string | null;
}
