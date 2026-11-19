'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@trycompai/ui/dropdown-menu';
import { Button } from '@trycompai/design-system';
import {
  Document,
  Edit,
  OverflowMenuVertical,
  TrashCan,
  Upload,
} from '@trycompai/design-system/icons';

interface PolicyVersionActionsProps {
  canPublish: boolean;
  canDelete: boolean;
  canUpdate: boolean;
  isPublished: boolean;
  onPublish: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function PolicyVersionActions({
  canPublish,
  canDelete,
  canUpdate,
  isPublished,
  onPublish,
  onEdit,
  onDelete,
}: PolicyVersionActionsProps) {
  if (!canPublish && !canDelete && !canUpdate) {
    return (
      <Button variant="ghost" size="sm" iconLeft={<Document size={16} />} onClick={onEdit}>
        View
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Version actions">
          <OverflowMenuVertical size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canPublish && (
          <DropdownMenuItem onClick={onPublish}>
            <Upload size={16} className="mr-2" />
            Submit for approval
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onEdit}>
          {isPublished || !canUpdate ? (
            <>
              <Document size={16} className="mr-2" />
              View
            </>
          ) : (
            <>
              <Edit size={16} className="mr-2" />
              Edit
            </>
          )}
        </DropdownMenuItem>
        {canDelete && (
          <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
            <TrashCan size={16} className="mr-2" />
            Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
