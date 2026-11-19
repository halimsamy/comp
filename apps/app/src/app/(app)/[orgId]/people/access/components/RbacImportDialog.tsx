'use client';

import { type RbacImportGroup, useAccessRoleMutations } from '@/hooks/use-access-roles';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
  Text,
} from '@trycompai/design-system';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

/**
 * #172: turn the RBAC matrix form into systems and approved roles. The preview
 * shows which form names fold into one system; the user can rename each system
 * or keep merged names apart before anything is saved.
 */
export function RbacImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => Promise<void>;
}) {
  const { previewRbacImport, applyRbacImport } = useAccessRoleMutations();
  const [groups, setGroups] = useState<RbacImportGroup[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setGroups(null);
      return;
    }
    previewRbacImport()
      .then(({ preview }) => setGroups(Array.isArray(preview) ? preview : []))
      .catch((caught: unknown) => {
        toast.error(caught instanceof Error ? caught.message : 'Failed to read the RBAC matrix');
        onOpenChange(false);
      });
  }, [open, previewRbacImport, onOpenChange]);

  const handleRename = (index: number, name: string) =>
    setGroups((current) => current?.map((g, i) => (i === index ? { ...g, name } : g)) ?? null);

  // Keep the names apart: each source becomes its own system.
  const handleSplit = (index: number) =>
    setGroups((current) =>
      current?.flatMap((g, i) =>
        i === index ? g.sources.map((source) => ({ name: source, sources: [source], roleCount: 0, merged: false })) : [g],
      ) ?? null,
    );

  const handleConfirm = async () => {
    if (!groups) return;
    setSaving(true);
    try {
      const result = await applyRbacImport(
        groups.filter((g) => g.name.trim()).map((g) => ({ name: g.name.trim(), sources: g.sources })),
      );
      await onImported();
      toast.success(`${result.roles} roles imported into ${result.systems} new systems`);
      onOpenChange(false);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Failed to import the RBAC matrix');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Import the RBAC matrix</DialogTitle>
          <DialogDescription>
            Each system of your RBAC matrix form becomes a system with its approved roles. Accounts holding
            other roles are then flagged in access reviews. Check the merged names before importing.
          </DialogDescription>
        </DialogHeader>
        {!groups ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : groups.length === 0 ? (
          <Text variant="muted">The RBAC matrix form has no rows yet.</Text>
        ) : (
          <div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto">
            {groups.map((group, index) => (
              <div key={group.sources.join('|')} className="flex flex-col gap-2 rounded-md border border-border p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    value={group.name}
                    aria-label="System name"
                    onChange={(e) => handleRename(index, e.target.value)}
                  />
                  {group.merged && (
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="outline">{group.sources.length} names merged</Badge>
                      <Button size="sm" variant="ghost" onClick={() => handleSplit(index)}>
                        Keep apart
                      </Button>
                    </div>
                  )}
                </div>
                <Text size="xs" variant="muted">
                  From: {group.sources.join(' · ')}
                  {group.roleCount > 0 ? ` · ${group.roleCount} roles` : ''}
                </Text>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleConfirm()} loading={saving} disabled={!groups || groups.length === 0}>
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
