import type { Vendor, VendorAttentionReason, VendorReviewStatus } from '@/hooks/use-vendors';
import type {
  VendorAssuranceType,
  VendorCriticality,
  VendorDocumentType,
  VendorPciStatus,
  VendorReviewOutcome,
} from '@db';

type BadgeVariant = 'default' | 'accent' | 'secondary' | 'destructive' | 'outline';

export const CRITICALITY_OPTIONS: {
  value: VendorCriticality;
  label: string;
  variant: BadgeVariant;
}[] = [
  { value: 'critical', label: 'Critical', variant: 'destructive' },
  { value: 'high', label: 'High', variant: 'default' },
  { value: 'medium', label: 'Medium', variant: 'accent' },
  { value: 'low', label: 'Low', variant: 'secondary' },
];

export const REVIEW_STATUS: Record<VendorReviewStatus, { label: string; variant: BadgeVariant }> = {
  overdue: { label: 'Overdue', variant: 'destructive' },
  due_soon: { label: 'Due soon', variant: 'default' },
  never_reviewed: { label: 'Not reviewed', variant: 'secondary' },
  current: { label: 'Reviewed', variant: 'accent' },
};

export const DATA_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'cardholder_data', label: 'Cardholder data (PAN)' },
  { value: 'sensitive_authentication_data', label: 'Sensitive authentication data' },
  { value: 'customer_pii', label: 'Customer personal data' },
  { value: 'employee_pii', label: 'Employee personal data' },
  { value: 'financial', label: 'Financial data' },
  { value: 'credentials', label: 'Credentials / secrets' },
  { value: 'source_code', label: 'Source code' },
  { value: 'health', label: 'Health data' },
  { value: 'confidential_business', label: 'Confidential business data' },
  { value: 'public', label: 'Public data only' },
];

export const ASSURANCE_LABEL: Record<VendorAssuranceType, string> = {
  soc2_type1: 'SOC 2 Type I',
  soc2_type2: 'SOC 2 Type II',
  iso27001: 'ISO 27001',
  pci_aoc: 'PCI DSS AOC',
  pci_roc: 'PCI DSS ROC',
  other: 'Other attestation',
  none: 'No attestation',
};

export const PCI_STATUS: Record<VendorPciStatus, { label: string; variant: BadgeVariant }> = {
  compliant: { label: 'Compliant', variant: 'accent' },
  non_compliant: { label: 'Non-compliant', variant: 'destructive' },
  in_progress: { label: 'In progress', variant: 'default' },
  not_applicable: { label: 'Not applicable', variant: 'secondary' },
  unknown: { label: 'Unknown', variant: 'outline' },
};

export const DOCUMENT_TYPE_LABEL: Record<VendorDocumentType, string> = {
  soc2_type1: 'SOC 2 Type I',
  soc2_type2: 'SOC 2 Type II',
  iso27001_certificate: 'ISO 27001 certificate',
  pci_aoc: 'PCI DSS AOC',
  dpa: 'DPA',
  contract: 'Contract',
  nda: 'NDA',
  pentest_report: 'Pentest report',
  insurance: 'Insurance',
  questionnaire: 'Security questionnaire',
  other: 'Other',
};

export const REVIEW_OUTCOME: Record<VendorReviewOutcome, { label: string; variant: BadgeVariant }> =
  {
    approved: { label: 'Approved', variant: 'accent' },
    approved_with_conditions: { label: 'Approved with conditions', variant: 'default' },
    rejected: { label: 'Rejected', variant: 'destructive' },
  };

export const formatDate = (value: string | null | undefined) =>
  value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value)) : '—';

/** "2026-11-18T00:00:00.000Z" → "2026-11-18" for <input type="date">. */
export const toDateInput = (value: string | null | undefined) => (value ? value.slice(0, 10) : '');

/** "2026-11-18" → ISO string, "" → null (clears the field). */
export const fromDateInput = (value: string) => (value ? new Date(value).toISOString() : null);

const DAY_MS = 86_400_000;

