export const NOTIFICATION_TYPES = [
  {
    key: 'policyNotifications' as const,
    label: 'Policy Updates',
    description: 'When policies are published or updated',
  },
  {
    key: 'taskReminders' as const,
    label: 'Task Reminders',
    description: 'Due date and overdue reminders',
  },
  {
    key: 'taskAssignments' as const,
    label: 'Task Assignments',
    description: 'When tasks are assigned to users',
  },
  {
    key: 'taskMentions' as const,
    label: 'Mentions',
    description: 'When someone mentions a user in a task or comment',
  },
  {
    key: 'weeklyTaskDigest' as const,
    label: 'Weekly Digest',
    description: 'Weekly summary of pending tasks',
  },
  {
    key: 'findingNotifications' as const,
    label: 'Finding Updates',
    description: 'When audit findings are created or updated',
  },
  {
    key: 'complianceDigest' as const,
    label: 'Compliance Digest',
    description: 'Summary of what needs attention across the program',
  },
  {
    key: 'ownershipAssignments' as const,
    label: 'Ownership',
    description: 'When a user is made owner of a risk, vendor, asset or control',
  },
  {
    key: 'slaAlerts' as const,
    label: 'SLA Alerts',
    description: 'When vulnerabilities, reviews or requests near or pass their deadline',
  },
] as const;

export type NotificationKey = (typeof NOTIFICATION_TYPES)[number]['key'];

export interface RoleNotificationConfig {
  role: string;
  label: string;
  isCustom: boolean;
  notifications: Record<NotificationKey, boolean>;
}
