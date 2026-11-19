'use client';

import { Card } from '@trycompai/ui';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useSOAAutoFill } from '../hooks/useSOAAutoFill';
import { useSOADocument } from '../hooks/useSOADocument';
import type { Member, User } from '@db';
import { SOADocumentInfo } from './SOADocumentInfo';
import { SOAPendingApprovalAlert } from './SOAPendingApprovalAlert';
import { SubmitApprovalDialog } from './SubmitApprovalDialog';
import { SOATable } from './SOATable';
import type { SOAFieldSavePayload } from './EditableSOAFields';
import type { FrameworkWithLatestDocument } from '../types';
import { useSoaRequirementLinks } from '../hooks/useSoaRequirementLinks';
import { listUndecidedCodes, toAnnexCode } from './soa-display';
import { toAnswersMap, withAnsweredCount } from './soa-document-cache';
import type { SOAColumn, SOAQuestion } from './soa-row-types';

type Framework = FrameworkWithLatestDocument['framework'];
type Configuration = FrameworkWithLatestDocument['configuration'];
type Document = FrameworkWithLatestDocument['document'];

// More flexible configuration type that doesn't require framework property
type FlexibleConfiguration = Configuration & {
  framework?: Framework;
};

interface SOAFrameworkTableProps {
  framework: Framework;
  configuration: FlexibleConfiguration;
  document: Document | null;
  organizationId: string;
  isFullyRemote?: boolean;
  canApprove?: boolean;
  approver?: (Member & { user: User }) | null;
  isPendingApproval?: boolean;
  canCurrentUserApprove?: boolean;
  currentMemberId?: string | null;
  ownerAdminMembers?: (Member & { user: User })[];
  /** The org's ISO 27001 instance, for requirement links and implementation status. */
  frameworkInstanceId?: string | null;
}

type SOADocumentInfoDocument = Parameters<typeof SOADocumentInfo>[0]['document'];

