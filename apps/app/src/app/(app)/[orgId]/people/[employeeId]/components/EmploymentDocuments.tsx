'use client';

import { useEmploymentEvidence } from '@/hooks/use-employment-evidence';
import { Button, HStack, Section, Stack, Text } from '@trycompai/design-system';
import { DocumentDownload, TrashCan, Upload } from '@trycompai/design-system/icons';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

interface EmploymentDocumentsProps {
  memberId: string;
  eventType: 'onboard' | 'offboard';
  canEdit: boolean;
}

const COPY = {
  onboard: {
    title: 'Onboarding documents',
    description:
      'Signed NDA, employment contract, candidate evaluation and other hiring records (ISO 27001 A.6.1, A.6.2).',
  },
  offboard: {
    title: 'Offboarding documents',
    description: 'Exit interview notes, signed return-of-assets forms and termination records.',
  },
} as const;

export function EmploymentDocuments({ memberId, eventType, canEdit }: EmploymentDocumentsProps) {
  const { attachments, isLoading, uploadEvidence, deleteEvidence, getDownloadUrl } =
    useEmploymentEvidence({ memberId, eventType });
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      await uploadEvidence(file);
      toast.success('Document uploaded');
    } catch {
      toast.error('Failed to upload document');
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleDownload = async (attachmentId: string) => {
    try {
      window.open(await getDownloadUrl(attachmentId), '_blank', 'noopener,noreferrer');
    } catch {
      toast.error('Failed to download document');
    }
  };

  const handleDelete = async (attachmentId: string) => {
    try {
      await deleteEvidence(attachmentId);
      toast.success('Document removed');
    } catch {
      toast.error('Failed to remove document');
    }
  };

  return (
    <Section
      title={COPY[eventType].title}
      description={COPY[eventType].description}
      actions={
        canEdit ? (
          <>
            <Button
              variant="outline"
              size="sm"
              iconLeft={<Upload size={14} />}
              loading={isUploading}
              onClick={() => inputRef.current?.click()}
            >
              Upload
            </Button>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              aria-label={`Upload ${COPY[eventType].title.toLowerCase()}`}
              onChange={handleFileSelect}
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
            />
          </>
        ) : undefined
      }
    >
      {isLoading && <Text variant="muted">Loading documents...</Text>}
      {!isLoading && attachments.length === 0 && (
        <div className="rounded-lg border border-dashed px-4 py-6 text-center">
          <Text variant="muted" size="sm">
            No documents yet.{canEdit ? ' Upload the signed copies so auditors can find them here.' : ''}
          </Text>
        </div>
      )}
      {attachments.length > 0 && (
        <Stack gap="2">
          {attachments.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{doc.name}</div>
                <Text size="xs" variant="muted">
                  Added {new Date(doc.createdAt).toLocaleDateString()}
                </Text>
              </div>
              <HStack gap="1">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Download ${doc.name}`}
                  onClick={() => handleDownload(doc.id)}
                >
                  <DocumentDownload size={14} />
                </Button>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove ${doc.name}`}
                    onClick={() => handleDelete(doc.id)}
                  >
                    <TrashCan size={14} />
                  </Button>
                )}
              </HStack>
            </div>
          ))}
        </Stack>
      )}
    </Section>
  );
}
