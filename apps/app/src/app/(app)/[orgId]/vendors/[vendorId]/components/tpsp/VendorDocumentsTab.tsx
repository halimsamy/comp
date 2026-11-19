'use client';

import { usePermissions } from '@/hooks/use-permissions';
import { useTaskItemActions } from '@/hooks/use-task-items';
import { useVendorDocuments, type VendorDocument } from '@/hooks/use-vendor-tpsp';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Spinner,
} from '@trycompai/design-system';
import {
  ChevronDown,
  ChevronUp,
  Download,
  Launch,
  MagicWand,
  TrashCan,
  Upload,
} from '@trycompai/design-system/icons';
import { useState } from 'react';
import { toast } from 'sonner';
import { DOCUMENT_TYPE_LABEL, expiryLabel, formatDate } from '../../../lib/vendor-tpsp';
import { UploadVendorDocumentSheet } from './UploadVendorDocumentSheet';
import { VendorDocumentSummaryPanel } from './VendorDocumentSummaryPanel';

const SUMMARIZABLE = new Set([
  'soc2_type1',
  'soc2_type2',
  'iso27001_certificate',
  'pci_aoc',
  'pentest_report',
]);

function DocumentRow({
  document,
  canUpdate,
  onDownload,
  onSummarize,
  onDelete,
  onCreateTask,
}: {
  document: VendorDocument;
  canUpdate: boolean;
  onDownload: () => void;
  onSummarize: () => void;
  onDelete: () => void;
  onCreateTask?: (title: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const expiry = expiryLabel({ expiresAt: document.expiresAt });
  const pending = document.aiSummaryStatus === 'pending';
  return (
    <li className="flex flex-col gap-3 py-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{DOCUMENT_TYPE_LABEL[document.type]}</Badge>
            <span className="truncate text-sm font-medium">{document.name}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {document.periodEnd && (
              <span>
                Period {formatDate(document.periodStart)} – {formatDate(document.periodEnd)}
              </span>
            )}
            <span>Uploaded {formatDate(document.createdAt)}</span>
            {pending && (
              <span className="flex items-center gap-1 text-primary">
                <Spinner /> Summarizing…
              </span>
            )}
            {document.aiSummaryStatus === 'failed' && (
              <span className="text-destructive">AI summary failed</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={expiry.variant}>{expiry.label}</Badge>
          {document.aiSummary && (
            <Button
              size="sm"
              variant="ghost"
              iconRight={expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              onClick={() => setExpanded(!expanded)}
            >
              AI summary
            </Button>
          )}
          {canUpdate && SUMMARIZABLE.has(document.type) && !pending && (
            <Button
              size="sm"
              variant="ghost"
              iconLeft={<MagicWand size={14} />}
              onClick={onSummarize}
            >
              {document.aiSummary ? 'Re-summarize' : 'Summarize'}
            </Button>
          )}
          <Button size="icon-sm" variant="ghost" aria-label="Download" onClick={onDownload}>
            <Download size={16} />
          </Button>
          {canUpdate && (
            <Button size="icon-sm" variant="ghost" aria-label="Delete document" onClick={onDelete}>
              <TrashCan size={16} />
            </Button>
          )}
        </div>
      </div>
      {expanded && document.aiSummary && (
        <VendorDocumentSummaryPanel summary={document.aiSummary} onCreateTask={onCreateTask} />
      )}
    </li>
  );
}

/** Typed vendor documents with expiry tracking and AI summaries (ISO A.5.19-A.5.22, PCI 12.8). */
export function VendorDocumentsTab({
  vendorId,
  canUpdate,
  trustUrl,
}: {
  vendorId: string;
  canUpdate: boolean;
  /** The vendor's trust center, where SOC 2 / ISO / AOC reports are usually requested. */
  trustUrl?: string | null;
}) {
  const { hasPermission } = usePermissions();
  const { createTaskItem } = useTaskItemActions();
  const handleCreateTask = async (title: string) => {
    try {
      await createTaskItem({ title: title.slice(0, 200), entityId: vendorId, entityType: 'vendor' });
      toast.success('Action created');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Failed to create the action');
      throw caught;
    }
  };
  const {
    documents,
    error,
    isLoading,
    uploadDocument,
    deleteDocument,
    summarizeDocument,
    getDownloadUrl,
  } = useVendorDocuments(vendorId);
  const [uploading, setUploading] = useState(false);
  const [toDelete, setToDelete] = useState<VendorDocument | null>(null);

  const handleAction = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      toast.success(success);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Something went wrong');
    }
  };

  const handleUpload: Parameters<typeof UploadVendorDocumentSheet>[0]['onUpload'] = async (
    input,
  ) => {
    try {
      await uploadDocument(input);
      toast.success('Document uploaded');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Upload failed');
      throw caught;
    }
  };

  const handleDownload = async (documentId: string) => {
    try {
      window.open(await getDownloadUrl(documentId), '_blank', 'noopener');
    } catch {
      toast.error('Could not download the document');
    }
  };

  const expiring = documents.filter((d) => d.expiringSoon).length;

  return (
    <section className="flex flex-col gap-4 rounded-md border border-border bg-background p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-normal tracking-[-0.01em]">Documents</h3>
            {expiring > 0 && <Badge variant="destructive">{expiring} expiring</Badge>}
          </div>
          <span className="text-xs text-muted-foreground">
            SOC 2 reports, ISO certificates, AOCs, DPAs and contracts. You get a renewal task 60
            days before a document expires.
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {trustUrl && (
            <a
              href={trustUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-muted"
            >
              <Launch size={14} /> Trust center
            </a>
          )}
          {canUpdate && (
            <Button iconLeft={<Upload size={16} />} onClick={() => setUploading(true)}>
              Upload document
            </Button>
          )}
        </div>
      </div>

      {error ? (
        <p className="text-sm text-muted-foreground">Couldn&apos;t load documents.</p>
      ) : isLoading && documents.length === 0 ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : documents.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No documents yet</EmptyTitle>
            <EmptyDescription>
              Upload the vendor&apos;s latest SOC 2 report, ISO 27001 certificate or PCI DSS AOC. AI
              reads the opinion, exceptions and your complementary controls for you.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {documents.map((document) => (
            <DocumentRow
              key={document.id}
              document={document}
              canUpdate={canUpdate}
              onDownload={() => void handleDownload(document.id)}
              onSummarize={() =>
                void handleAction(() => summarizeDocument(document.id), 'AI summary started')
              }
              onDelete={() => setToDelete(document)}
              onCreateTask={hasPermission('task', 'create') ? handleCreateTask : undefined}
            />
          ))}
        </ul>
      )}

      <UploadVendorDocumentSheet
        open={uploading}
        onOpenChange={setUploading}
        onUpload={handleUpload}
      />

      <AlertDialog open={Boolean(toDelete)} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document</AlertDialogTitle>
            <AlertDialogDescription>
              Delete &quot;{toDelete?.name}&quot; and its file? Auditors lose this evidence.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const doc = toDelete;
                setToDelete(null);
                if (doc) void handleAction(() => deleteDocument(doc.id), 'Document deleted');
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