export function SOAFrameworkTable({
  framework,
  configuration,
  document,
  organizationId,
  isFullyRemote = false,
  canApprove = false,
  approver = null,
  isPendingApproval = false,
  canCurrentUserApprove = false,
  currentMemberId = null,
  ownerAdminMembers = [],
  frameworkInstanceId = null,
}: SOAFrameworkTableProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showUndecidedOnly, setShowUndecidedOnly] = useState(false);
  const rowLinks = useSoaRequirementLinks({ orgId: organizationId, frameworkInstanceId });

  // Deep links from requirement pages (#A.5.1) need the full table.
  useEffect(() => {
    if (window.location.hash.startsWith('#A.')) setIsExpanded(true);
  }, []);

  const {
    document: swrDocument,
    approve,
    decline,
    submitForApproval,
    mutate: mutateSOADocument,
  } = useSOADocument({
    documentId: document?.id ?? null,
    organizationId,
    fallbackData: document,
  });

  // Derive state from SWR-cached document (updates after mutations)
  const resolvedDocument = swrDocument ?? document;
  const derivedIsPendingApproval = resolvedDocument
    ? resolvedDocument.status === 'needs_review'
    : isPendingApproval;
  const derivedApproverId = (resolvedDocument?.approverId ?? document?.approverId) as string | null | undefined;
  // Resolve the approver member from the list using the derived approverId
  const derivedApprover = derivedApproverId
    ? ownerAdminMembers.find((m) => m.id === derivedApproverId) ?? approver
    : null;
  const derivedCanCurrentUserApprove = derivedIsPendingApproval && derivedApproverId === currentMemberId;

  const columns = configuration.columns as SOAColumn[];
  const questions = configuration.questions as SOAQuestion[];

  // Applicability + justification are per-organization values that live on the
  // answer, so the table reads them from here — never from the shared configuration.
  const [answersMap, setAnswersMap] = useState(() => toAnswersMap(document?.answers));

  // Update answersMap when the live document changes
  useEffect(() => {
    if (Array.isArray(resolvedDocument?.answers)) setAnswersMap(toAnswersMap(resolvedDocument.answers));
  }, [resolvedDocument?.answers]);

  const handleAnswerUpdate = (questionId: string, payload: SOAFieldSavePayload) => {
    const existingAnswer = answersMap.get(questionId);
    const previousIsApplicable =
      existingAnswer?.savedIsApplicable ??
      processedResults.get(questionId)?.isApplicable ??
      existingAnswer?.isApplicable ??
      null;

    setAnswersMap((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(questionId);
      newMap.set(questionId, {
        answer: payload.justification,
        answerVersion: existing ? existing.answerVersion + 1 : 1,
        savedIsApplicable: payload.isApplicable,
        inheritedVendorId: payload.inheritedVendorId ?? null,
      });
      return newMap;
    });

    const nextIsApplicable = payload.isApplicable ?? null;
    const delta =
      previousIsApplicable === null && nextIsApplicable !== null
        ? 1
        : previousIsApplicable !== null && nextIsApplicable === null
          ? -1
          : 0;
    void mutateSOADocument(
      (current) => withAnsweredCount(current, { answered: (count) => count + delta }),
      false,
    );
  };

  const [isSubmitApprovalDialogOpen, setIsSubmitApprovalDialogOpen] = useState(false);
  const [selectedApproverId, setSelectedApproverId] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { isAutoFilling: isAutoFillingSSE, questionStatuses, processedResults, triggerAutoFill } = useSOAAutoFill({
    questions,
    documentId: document?.id || '',
    organizationId,
    onUpdate: ({ total, answered } = {}) => {
      // Keep SOA info card in sync immediately after auto-fill completion.
      void mutateSOADocument((current) => withAnsweredCount(current, { total, answered }), false);
    },
  });

  const undecidedCodes = listUndecidedCodes({
    questions,
    answersMap,
    processedResults,
    isFullyRemote,
  });
  const undecided = new Set(undecidedCodes);
  const undecidedQuestions = questions.filter((q) =>
    undecided.has(toAnnexCode(q.columnMapping.closure)),
  );
  const visibleQuestions = showUndecidedOnly ? undecidedQuestions : questions;

  // Document should always exist at this point
  if (!document) {
    return (
      <Card className="p-8">
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        </div>
      </Card>
    );
  }

  // Use the resolved SWR document so approval status updates instantly without page refresh.
  const docForInfo = resolvedDocument as unknown as SOADocumentInfoDocument;

  const handleAutoFill = () => triggerAutoFill();
  const handleFillRemaining = () =>
    triggerAutoFill({ questionIds: undecidedQuestions.map((q) => q.id) });

  const runWithToast = async ({
    action,
    setBusy,
    success,
    failure,
  }: {
    action: () => Promise<unknown>;
    setBusy: (busy: boolean) => void;
    success: string;
    failure: string;
  }) => {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : failure);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleApprove = () =>
    runWithToast({
      action: approve,
      setBusy: setIsApproving,
      success: 'SOA document approved successfully',
      failure: 'Failed to approve SOA document',
    });

  const handleDecline = () =>
    runWithToast({
      action: decline,
      setBusy: setIsDeclining,
      success: 'SOA document declined successfully',
      failure: 'Failed to decline SOA document',
    });

  const handleSubmitForApproval = async () => {
    if (!selectedApproverId) return;
    const ok = await runWithToast({
      action: () => submitForApproval(selectedApproverId),
      setBusy: setIsSubmitting,
      success: 'SOA document submitted for approval successfully',
      failure: 'Failed to submit SOA document for approval',
    });
    if (!ok) return;
    setIsSubmitApprovalDialogOpen(false);
    setSelectedApproverId(null);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Pending Approval Alert */}
      {derivedIsPendingApproval && (
        <SOAPendingApprovalAlert
          approver={derivedApprover}
          currentMemberId={currentMemberId}
          approverId={derivedApproverId ?? null}
          canCurrentUserApprove={derivedCanCurrentUserApprove}
          isApproving={isApproving}
          isDeclining={isDeclining}
          onApprove={handleApprove}
          onDecline={handleDecline}
        />
      )}

      {/* Document Info */}
      <SOADocumentInfo
        document={docForInfo}
        approver={derivedApprover}
        isPendingApproval={derivedIsPendingApproval}
        canApprove={canApprove}
        isAutoFillingSSE={isAutoFillingSSE}
        onAutoFill={handleAutoFill}
        onFillRemaining={handleFillRemaining}
        undecidedCodes={undecidedCodes}
        showUndecidedOnly={showUndecidedOnly}
        onToggleUndecidedOnly={() => setShowUndecidedOnly((v) => !v)}
        onSubmitForApproval={() => setIsSubmitApprovalDialogOpen(true)}
      />

      {/* Table */}
      <SOATable
        columns={columns}
        questions={visibleQuestions}
        answersMap={answersMap}
        questionStatuses={questionStatuses}
        processedResults={processedResults}
        isFullyRemote={isFullyRemote}
        isExpanded={isExpanded}
        onToggleExpand={() => setIsExpanded(!isExpanded)}
        documentId={resolvedDocument?.id ?? document.id}
        isPendingApproval={derivedIsPendingApproval}
        organizationId={organizationId}
        rowLinks={rowLinks}
        onAnswerUpdate={handleAnswerUpdate}
      />

      {/* Submit for Approval Dialog */}
      <SubmitApprovalDialog
        open={isSubmitApprovalDialogOpen}
        onOpenChange={setIsSubmitApprovalDialogOpen}
        ownerAdminMembers={ownerAdminMembers}
        selectedApproverId={selectedApproverId}
        onApproverChange={setSelectedApproverId}
        onSubmit={handleSubmitForApproval}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
