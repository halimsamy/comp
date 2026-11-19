'use client';

import { useApiSWR } from '@/hooks/use-api-swr';
import {
  Button,
  Checkbox,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@trycompai/design-system';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { type BulkSetOwner, bulkResultMessage } from './ControlsBulkBar';

export interface OwnerSuggestion {
  controlId: string;
  controlName: string;
  code: string;
  memberId: string;
  memberName: string;
  roleName: string;
}

/** Applies accepted suggestions, one bulk call per suggested owner. */
export async function applySuggestions({
  suggestions,
  assignLinkedWork,
  bulkSetOwner,
}: {
  suggestions: OwnerSuggestion[];
  assignLinkedWork: boolean;
  bulkSetOwner: BulkSetOwner;
}) {
  const byMember = new Map<string, string[]>();
  for (const s of suggestions) byMember.set(s.memberId, [...(byMember.get(s.memberId) ?? []), s.controlId]);
  const total = { controls: 0, tasks: 0, policies: 0 };
  for (const [ownerId, controlIds] of byMember) {
    const result = await bulkSetOwner({ controlIds, ownerId, assignLinkedWork });
    total.controls += result.controls;
    total.tasks += result.tasks;
    total.policies += result.policies;
  }
  return total;
}

/** "Suggest owners": ISMS role holders per control theme, confirmed in a table before saving. */
export function SuggestOwnersSheet({
  open,
  onOpenChange,
  bulkSetOwner,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bulkSetOwner: BulkSetOwner;
}) {
  const { data, isLoading, error } = useApiSWR<{ data: OwnerSuggestion[]; hasRoles: boolean }>(
    '/v1/controls/owner-suggestions',
    { enabled: open, revalidateOnFocus: false },
  );
  const suggestions = Array.isArray(data?.data?.data) ? data.data.data : [];
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [assignLinkedWork, setAssignLinkedWork] = useState(true);
  const [saving, setSaving] = useState(false);

  // Re-select everything whenever a fresh list arrives.
  useEffect(() => {
    const list = data?.data?.data;
    setAccepted(new Set(Array.isArray(list) ? list.map((s) => s.controlId) : []));
  }, [data]);

  const toggle = (controlId: string) =>
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(controlId)) next.delete(controlId);
      else next.add(controlId);
      return next;
    });

  const handleApply = async () => {
    setSaving(true);
    try {
      const result = await applySuggestions({
        suggestions: suggestions.filter((s) => accepted.has(s.controlId)),
        assignLinkedWork,
        bulkSetOwner,
      });
      toast.success(bulkResultMessage(result));
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to assign owners');
    } finally {
      setSaving(false);
    }
  };

  const body = () => {
    if (isLoading) return <Text size="sm" variant="muted">Finding owners…</Text>;
    if (error || data?.error) return <Text size="sm" variant="destructive">Could not load suggestions.</Text>;
    if (data?.data?.hasRoles === false) {
      return <Text size="sm" variant="muted">Assign people to ISMS roles (5.3 Roles and responsibilities) first.</Text>;
    }
    if (suggestions.length === 0) return <Text size="sm" variant="muted">Every control already has an owner.</Text>;
    return (
      <div className="overflow-x-auto">
        <Table variant="bordered">
          <TableHeader>
            <TableRow>
              <TableHead />
              <TableHead>Control</TableHead>
              <TableHead>Suggested owner</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {suggestions.map((s) => (
              <TableRow key={s.controlId}>
                <TableCell>
                  <Checkbox
                    aria-label={`Accept ${s.controlName}`}
                    checked={accepted.has(s.controlId)}
                    onCheckedChange={() => toggle(s.controlId)}
                  />
                </TableCell>
                <TableCell>
                  <span className="text-sm">{s.controlName}</span>
                  {s.code ? <span className="ml-2 font-mono text-xs text-muted-foreground">{s.code}</span> : null}
                </TableCell>
                <TableCell>
                  <span className="text-sm">{s.memberName}</span>
                  <span className="block text-xs text-muted-foreground">{s.roleName}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Suggest owners</SheetTitle>
          <SheetDescription>
            Controls without an owner, matched to the person in the ISMS role for their theme. Untick
            any you want to assign yourself.
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          <div className="flex flex-col gap-4">
            {body()}
            {suggestions.length > 0 && (
              <>
                <label className="flex cursor-pointer items-center gap-2">
                  <Checkbox checked={assignLinkedWork} onCheckedChange={(c) => setAssignLinkedWork(c === true)} />
                  <span className="text-sm">Also assign their unassigned tasks and policies</span>
                </label>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleApply} loading={saving} disabled={accepted.size === 0}>
                    {`Assign ${accepted.size}`}
                  </Button>
                </div>
              </>
            )}
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
