'use client';

import type { RevocationSystem } from '@/hooks/use-access-revocations';
import { Badge, Button } from '@trycompai/design-system';
import { Checkmark, DocumentAttachment } from '@trycompai/design-system/icons';
import { format } from 'date-fns';
import { useRef, useState } from 'react';

const MONOGRAM_COLORS = [
  'bg-blue-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-amber-500',
  'bg-red-500',
  'bg-teal-500',
  'bg-indigo-500',
  'bg-pink-500',
];

function getMonogramColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return MONOGRAM_COLORS[Math.abs(hash) % MONOGRAM_COLORS.length];
}

export function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="bg-muted py-2 pl-4 pr-3.5 sm:pl-11">
      <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
        <span className="text-muted-foreground/60"> &middot; {count}</span>
      </span>
    </div>
  );
}

function SystemMark({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  const [imgError, setImgError] = useState(false);
  if (logoUrl && !imgError) {
    return (
      <img
        src={logoUrl}
        alt=""
        className="h-[22px] w-[22px] shrink-0 rounded-sm object-contain"
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <div
      className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-sm text-[10px] font-bold text-white ${getMonogramColor(name)}`}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function SystemLabel({ system }: { system: RevocationSystem }) {
  const accounts = system.accounts.map((a) => `${a.name} (${a.status})`).join(', ');
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <SystemMark name={system.name} logoUrl={system.logoUrl} />
      <div className="min-w-0">
        <div className="truncate text-[13px]">{system.name}</div>
        {accounts && <div className="truncate text-xs text-muted-foreground">{accounts}</div>}
      </div>
    </div>
  );
}

const rowClass =
  'flex flex-col gap-2 border-b bg-background py-2.5 pl-4 pr-3.5 sm:flex-row sm:items-center sm:justify-between sm:pl-11';

export function PendingSystemRow({
  system,
  canEdit,
  isProcessing,
  onRevoke,
}: {
  system: RevocationSystem;
  canEdit: boolean;
  isProcessing: boolean;
  onRevoke: (file?: File) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onRevoke(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className={rowClass}>
      <SystemLabel system={system} />
      {canEdit && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => !isProcessing && fileInputRef.current?.click()}
            iconLeft={<DocumentAttachment size={12} />}
            disabled={isProcessing}
          >
            Attach evidence
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileSelected}
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.csv,.xlsx"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRevoke()}
            disabled={isProcessing}
            loading={isProcessing}
          >
            Confirm revoked
          </Button>
        </div>
      )}
    </div>
  );
}

export function RevokedSystemRow({
  system,
  canEdit,
  isProcessing,
  onUndo,
}: {
  system: RevocationSystem;
  canEdit: boolean;
  isProcessing: boolean;
  onUndo: () => void;
}) {
  const evidence = system.evidence[0];
  const confirmedBy = system.revokedBy?.name ?? (system.revokedBy ? system.revokedBy.email : 'Access inventory');
  return (
    <div className={rowClass}>
      <SystemLabel system={system} />
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        {system.stillActive && <Badge variant="destructive">Revoked but still active</Badge>}
        {evidence && (
          <a
            href={evidence.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <DocumentAttachment size={12} />
            <span className="underline decoration-dotted">{evidence.name}</span>
          </a>
        )}
        {system.revokedAt && (
          <span className="font-mono text-xs text-muted-foreground">
            {confirmedBy} &middot; {format(new Date(system.revokedAt), 'MMM d, yyyy')}
          </span>
        )}
        {canEdit && (
          <Button variant="outline" size="sm" onClick={onUndo} disabled={isProcessing} loading={isProcessing}>
            Undo
          </Button>
        )}
        {!system.stillActive && (
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Checkmark size={12} />
          </div>
        )}
      </div>
    </div>
  );
}
