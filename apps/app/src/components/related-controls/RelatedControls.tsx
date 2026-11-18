'use client';

import { usePermissions } from '@/hooks/use-permissions';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Section,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@trycompai/design-system';
import { Unlink } from '@trycompai/design-system/icons';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { LinkControlPicker } from './LinkControlPicker';
import { RequirementCodes } from './RequirementCodes';
import { type RelatedEntityType, useRelatedControls } from './use-related-controls';

const NOUN: Record<RelatedEntityType, string> = {
  policy: 'policy',
  task: 'task',
  evidence_form: 'form',
  isms_document: 'document',
};

interface RelatedControlsProps {
  entityType: RelatedEntityType;
  /** Policy, task or ISMS document id; for an evidence form, its form type. */
  entityId: string;
  /** Lock editing (e.g. a policy pending approval). */
  readOnly?: boolean;
  onChange?: () => void;
}

/**
 * "Related frameworks and controls" for a piece of evidence: each linked control
 * with the ISO 27001 / PCI DSS requirement codes it covers. A link counts for
 * every framework that maps the control (evidence once, map many).
 */
export function RelatedControls({ entityType, entityId, readOnly, onChange }: RelatedControlsProps) {
  const { orgId } = useParams<{ orgId: string }>();
  const { hasPermission } = usePermissions();
  const canRead = hasPermission('control', 'read');
  const canEdit = hasPermission('control', 'update') && !readOnly;
  const { controls, isLoading, error, link, unlink } = useRelatedControls({
    entityType,
    entityId,
    enabled: canRead,
  });
  const [pending, setPending] = useState(false);
  const [toRemove, setToRemove] = useState<{ id: string; name: string } | null>(null);
  const noun = NOUN[entityType];

  const handleLink = async (controlId: string) => {
    setPending(true);
    try {
      await link([controlId]);
      onChange?.();
      toast.success('Control linked for every framework that maps it');
    } catch {
      toast.error('Failed to link control');
    } finally {
      setPending(false);
    }
  };

  const handleConfirmUnlink = async () => {
    if (!toRemove) return;
    setPending(true);
    try {
      await unlink(toRemove.id);
      onChange?.();
      toast.success('Control unlinked');
    } catch {
      toast.error('Failed to unlink control');
    } finally {
      setPending(false);
      setToRemove(null);
    }
  };

  if (!canRead) return null;

  return (
    <Section
      title="Related controls"
      description={`Controls this ${noun} satisfies, with the ISO 27001 and PCI DSS requirements each one covers.`}
      actions={
        canEdit ? (
          <LinkControlPicker
            linkedIds={new Set(controls.map((c) => c.id))}
            disabled={pending}
            onSelect={handleLink}
          />
        ) : undefined
      }
    >
      {isLoading ? (
        <Skeleton style={{ height: 96 }} />
      ) : error ? (
        <Text size="sm" variant="muted">
          Could not load related controls. Refresh the page to try again.
        </Text>
      ) : controls.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No controls linked</EmptyTitle>
            <EmptyDescription>
              {canEdit
                ? `Link a control and this ${noun} counts toward every framework that maps it, so you capture the evidence once for ISO 27001 and PCI DSS.`
                : `This ${noun} is not linked to any control yet.`}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table variant="bordered">
          <TableHeader>
            <TableRow>
              <TableHead>Control</TableHead>
              <TableHead>Requirements</TableHead>
              <TableHead>Owner</TableHead>
              {canEdit && <TableHead style={{ width: 48 }} />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {controls.map((control) => (
              <TableRow key={control.id}>
                <TableCell>
                  <Link
                    href={`/${orgId}/controls/${control.id}`}
                    className="font-medium hover:underline"
                  >
                    {control.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <RequirementCodes frameworks={control.frameworks} max={6} />
                </TableCell>
                <TableCell>
                  <Text size="sm" variant={control.owner ? undefined : 'muted'}>
                    {control.owner
                      ? `${control.owner.name}${control.owner.deactivated ? ' (left)' : ''}`
                      : 'Unassigned'}
                  </Text>
                </TableCell>
                {canEdit && (
                  <TableCell style={{ width: 48 }}>
                    <button
                      type="button"
                      aria-label={`Unlink ${control.name}`}
                      title="Unlink control"
                      disabled={pending}
                      onClick={() => setToRemove({ id: control.id, name: control.name })}
                      className="text-destructive hover:bg-destructive/10 inline-flex h-7 w-7 items-center justify-center rounded"
                    >
                      <Unlink size={14} />
                    </button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <AlertDialog open={toRemove !== null} onOpenChange={(open) => !open && setToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlink control</AlertDialogTitle>
            <AlertDialogDescription>
              Unlink <strong>{toRemove?.name}</strong> from this {noun}? It stops counting for
              every framework that maps the control.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setToRemove(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmUnlink} variant="destructive">
              Unlink
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  );
}
