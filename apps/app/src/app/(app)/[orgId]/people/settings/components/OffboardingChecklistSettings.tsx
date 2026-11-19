'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/use-permissions';
import { useApi } from '@/hooks/use-api';
import { useApiSWR } from '@/hooks/use-api-swr';
import { Button, Section, Stack, Text } from '@trycompai/design-system';
import { Add } from '@trycompai/design-system/icons';
import { ChecklistItemCard } from './ChecklistItemCard';
import { ChecklistItemDialog } from './ChecklistItemDialog';
import { type ChecklistKind, KIND_COPY, TEMPLATE_ENDPOINT, type TemplateItem } from './checklist-template';

export function OffboardingChecklistSettings({ kind = 'offboarding' }: { kind?: ChecklistKind }) {
  const { hasPermission } = usePermissions();
  const canUpdate = hasPermission('organization', 'update');
  const { patch, delete: deleteReq } = useApi();

  const { data, mutate } = useApiSWR<TemplateItem[]>(`${TEMPLATE_ENDPOINT}?kind=${kind}`);
  const items = Array.isArray(data?.data) ? data.data : [];

  // null = closed, 'new' = create, otherwise the item being edited.
  const [editing, setEditing] = useState<TemplateItem | 'new' | null>(null);

  const handleToggleEnabled = async ({
    item,
    next,
  }: {
    item: TemplateItem;
    next: boolean;
  }) => {
    mutate(
      (current) => {
        if (!current) return current;
        return {
          ...current,
          data: Array.isArray(current.data)
            ? current.data.map((i) =>
                i.id === item.id ? { ...i, isEnabled: next } : i,
              )
            : current.data,
        };
      },
      { revalidate: false },
    );

    const res = await patch(
      `${TEMPLATE_ENDPOINT}/${item.id}`,
      { isEnabled: next },
    );

    if (res.error) {
      mutate();
      toast.error('Failed to update checklist item');
      return;
    }

    toast.success(next ? 'Checklist item enabled' : 'Checklist item disabled');
  };

  const handleToggleEvidence = async ({
    item,
    next,
  }: {
    item: TemplateItem;
    next: boolean;
  }) => {
    mutate(
      (current) => {
        if (!current) return current;
        return {
          ...current,
          data: Array.isArray(current.data)
            ? current.data.map((i) =>
                i.id === item.id ? { ...i, evidenceRequired: next } : i,
              )
            : current.data,
        };
      },
      { revalidate: false },
    );

    const res = await patch(
      `${TEMPLATE_ENDPOINT}/${item.id}`,
      { evidenceRequired: next },
    );

    if (res.error) {
      mutate();
      toast.error('Failed to update evidence requirement');
      return;
    }

    toast.success(
      next ? 'Evidence now required' : 'Evidence no longer required',
    );
  };

  const handleDelete = async ({ item }: { item: TemplateItem }) => {
    mutate(
      (current) => {
        if (!current) return current;
        return {
          ...current,
          data: Array.isArray(current.data)
            ? current.data.filter((i) => i.id !== item.id)
            : current.data,
        };
      },
      { revalidate: false },
    );

    const res = await deleteReq(`${TEMPLATE_ENDPOINT}/${item.id}`);

    if (res.error) {
      mutate();
      toast.error('Failed to delete checklist item');
      return;
    }

    toast.success('Checklist item deleted');
  };

  return (
    <Section title={KIND_COPY[kind].title}>
      <Stack gap="md">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Text size="sm" variant="muted">
            {KIND_COPY[kind].description}
          </Text>
          {canUpdate && (
            <div className="shrink-0">
              <Button size="sm" variant="outline" iconLeft={<Add size={16} />} onClick={() => setEditing('new')}>
                Add item
              </Button>
            </div>
          )}
        </div>

        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <Text size="sm" variant="muted">
              No checklist items configured yet.
            </Text>
          </div>
        ) : (
          <Stack gap="sm">
            {items.map((item) => (
              <ChecklistItemCard
                key={item.id}
                item={item}
                dueFrom={KIND_COPY[kind].dueFrom}
                canUpdate={canUpdate}
                onToggleEnabled={handleToggleEnabled}
                onToggleEvidence={handleToggleEvidence}
                onEdit={setEditing}
                onDelete={handleDelete}
              />
            ))}
          </Stack>
        )}
      </Stack>
      <ChecklistItemDialog
        open={editing !== null}
        item={editing === 'new' ? null : editing}
        kind={kind}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={() => void mutate()}
      />
    </Section>
  );
}
