import type { RiskTreatmentAction } from '@/hooks/use-risk-workspace';
import { toast } from 'sonner';
import { closesLastOpenAction } from './action-filters';

/** "Action completed", or a "Re-rate residual risk?" prompt after the risk's last open action (#115). */
export function announceActionCompleted({
  actions,
  action,
  orgId,
}: {
  actions: RiskTreatmentAction[];
  action: RiskTreatmentAction;
  orgId: string;
}) {
  if (!action.risk || !closesLastOpenAction({ actions, actionId: action.id })) {
    toast.success('Action completed');
    return;
  }
  const riskUrl = `/${orgId}/risk/${action.risk.id}?tab=risk`;
  toast.success('Re-rate residual risk?', {
    description: `Every action on "${action.risk.title}" is done.`,
    action: { label: 'Re-rate', onClick: () => window.location.assign(riskUrl) },
    duration: 10_000,
  });
}
