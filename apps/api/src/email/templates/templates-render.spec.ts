import { readdirSync } from 'fs';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AccessGrantedEmail } from './access-granted';
import { AccessReclaimEmail } from './access-reclaim';
import { AccessRequestNotificationEmail } from './access-request-notification';
import { AutomationBulkFailuresEmail } from './automation-bulk-failures';
import { AutomationFailuresEmail } from './automation-failures';
import { CommentMentionedEmail } from './comment-mentioned';
import { EmployeeSecurityTasksEmail } from './employee-security-tasks';
import { EvidenceAccessRequestSubmittedEmail } from './evidence-access-request-submitted';
import { EvidenceBulkReviewRequestedEmail } from './evidence-bulk-review-requested';
import { EvidenceExportReadyEmail } from './evidence-export-ready';
import { EvidenceReviewRequestedEmail } from './evidence-review-requested';
import { FindingNotificationEmail } from './finding-notification';
import { HipaaTrainingCompletedEmail } from './hipaa-training-completed';
import { InviteEmail } from './invite-member';
import { LoginEmailChangedEmail } from './login-email-changed';
import { NdaSigningEmail } from './nda-signing';
import { PolicyApprovalRequestedEmail } from './policy-approval-requested';
import { QuestionnaireReviewEmail } from './questionnaire-review';
import { TaskAssigneeChangedEmail } from './task-assignee-changed';
import { TaskBulkAssigneeChangedEmail } from './task-bulk-assignee-changed';
import { TaskBulkStatusChangedEmail } from './task-bulk-status-changed';
import { TaskItemAssignedEmail } from './task-item-assigned';
import { TaskItemMentionedEmail } from './task-item-mentioned';
import { TaskStatusChangedEmail } from './task-status-changed';
import { TrainingCompletedEmail } from './training-completed';
import { TrustDomainMisconfiguredEmail } from './trust-domain-misconfigured';
import { UnassignedItemsNotificationEmail } from './unassigned-items-notification';
import { WeeklyComplianceDigestEmail } from './weekly-compliance-digest';

const to = { toName: 'Ada', toEmail: 'ada@example.com' };
const org = 'Acme';
const url = 'https://app.example.com/x';
const date = new Date('2026-01-01T00:00:00Z');

