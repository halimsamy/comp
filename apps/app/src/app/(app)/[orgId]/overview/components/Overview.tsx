'use client';

import { usePermissions } from '@/hooks/use-permissions';
import type { FrameworkInstanceWithControls } from '@/lib/types/framework';
import { FrameworkEditorFramework, Policy, Task } from '@db';
import { AttentionGrid } from './attention/AttentionGrid';
import { ComplianceTrendCard } from './attention/ComplianceTrendCard';
import { DeadlinesCard } from './attention/DeadlinesCard';
import { FrameworksOverview } from './FrameworksOverview';
import { ToDoOverview } from './ToDoOverview';
import { FrameworkInstanceWithComplianceScore } from './types';

export interface PublishedPoliciesScore {
  totalPolicies: number;
  publishedPolicies: number;
  draftPolicies: Policy[];
  policiesInReview: Policy[];
  unpublishedPolicies: Policy[];
}

export interface DoneTasksScore {
  totalTasks: number;
  doneTasks: number;
  incompleteTasks: Task[];
}

export interface PeopleScore {
  totalMembers: number;
  completedMembers: number;
}

export interface DocumentsScore {
  totalDocuments: number;
  completedDocuments: number;
  outstandingDocuments: number;
}

export interface OverviewProps {
  frameworksWithControls: FrameworkInstanceWithControls[];
  frameworksWithCompliance: FrameworkInstanceWithComplianceScore[];
  allFrameworks: FrameworkEditorFramework[];
  organizationId: string;
  publishedPoliciesScore: PublishedPoliciesScore;
  doneTasksScore: DoneTasksScore;
  documentsScore: DocumentsScore;
  peopleScore: PeopleScore;
  currentMember: { id: string; role: string } | null;
  onboardingTriggerJobId: string | null;
}

export const Overview = ({
  frameworksWithControls,
  frameworksWithCompliance,
  allFrameworks,
  organizationId,
  publishedPoliciesScore,
  doneTasksScore,
  documentsScore,
  peopleScore,
  currentMember,
  onboardingTriggerJobId,
}: OverviewProps) => {
  const overallComplianceScore = calculateOverallComplianceScore({
    publishedPolicies: publishedPoliciesScore.publishedPolicies,
    totalPolicies: publishedPoliciesScore.totalPolicies,
    doneTasks: doneTasksScore.doneTasks,
    totalTasks: doneTasksScore.totalTasks,
    completedDocuments: documentsScore.completedDocuments,
    totalDocuments: documentsScore.totalDocuments,
    completedMembers: peopleScore.completedMembers,
    totalMembers: peopleScore.totalMembers,
  });

  const { hasPermission } = usePermissions();
  // The monitoring endpoints are gated by app:read; the overview route only needs framework:read.
  const canReadProgram = hasPermission('app', 'read');

  return (
    <div className="flex flex-col gap-6">
      {canReadProgram && <AttentionGrid organizationId={organizationId} />}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <FrameworksOverview
          frameworksWithControls={frameworksWithControls}
          frameworksWithCompliance={frameworksWithCompliance}
          overallComplianceScore={overallComplianceScore}
          allFrameworks={allFrameworks}
          organizationId={organizationId}
        />
        {canReadProgram && <DeadlinesCard organizationId={organizationId} />}
        {canReadProgram && <ComplianceTrendCard />}
        <ToDoOverview
          totalPolicies={publishedPoliciesScore.totalPolicies}
          totalTasks={doneTasksScore.totalTasks}
          remainingPolicies={
            publishedPoliciesScore.totalPolicies - publishedPoliciesScore.publishedPolicies
          }
          remainingTasks={doneTasksScore.totalTasks - doneTasksScore.doneTasks}
          unpublishedPolicies={publishedPoliciesScore.unpublishedPolicies}
          incompleteTasks={doneTasksScore.incompleteTasks}
          policiesInReview={publishedPoliciesScore.policiesInReview}
          organizationId={organizationId}
          currentMember={currentMember}
          onboardingTriggerJobId={onboardingTriggerJobId}
        />
      </div>
    </div>
  );
};

function calculateOverallComplianceScore({
  publishedPolicies,
  totalPolicies,
  doneTasks,
  totalTasks,
  completedDocuments,
  totalDocuments,
  completedMembers,
  totalMembers,
}: {
  publishedPolicies: number;
  totalPolicies: number;
  doneTasks: number;
  totalTasks: number;
  completedDocuments: number;
  totalDocuments: number;
  completedMembers: number;
  totalMembers: number;
}) {
  const rows = [
    { done: publishedPolicies, total: totalPolicies },
    { done: doneTasks, total: totalTasks },
    { done: completedDocuments, total: totalDocuments },
    { done: completedMembers, total: totalMembers },
  ];
  const rowsWithData = rows.filter((row) => row.total > 0);
  if (rowsWithData.length === 0) return 0;

  const sumPercentages = rowsWithData.reduce((sum, row) => {
    return sum + Math.round((row.done / row.total) * 100);
  }, 0);

  return Math.round(sumPercentages / rowsWithData.length);
}
