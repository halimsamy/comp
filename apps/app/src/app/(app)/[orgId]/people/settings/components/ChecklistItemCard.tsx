'use client';

import { Button, HStack, Label, Switch, Text } from '@trycompai/design-system';
import { Edit, TrashCan } from '@trycompai/design-system/icons';
import { audienceLabel, type TemplateItem } from './checklist-template';

export function ChecklistItemCard({
  item,
  dueFrom,
  canUpdate,
  onToggleEnabled,
  onToggleEvidence,
  onEdit,
  onDelete,
}: {
  item: TemplateItem;
  dueFrom: string;
  canUpdate: boolean;
  onToggleEnabled: (args: { item: TemplateItem; next: boolean }) => void;
  onToggleEvidence: (args: { item: TemplateItem; next: boolean }) => void;
  onEdit: (item: TemplateItem) => void;
  onDelete: (args: { item: TemplateItem }) => void;
}) {
  const audience = audienceLabel(item);
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Text weight="medium">{item.title}</Text>
          {item.isDefault && <div className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">Default</div>}
          {item.autoCompleteSource && (
            <div className="rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">Automatic</div>
          )}
        </div>
        {item.dueDays !== null && item.dueDays !== undefined && (
          <Text size="xs" variant="muted">
            Due {item.dueDays === 0 ? 'on' : `${item.dueDays} days after`} the {dueFrom}
          </Text>
        )}
        {audience && (
          <Text size="xs" variant="muted">
            Only for {audience}
          </Text>
        )}
        {item.description ? (
          <Text size="sm" variant="muted">
            {item.description}
          </Text>
        ) : null}
        <div className="mt-2">
          <HStack gap="sm">
            <Label htmlFor={`evidence-${item.id}`}>
              <Text size="sm">Evidence required</Text>
            </Label>
            <Switch
              id={`evidence-${item.id}`}
              checked={item.evidenceRequired}
              disabled={!canUpdate || !item.isEnabled}
              onCheckedChange={(next) => onToggleEvidence({ item, next: Boolean(next) })}
              aria-label={`Evidence required for ${item.title}`}
            />
          </HStack>
        </div>
      </div>
      <HStack gap="sm">
        <Switch
          checked={item.isEnabled}
          disabled={!canUpdate}
          onCheckedChange={(next) => onToggleEnabled({ item, next: Boolean(next) })}
          aria-label={`Enable ${item.title}`}
        />
        {canUpdate && (
          <Button variant="ghost" size="icon-sm" onClick={() => onEdit(item)} aria-label={`Edit ${item.title}`}>
            <Edit size={16} />
          </Button>
        )}
        {!item.isDefault && canUpdate && (
          <Button variant="ghost" size="icon-sm" onClick={() => onDelete({ item })} aria-label={`Delete ${item.title}`}>
            <TrashCan size={16} />
          </Button>
        )}
      </HStack>
    </div>
  );
}
