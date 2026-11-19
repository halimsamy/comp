export type AttentionModule =
  | 'tasks'
  | 'policies'
  | 'acknowledgements'
  | 'training'
  | 'people'
  | 'vendors'
  | 'risks'
  | 'assets'
  | 'vulnerabilities'
  | 'checks'
  | 'correctiveActions'
  | 'documents'
  | 'questionnaires'
  | 'accessReviews';

export interface AttentionReason {
  label: string;
  count: number;
  /** Org-relative deep link to the filtered list, when the module supports one. */
  href?: string;
}

export interface AttentionCard {
  module: AttentionModule;
  label: string;
  /** Items that need someone to act. */
  needsAttention: number;
  ok: number;
  total: number;
  /** Org-relative deep link, e.g. `/tasks`. */
  href: string;
  reasons: AttentionReason[];
}

/** PCI DSS 7.2.4: user accounts and access privileges are reviewed at least once every six months. */
export const ACCESS_REVIEW_INTERVAL_DAYS = 183;
export const TRAINING_EXPIRY_WINDOW_DAYS = 30;
/** A policy waiting this long for its approver is flagged. */
export const APPROVAL_STALE_DAYS = 7;
/** A trust-portal questionnaire waiting this long for review is flagged. */
export const QUESTIONNAIRE_STALE_DAYS = 2;
/** PCI DSS 12.5.1 / ISO 27001 A.5.9: the inventory is confirmed at least yearly. */
export const INVENTORY_REVIEW_DAYS = 365;

export const reasons = (
  entries: Array<[string, number] | [string, number, string]>,
): AttentionReason[] =>
  entries
    .filter(([, count]) => count > 0)
    .map(([label, count, href]) => (href ? { label, count, href } : { label, count }));

export function card(
  input: Omit<AttentionCard, 'ok'> & { ok?: number },
): AttentionCard {
  return {
    ...input,
    ok: input.ok ?? Math.max(0, input.total - input.needsAttention),
  };
}