/** Days until a date (negative when past). */
export const daysUntil = ({ date, now = new Date() }: { date: string; now?: Date }) =>
  Math.ceil((new Date(date).getTime() - now.getTime()) / DAY_MS);

/** "Expired 3 days ago" / "Expires in 12 days" / "Valid until Mar 31, 2027". */
export function expiryLabel({
  expiresAt,
  now = new Date(),
}: {
  expiresAt: string | null;
  now?: Date;
}) {
  if (!expiresAt) return { label: 'No expiry', variant: 'secondary' as BadgeVariant };
  const days = daysUntil({ date: expiresAt, now });
  if (days < 0) return { label: 'Expired', variant: 'destructive' as BadgeVariant };
  if (days <= 60) return { label: `Expires in ${days}d`, variant: 'default' as BadgeVariant };
  return { label: `Valid until ${formatDate(expiresAt)}`, variant: 'accent' as BadgeVariant };
}

export type CriticalityFilter = VendorCriticality | 'unset' | 'all';
export type ReviewFilter = VendorReviewStatus | 'all';
export type DocumentFilter = 'expiring' | 'all';
export type AssessmentFilter = 'all' | 'not_assessed' | 'needs_attention';

export interface VendorTpspFilters {
  criticality: CriticalityFilter;
  review: ReviewFilter;
  documents: DocumentFilter;
  assessment: AssessmentFilter;
}

export const DEFAULT_TPSP_FILTERS: VendorTpspFilters = {
  criticality: 'all',
  review: 'all',
  documents: 'all',
  assessment: 'all',
};

/**
 * Filters from the URL, so dashboard links like `?status=not_assessed`,
 * `?criticality=unset` or `?attention=true` open the list pre-filtered.
 */
export function filtersFromSearchParams(params: { get: (key: string) => string | null }) {
  const filters = { ...DEFAULT_TPSP_FILTERS };
  const criticality = params.get('criticality');
  if (criticality && ['unset', ...CRITICALITY_OPTIONS.map((o) => o.value)].includes(criticality)) {
    filters.criticality = criticality as CriticalityFilter;
  }
  if (params.get('status') === 'not_assessed') filters.assessment = 'not_assessed';
  if (params.get('attention') === 'true') filters.assessment = 'needs_attention';
  return filters;
}

export const ATTENTION_REASON_LABEL: Record<VendorAttentionReason, string> = {
  not_assessed: 'Not assessed',
  criticality_not_set: 'Criticality not set',
  review_overdue: 'Review overdue',
  never_reviewed_in_scope: 'Never reviewed',
  docs_expiring: 'Documents expiring',
};

export function matchesTpspFilters({
  vendor,
  filters,
}: {
  vendor: Pick<
    Vendor,
    'criticality' | 'reviewStatus' | 'expiringDocumentsCount' | 'status' | 'attentionReasons'
  >;
  filters: VendorTpspFilters;
}): boolean {
  if (filters.assessment === 'not_assessed' && vendor.status !== 'not_assessed') return false;
  if (filters.assessment === 'needs_attention' && !vendor.attentionReasons?.length) return false;
  if (filters.criticality !== 'all' && (vendor.criticality ?? 'unset') !== filters.criticality) {
    return false;
  }
  if (filters.review !== 'all' && (vendor.reviewStatus ?? 'never_reviewed') !== filters.review) {
    return false;
  }
  if (filters.documents === 'expiring' && !vendor.expiringDocumentsCount) return false;
  return true;
}

/** Mirrors the API cadence: by criticality, capped at 12 months in PCI scope (12.8.4). */
export function reviewCadenceMonths(vendor: {
  criticality?: VendorCriticality | null;
  handlesCardholderData?: boolean;
  affectsCdeSecurity?: boolean;
}): number {
  const byCriticality = { critical: 6, high: 12, medium: 12, low: 24 } as const;
  const months = vendor.criticality ? byCriticality[vendor.criticality] : 12;
  return vendor.handlesCardholderData || vendor.affectsCdeSecurity ? Math.min(months, 12) : months;
}
