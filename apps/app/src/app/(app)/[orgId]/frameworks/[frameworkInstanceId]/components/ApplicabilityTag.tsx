import { APPLICABILITY_LABELS, type ApplicabilityStatus } from '@/lib/control-compliance';
import { Badge } from '@trycompai/design-system';

/** Marks PCI requirements met another way (compensating control / customized approach). */
export function ApplicabilityTag({ applicability }: { applicability: ApplicabilityStatus }) {
  if (applicability !== 'compensating_control' && applicability !== 'customized_approach') {
    return null;
  }
  return <Badge variant="outline">{APPLICABILITY_LABELS[applicability]}</Badge>;
}
