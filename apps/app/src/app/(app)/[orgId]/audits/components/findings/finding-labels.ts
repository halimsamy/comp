import type { Finding } from '@/hooks/use-findings-api';
import { FindingSeverity, FindingStatus } from '@db';

export const STATUS_OPTIONS: { value: FindingStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: FindingStatus.open, label: 'Open' },
  { value: FindingStatus.ready_for_review, label: 'Ready for review' },
  { value: FindingStatus.needs_revision, label: 'Needs revision' },
  { value: FindingStatus.closed, label: 'Closed' },
];

export const SEVERITY_OPTIONS: { value: FindingSeverity | 'all'; label: string }[] = [
  { value: 'all', label: 'All severities' },
  { value: FindingSeverity.critical, label: 'Critical' },
  { value: FindingSeverity.high, label: 'High' },
  { value: FindingSeverity.medium, label: 'Medium' },
  { value: FindingSeverity.low, label: 'Low' },
];

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function targetLabel(f: Finding): string {
  if (f.audit) return `Audit: ${f.audit.title}`;
  if (f.task) return `Task: ${f.task.title}`;
  if (f.policy) return `Policy: ${f.policy.name}`;
  if (f.vendor) return `Vendor: ${f.vendor.name}`;
  if (f.risk) return `Risk: ${f.risk.title}`;
  if (f.member) return `Person: ${f.member.user.name ?? f.member.user.email}`;
  if (f.device) return `Device: ${f.device.name || f.device.hostname}`;
  if (f.evidenceSubmission)
    return `Document: ${f.evidenceSubmission.formType.replace(/-/g, ' ')}`;
  if (f.evidenceFormType) return `Document: ${f.evidenceFormType.replace(/-/g, ' ')}`;
  if (f.area === 'risks') return 'Risks (general)';
  if (f.area === 'vendors') return 'Vendors (general)';
  if (f.area === 'policies') return 'Policies (general)';
  if (f.area) return `Area: ${capitalize(f.area)}`;
  return '—';
}

export const SEVERITY_VARIANT: Record<FindingSeverity, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  low: 'outline',
  medium: 'secondary',
  high: 'secondary',
  critical: 'destructive',
};

export const STATUS_VARIANT: Record<FindingStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  open: 'destructive',
  ready_for_review: 'outline',
  needs_revision: 'secondary',
  closed: 'default',
};

