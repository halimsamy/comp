'use client';

import { usePermissions } from '@/hooks/use-permissions';
import type { Member, Policy, PolicyVersion, User } from '@db';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  HStack,
  Stack,
  Text,
} from '@trycompai/design-system';
import { Add, ChevronLeft, ChevronRight, Document } from '@trycompai/design-system/icons';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { usePolicyVersions, type PolicyVersionWithPublisher } from '../hooks/usePolicyVersions';
import { PolicyVersionActions } from './PolicyVersionActions';
import { PolicyVersionCard, type VersionState } from './PolicyVersionCard';
import { PublishVersionDialog } from './PublishVersionDialog';
import { SubmitApprovalDialog } from './SubmitApprovalDialog';

const VERSIONS_PER_PAGE = 10;

type PolicyWithVersion = Policy & {
  currentVersion?: (PolicyVersion & { publishedBy: (Member & { user: User }) | null }) | null;
  approver: (Member & { user: User }) | null;
};

interface PolicyVersionsTabProps {
  policy: PolicyWithVersion;
  versions: PolicyVersionWithPublisher[];
  assignees: (Member & { user: User })[];
  isPendingApproval: boolean;
  onMutate?: () => void;
}

export function PolicyVersionsTab({
  policy,
  versions,
  assignees,
  isPendingApproval,
  onMutate,
}: PolicyVersionsTabProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { orgId } = useParams<{ orgId: string }>();

  const { deleteVersion, submitForApproval } = usePolicyVersions({
    policyId: policy.id,
    organizationId: orgId,
  });
  const { hasPermission } = usePermissions();
  const canPublishPolicy = hasPermission('policy', 'update');
  const canDeletePolicy = hasPermission('policy', 'delete');
  const canUpdatePolicy = hasPermission('policy', 'update');

  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
  const [deleteVersionDialogOpen, setDeleteVersionDialogOpen] = useState(false);
  const [versionToDelete, setVersionToDelete] = useState<PolicyVersionWithPublisher | null>(null);
  const [isDeletingVersion, setIsDeletingVersion] = useState(false);
  const [pendingSetActiveVersion, setPendingSetActiveVersion] = useState<PolicyVersionWithPublisher | null>(null);
  const [versionApprovalApproverId, setVersionApprovalApproverId] = useState<string | null>(null);
  const [settingActive, setSettingActive] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Current version first, then the pending one, then newest first.
  const sortedVersions = useMemo(() => {
    const rank = (id: string) =>
      id === policy.currentVersionId ? 0 : id === policy.pendingVersionId ? 1 : 2;
    return [...versions].sort((a, b) => rank(a.id) - rank(b.id) || b.version - a.version);
  }, [versions, policy.currentVersionId, policy.pendingVersionId]);

  const totalPages = Math.ceil(sortedVersions.length / VERSIONS_PER_PAGE);
  const paginatedVersions = useMemo(
    () => sortedVersions.slice((currentPage - 1) * VERSIONS_PER_PAGE, currentPage * VERSIONS_PER_PAGE),
    [sortedVersions, currentPage],
  );

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) setCurrentPage(1);
  }, [totalPages, currentPage]);

  const handleRequestSetActive = (version: PolicyVersionWithPublisher) => {
    setPendingSetActiveVersion(version);
    setVersionApprovalApproverId(policy.approverId);
  };

  const handleConfirmSetActive = async () => {
    if (!pendingSetActiveVersion) return;
    if (!versionApprovalApproverId) {
      toast.error('Please select an approver');
      return;
    }

    const versionToPublish = pendingSetActiveVersion;
    setSettingActive(versionToPublish.id);
    try {
      await submitForApproval(versionToPublish.id, versionApprovalApproverId);
      toast.success(`Version ${versionToPublish.version} submitted for approval`);
      setPendingSetActiveVersion(null);
      setVersionApprovalApproverId(null);
      onMutate?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit version for approval');
    } finally {
      setSettingActive(null);
    }
  };

  const handleDeleteVersion = async () => {
    if (!versionToDelete) return;

    setIsDeletingVersion(true);
    try {
      await deleteVersion(versionToDelete.id);
      toast.success(`Version ${versionToDelete.version} deleted`);
      setDeleteVersionDialogOpen(false);
      setVersionToDelete(null);
      onMutate?.();
    } catch {
      toast.error('Failed to delete version');
    } finally {
      setIsDeletingVersion(false);
    }
  };

  const handleEditVersion = (version: PolicyVersionWithPublisher) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', 'content');
    params.set('versionId', version.id);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <>
      <Stack gap="md">
        <HStack justify="between" align="center">
          <Text weight="semibold" size="lg">Version History</Text>
          {canUpdatePolicy && (
            <Button size="lg" iconLeft={<Add size={16} />} onClick={() => setIsPublishDialogOpen(true)}>
              Create Version
            </Button>
          )}
        </HStack>
        {sortedVersions.length === 0 ? (
          <div className="py-8 text-center">
            <div className="mb-2 flex justify-center text-muted-foreground opacity-50">
              <Document size={32} />
            </div>
            <Text variant="muted">No versions yet</Text>
            <Text size="sm" variant="muted">
              Create a version to start tracking changes
            </Text>
          </div>
        ) : (
          <Stack gap="sm">
            {paginatedVersions.map((version) => {
              const isCurrentVersion = version.id === policy.currentVersionId;
              const isPendingVersion = version.id === policy.pendingVersionId;
              
              // The published version keeps its state while a newer one is pending.
              const isPublished = isCurrentVersion && !!policy.lastPublishedAt;
              const canDelete = canDeletePolicy && !isCurrentVersion && !isPendingVersion;
              const hasPendingVersion = Boolean(policy.pendingVersionId) && isPendingApproval;
              // Can publish other versions (not current, not pending)
              const canPublishOther = canPublishPolicy && !isCurrentVersion && !isPendingVersion && !hasPendingVersion;
              // Can publish current version if it's in draft or needs_review status
              const canPublishCurrent = canPublishPolicy && isCurrentVersion && (policy.status === 'draft' || policy.status === 'needs_review') && !hasPendingVersion;
              const canPublish = canPublishOther || canPublishCurrent;
              const state: VersionState = isPublished
                ? 'published'
                : isPendingVersion
                  ? 'pending'
                  : version.rejectedAt
                    ? 'rejected'
                    : 'draft';

              return (
                <PolicyVersionCard
                  key={version.id}
                  version={version}
                  state={state}
                  actions={
                    <PolicyVersionActions
                      canPublish={canPublish}
                      canDelete={canDelete}
                      canUpdate={canUpdatePolicy}
                      isPublished={isPublished}
                      onPublish={() => handleRequestSetActive(version)}
                      onEdit={() => handleEditVersion(version)}
                      onDelete={() => {
                        setVersionToDelete(version);
                        setDeleteVersionDialogOpen(true);
                      }}
                    />
                  }
                />
              );
            })}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="pt-4 border-t border-border">
                <HStack justify="between" align="center">
                  <Text size="sm" variant="muted">
                    Showing {(currentPage - 1) * VERSIONS_PER_PAGE + 1} to{' '}
                    {Math.min(currentPage * VERSIONS_PER_PAGE, sortedVersions.length)} of{' '}
                    {sortedVersions.length} versions
                  </Text>
                  <HStack gap="sm" align="center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft size={16} />
                      Previous
                    </Button>
                    <Text size="sm" variant="muted">
                      Page {currentPage} of {totalPages}
                    </Text>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                      <ChevronRight size={16} />
                    </Button>
                  </HStack>
                </HStack>
              </div>
            )}
          </Stack>
        )}
      </Stack>

      {/* Create Version Dialog */}
      <PublishVersionDialog
        policyId={policy.id}
        currentVersionNumber={policy.currentVersion?.version}
        isOpen={isPublishDialogOpen}
        onClose={() => setIsPublishDialogOpen(false)}
        onSuccess={() => {
          onMutate?.();
        }}
      />

      {/* Delete Version Dialog */}
      <AlertDialog open={deleteVersionDialogOpen} onOpenChange={setDeleteVersionDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Version?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete version {versionToDelete?.version}? This action cannot be undone.
              {versionToDelete?.pdfUrl && ' The associated PDF file will also be deleted.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setVersionToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteVersion}
              variant="destructive"
              loading={isDeletingVersion}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SubmitApprovalDialog
        isOpen={pendingSetActiveVersion !== null}
        onOpenChange={(open) => {
          if (open) return;
          setPendingSetActiveVersion(null);
          setVersionApprovalApproverId(null);
        }}
        assignees={assignees}
        selectedApproverId={versionApprovalApproverId}
        onSelectedApproverIdChange={setVersionApprovalApproverId}
        onConfirm={handleConfirmSetActive}
        isSubmitting={!!settingActive}
        title={`Publish version ${pendingSetActiveVersion?.version ?? ''}`}
        description="The approver gets an email and an in-app notification. Once approved, this version becomes the published version employees acknowledge."
      />
    </>
  );
}
