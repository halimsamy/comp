'use client';

import type { AuditRequest } from '@/hooks/use-audits';
import { apiClient } from '@/lib/api-client';
import { fileToBase64 } from '@/lib/file-utils';
import { Badge, Button, Stack, Text, Textarea } from '@trycompai/design-system';
import { Attachment, Checkmark, Renew, Upload } from '@trycompai/design-system/icons';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { REQUEST_STATUS_LABELS, formatDay, requestBadgeVariant } from '../../lib/audit-labels';

export interface RequestActions {
  respond: (input: { id: string; response: string }) => Promise<void>;
  decide: (input: { id: string; status: 'accepted' | 'open' }) => Promise<void>;
  upload: (input: {
    id: string;
    file: { fileName: string; fileType: string; fileData: string };
  }) => Promise<void>;
}

async function handleDownload(attachmentId: string) {
  const res = await apiClient.get<{ downloadUrl: string }>(`/v1/attachments/${attachmentId}/download`);
  if (res.data?.downloadUrl) window.open(res.data.downloadUrl, '_blank', 'noopener');
  else toast.error('Could not download the file');
}

/** One request: what the auditor asked, the team's answer and files, and the next action. */
export function AuditRequestCard({
  request,
  requirementLabel,
  canRespond,
  canDecide,
  actions,
}: {
  request: AuditRequest;
  requirementLabel: string | null;
  canRespond: boolean;
  canDecide: boolean;
  actions: RequestActions;
}) {
  const [response, setResponse] = useState(request.response ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const isOpen = request.status !== 'accepted';

  const run = async (key: string, action: () => Promise<void>, success: string) => {
    setBusy(key);
    try {
      await action();
      toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    const fileData = await fileToBase64(file);
    await run(
      'upload',
      () => actions.upload({ id: request.id, file: { fileName: file.name, fileType: file.type || 'application/octet-stream', fileData } }),
      'File attached',
    );
    if (fileInput.current) fileInput.current.value = '';
  };

  return (
    <div className="rounded-lg border border-border p-4">
      <Stack gap="3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <Stack gap="1">
            <Text size="sm" weight="semibold">
              {request.title}
            </Text>
            <Text size="xs" variant="muted">
              {requirementLabel ?? 'Whole audit'} · asked by{' '}
              {request.requestedBy?.name || request.requestedBy?.email || 'an auditor'} on{' '}
              {formatDay(request.createdAt)}
              {request.dueDate ? ` · due ${formatDay(request.dueDate)}` : ''}
            </Text>
          </Stack>
          <Badge variant={requestBadgeVariant(request.status)}>
            {REQUEST_STATUS_LABELS[request.status]}
          </Badge>
        </div>
        {request.description ? (
          <div className="whitespace-pre-wrap break-words">
            <Text size="sm">{request.description}</Text>
          </div>
        ) : null}
        {request.response && !(canRespond && isOpen) ? (
          <div className="rounded-md bg-muted/50 p-3 whitespace-pre-wrap break-words">
            <Text size="sm">{request.response}</Text>
          </div>
        ) : null}
        {request.attachments.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {request.attachments.map((file) => (
              <Button key={file.id} size="sm" variant="outline" iconLeft={<Attachment size={14} />} onClick={() => void handleDownload(file.id)}>
                {file.name}
              </Button>
            ))}
          </div>
        ) : null}
        {canRespond && isOpen ? (
          <Stack gap="2">
            <Textarea aria-label="Response" placeholder="Answer the auditor and attach files" value={response} onChange={(event) => setResponse(event.target.value)} maxLength={8000} />
            <div className="flex flex-wrap justify-end gap-2">
              <input ref={fileInput} type="file" hidden onChange={(event) => void handleFile(event.target.files?.[0])} />
              <Button size="sm" variant="outline" iconLeft={<Upload size={16} />} loading={busy === 'upload'} onClick={() => fileInput.current?.click()}>
                Attach file
              </Button>
              <Button size="sm" loading={busy === 'respond'} disabled={!response.trim()} onClick={() => void run('respond', () => actions.respond({ id: request.id, response: response.trim() }), 'Response sent')}>
                Send response
              </Button>
            </div>
          </Stack>
        ) : null}
        {canDecide && request.status === 'submitted' ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="outline" iconLeft={<Renew size={16} />} loading={busy === 'open'} onClick={() => void run('open', () => actions.decide({ id: request.id, status: 'open' }), 'Request reopened')}>
              Reopen
            </Button>
            <Button size="sm" iconLeft={<Checkmark size={16} />} loading={busy === 'accepted'} onClick={() => void run('accepted', () => actions.decide({ id: request.id, status: 'accepted' }), 'Request accepted')}>
              Accept
            </Button>
          </div>
        ) : null}
      </Stack>
    </div>
  );
}
