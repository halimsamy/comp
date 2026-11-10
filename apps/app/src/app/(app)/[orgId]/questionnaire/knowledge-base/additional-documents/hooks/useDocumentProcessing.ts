'use client';

import { useJobRun } from '@/hooks/use-job-run';
import { useCallback, useEffect, useRef } from 'react';

interface UseDocumentProcessingOptions {
  processingRunId?: string | null;
  deletionRunId?: string | null;
  onProcessingComplete?: () => void;
  onDeletionComplete?: () => void;
}

/**
 * Hook to track document processing and deletion runs by polling their job runs.
 * The run ids come from the API response (e.g. processDocuments or deleteDocument).
 */
export function useDocumentProcessing({
  processingRunId,
  deletionRunId,
  onProcessingComplete,
  onDeletionComplete,
}: UseDocumentProcessingOptions) {
  // Use refs to avoid stale closure issues
  const onProcessingCompleteRef = useRef(onProcessingComplete);
  const onDeletionCompleteRef = useRef(onDeletionComplete);

  // Keep refs updated
  useEffect(() => {
    onProcessingCompleteRef.current = onProcessingComplete;
  }, [onProcessingComplete]);

  useEffect(() => {
    onDeletionCompleteRef.current = onDeletionComplete;
  }, [onDeletionComplete]);

  // Stable callbacks that use refs
  const handleProcessingComplete = useCallback(() => {
    onProcessingCompleteRef.current?.();
  }, []);

  const handleDeletionComplete = useCallback(() => {
    onDeletionCompleteRef.current?.();
  }, []);

  // Track processing run
  const { run: processingRun } = useJobRun(processingRunId, {
    enabled: !!processingRunId,
    onComplete: handleProcessingComplete,
  });

  // Track deletion run
  const { run: deletionRun } = useJobRun(deletionRunId, {
    enabled: !!deletionRunId,
    onComplete: handleDeletionComplete,
  });

  // Check if processing is active (handle orchestrator child tasks)
  const isProcessing = processingRun
    ? ['EXECUTING', 'QUEUED', 'PENDING', 'WAITING'].includes(processingRun.status)
    : false;

  const isDeleting = deletionRun
    ? ['EXECUTING', 'QUEUED', 'PENDING', 'WAITING'].includes(deletionRun.status)
    : false;

  return {
    processingRun,
    deletionRun,
    isProcessing,
    isDeleting,
    processingStatus: processingRun?.status,
    deletionStatus: deletionRun?.status,
  };
}
