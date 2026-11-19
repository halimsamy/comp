'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ComplianceFramework } from './ComplianceFramework';
import {
  type LiveFrameworkStatusMap,
  type TrustFrameworkKey,
  type TrustFrameworkStatus,
  type TrustFrameworkValue,
  sortTrustFrameworks,
} from './trust-frameworks';

/** Built-in framework cards, the org's own frameworks first, each offering its live status. */
export function TrustFrameworkGrid({
  orgId,
  values: initialValues,
  liveStatus,
  certificateFiles,
  canUpdate,
  onSave,
  onFileUpload,
  onFilePreview,
}: {
  orgId: string;
  values: Record<TrustFrameworkKey, TrustFrameworkValue>;
  liveStatus: LiveFrameworkStatusMap;
  certificateFiles: Record<string, string | null>;
  canUpdate: boolean;
  onSave: (patch: Record<string, boolean | string>) => Promise<unknown>;
  onFileUpload: (file: File, frameworkKey: string) => Promise<void>;
  onFilePreview: (frameworkKey: string) => Promise<void>;
}) {
  // Saved values, so a one-click "Use live status" shows up without a reload.
  const [values, setValues] = useState(initialValues);

  const save = async ({
    key,
    title,
    next,
  }: {
    key: TrustFrameworkKey;
    title: string;
    next: Partial<TrustFrameworkValue>;
  }) => {
    const patch: Record<string, boolean | string> = {};
    if (next.enabled !== undefined) patch[key] = next.enabled;
    if (next.status !== undefined) patch[`${key}Status`] = next.status;
    try {
      await onSave(patch);
      setValues((prev) => ({ ...prev, [key]: { ...prev[key], ...next } }));
      toast.success(`${title} status updated`);
    } catch (error) {
      console.error('[trust framework update] failed', error);
      toast.error(`Failed to update ${title} status`, {
        description: error instanceof Error ? error.message : undefined,
      });
      throw error;
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {sortTrustFrameworks(liveStatus).map(({ key, title, description }) => {
        const live = liveStatus[key];
        return (
          <ComplianceFramework
            key={key}
            title={title}
            description={description}
            isEnabled={values[key].enabled}
            status={values[key].status}
            // Rejections reach the card, which rolls its optimistic value back.
            onStatusChange={(value) =>
              save({ key, title, next: { status: value as TrustFrameworkStatus } })
            }
            onToggle={(checked) => save({ key, title, next: { enabled: checked } })}
            fileName={certificateFiles[key]}
            onFileUpload={onFileUpload}
            onFilePreview={onFilePreview}
            frameworkKey={key}
            orgId={orgId}
            disabled={!canUpdate}
            liveStatus={live}
            onUseLiveStatus={
              live && canUpdate
                ? () => save({ key, title, next: { enabled: true, status: live } }).catch(() => {})
                : undefined
            }
          />
        );
      })}
    </div>
  );
}