// Every template in this folder, rendered with minimal props. A template that
// throws in render() (e.g. <Tailwind> without <head>) silently drops the email.
const templates: Record<string, () => ReactElement> = {
  'access-granted': () =>
    AccessGrantedEmail({ toName: 'Ada', organizationName: org, expiresAt: date, portalUrl: url }),
  'access-reclaim': () =>
    AccessReclaimEmail({ toName: 'Ada', organizationName: org, accessLink: url, expiresAt: date }),
  'access-request-notification': () =>
    AccessRequestNotificationEmail({
      organizationName: org,
      requesterName: 'Bob',
      requesterEmail: 'bob@example.com',
      reviewUrl: url,
    }),
  'automation-bulk-failures': () =>
    AutomationBulkFailuresEmail({
      ...to,
      organizationName: org,
      tasksUrl: url,
      tasks: [{ title: 'T', url, failedCount: 1, totalCount: 2 }],
    }),
  'automation-failures': () =>
    AutomationFailuresEmail({
      ...to,
      taskTitle: 'T',
      failedCount: 1,
      totalCount: 2,
      taskStatusChanged: true,
      organizationName: org,
      taskUrl: url,
    }),
  'comment-mentioned': () =>
    CommentMentionedEmail({
      ...to,
      commentContent: 'Hi',
      mentionedByName: 'Bob',
      entityName: 'Risk',
      entityRoutePath: 'risk',
      entityId: 'r1',
      organizationId: 'org_1',
      commentUrl: url,
    }),
  'employee-security-tasks': () =>
    EmployeeSecurityTasksEmail({
      toName: 'Ada',
      organizationName: org,
      portalUrl: url,
      tasks: [{ title: 'Security training', detail: '1 of 4 videos' }],
      policies: [{ name: 'Acceptable use', url }],
    }),
  'evidence-access-request-submitted': () =>
    EvidenceAccessRequestSubmittedEmail({
      ...to,
      organizationName: org,
      requesterName: 'Bob',
      accountsNeeded: 'AWS',
      permissionsNeeded: 'read',
      reasonForRequest: 'audit',
      reviewUrl: url,
    }),
  'evidence-bulk-review-requested': () =>
    EvidenceBulkReviewRequestedEmail({
      ...to,
      taskCount: 1,
      submittedByName: 'Bob',
      organizationName: org,
      tasksUrl: url,
      tasks: [{ title: 'T', url }],
    }),
  'evidence-review-requested': () =>
    EvidenceReviewRequestedEmail({
      ...to,
      taskTitle: 'T',
      submittedByName: 'Bob',
      organizationName: org,
      taskUrl: url,
    }),
  'finding-notification': () =>
    FindingNotificationEmail({
      ...to,
      heading: 'H',
      message: 'M',
      taskTitle: 'T',
      organizationName: org,
      findingType: 'soc2',
      findingContent: 'C',
      findingUrl: url,
    }),
  'hipaa-training-completed': () =>
    HipaaTrainingCompletedEmail({
      email: 'ada@example.com',
      userName: 'Ada',
      organizationName: org,
      completedAt: date,
    }),
  'invite-member': () => InviteEmail({ organizationName: org, inviteLink: url }),
  'login-email-changed': () =>
    LoginEmailChangedEmail({ organizationName: org, oldEmail: 'a@x.com', newEmail: 'b@x.com' }),
  'nda-signing': () => NdaSigningEmail({ toName: 'Ada', organizationName: org, ndaSigningLink: url }),
  'policy-approval-requested': () =>
    PolicyApprovalRequestedEmail({
      ...to,
      kind: 'rejected',
      policyName: 'P',
      version: 2,
      actorName: 'Bob',
      organizationName: org,
      policyUrl: url,
      comment: 'Fix section 3',
    }),
  'questionnaire-review': () =>
    QuestionnaireReviewEmail({ preview: 'P', heading: 'H', message: 'M', ctaUrl: url, ctaLabel: 'Go' }),
  'task-assignee-changed': () =>
    TaskAssigneeChangedEmail({
      ...to,
      taskTitle: 'T',
      oldAssigneeName: 'A',
      newAssigneeName: 'B',
      changedByName: 'C',
      organizationName: org,
      taskUrl: url,
    }),
  'task-bulk-assignee-changed': () =>
    TaskBulkAssigneeChangedEmail({
      ...to,
      taskCount: 2,
      newAssigneeName: 'B',
      changedByName: 'C',
      organizationName: org,
      tasksUrl: url,
    }),
  'task-bulk-status-changed': () =>
    TaskBulkStatusChangedEmail({
      ...to,
      taskCount: 2,
      newStatus: 'done',
      changedByName: 'C',
      organizationName: org,
      tasksUrl: url,
    }),
  'task-item-assigned': () =>
    TaskItemAssignedEmail({ ...to, taskTitle: 'T', assignedByName: 'B', organizationName: org, taskUrl: url }),
  'task-item-mentioned': () =>
    TaskItemMentionedEmail({
      ...to,
      taskTitle: 'T',
      mentionedByName: 'B',
      entityName: 'Vendor',
      entityRoutePath: 'vendors',
      entityId: 'v1',
      organizationId: 'org_1',
      taskUrl: url,
    }),
  'task-status-changed': () =>
    TaskStatusChangedEmail({
      ...to,
      taskTitle: 'T',
      oldStatus: 'todo',
      newStatus: 'done',
      changedByName: 'C',
      organizationName: org,
      taskUrl: url,
    }),
  'training-completed': () =>
    TrainingCompletedEmail({
      email: 'ada@example.com',
      userName: 'Ada',
      organizationName: org,
      completedAt: date,
    }),
  'trust-domain-misconfigured': () =>
    TrustDomainMisconfiguredEmail({
      toName: 'Ada',
      organizationName: org,
      domain: 'trust.example.com',
      settingsUrl: url,
    }),
  'unassigned-items-notification': () =>
    UnassignedItemsNotificationEmail({
      userName: 'Ada',
      organizationName: org,
      organizationId: 'org_1',
      removedMemberName: 'Bob',
      unassignedItems: [{ type: 'task', id: 't1', name: 'T' }],
    }),
  'evidence-export-ready': () =>
    EvidenceExportReadyEmail({
      email: 'ada@example.com',
      organizationName: org,
      frameworkName: 'ISO 27001',
      periodLabel: 'all time',
      downloadUrl: url,
      expiresInHours: 24,
    }),
  'weekly-compliance-digest': () =>
    WeeklyComplianceDigestEmail({
      userName: 'Ada',
      organizationName: org,
      organizationId: 'org_1',
      cards: [{ label: 'Tasks', needsAttention: 1, href: '/tasks' }],
      overdue: [],
      overdueCount: 0,
      dueSoon: [],
      dueSoonCount: 0,
      windowDays: 7,
    }),
};

describe('email templates', () => {
  beforeAll(() => {
    process.env.UNSUBSCRIBE_SECRET ??= 'test-secret';
  });

  it('has a render fixture for every template in the folder', () => {
    const files = readdirSync(__dirname)
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => f.replace(/\.tsx$/, ''));
    expect(Object.keys(templates).sort()).toEqual(files.sort());
  });

  it.each(Object.entries(templates))('renders %s to HTML', (_name, build) => {
    const html = renderToStaticMarkup(build());
    expect(html).toContain('<html');
    expect(html).toContain('<head');
  });
});
