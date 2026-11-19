import { schedules } from '@trycompai/jobs';
import { remindPendingPolicyApprovals } from '../../policies/lifecycle/policy-approval-reminders';

export const policyApprovalRemindersSchedule = schedules.task({
  id: 'policy-approval-reminders-schedule',
  cron: '0 9 * * *', // daily 09:00 UTC
  maxDuration: 10 * 60, // seconds
  run: () => remindPendingPolicyApprovals(),
});
