'use client';

import type { AccessRequest } from '@/hooks/use-access-requests';
import type { ColumnDef } from '@tanstack/react-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@trycompai/design-system';
import { OverflowMenuVertical } from '@trycompai/design-system/icons';
import { Badge } from '@trycompai/ui/badge';

export type RequestTableRow = AccessRequest;

interface RequestColumnHandlers {
  onApprove: (row: AccessRequest) => void;
  onDeny: (row: AccessRequest) => void;
  onResendNda: (row: AccessRequest) => void;
  onPreviewNda: (row: AccessRequest) => void;
}

export function buildRequestColumns({
  onApprove,
  onDeny,
  onResendNda,
  onPreviewNda,
}: RequestColumnHandlers): ColumnDef<RequestTableRow>[] {
  return [
    {
      id: 'date',
      accessorKey: 'createdAt',
      header: 'Date',
      cell: ({ row }) => {
        return (
          <span className="text-muted-foreground whitespace-nowrap text-xs">
            {new Date(row.original.createdAt).toLocaleDateString()}
          </span>
        );
      },
    },
    {
      id: 'identity',
      accessorKey: 'email',
      header: 'Identity',
      cell: ({ row }) => {
        return (
          <div className="flex flex-col">
            <span className="font-medium text-sm">{row.original.name}</span>
            <span className="text-muted-foreground text-xs">{row.original.email}</span>
            {row.original.company && (
              <span className="text-muted-foreground text-xs">{row.original.company}</span>
            )}
          </div>
        );
      },
    },
    {
      id: 'purpose',
      accessorKey: 'purpose',
      header: 'Purpose',
      cell: ({ row }) => {
        const purpose = row.original.purpose?.trim();
        if (!purpose) return <span className="text-muted-foreground text-sm">—</span>;
        return (
          <Tooltip>
            <TooltipTrigger
              render={
                <div className="max-w-[160px] truncate text-sm lg:max-w-[240px]" tabIndex={0} />
              }
            >
              {purpose}
            </TooltipTrigger>
            <TooltipContent>
              <div className="max-w-xs whitespace-pre-wrap">{purpose}</div>
            </TooltipContent>
          </Tooltip>
        );
      },
    },
    {
      id: 'duration',
      accessorKey: 'requestedDurationDays',
      header: 'Duration',
      cell: ({ row }) => {
        return <span className="text-sm">{row.original.requestedDurationDays ?? 30}d</span>;
      },
    },
    {
      id: 'status',
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.original.status;
        return (
          <Badge
            variant={
              status === 'approved' ? 'default' : status === 'denied' ? 'destructive' : 'secondary'
            }
            className="capitalize"
          >
            {status.replace('_', ' ')}
          </Badge>
        );
      },
    },
    {
      id: 'ndaCheck',
      accessorKey: 'grant',
      header: 'NDA Status',
      cell: ({ row }) => {
        const ndaPending = row.original.status === 'approved' && !row.original.grant;

        if (ndaPending) {
          return <Badge variant="warning">Pending</Badge>;
        }

        if (row.original.grant) {
          return <Badge variant="default">Signed</Badge>;
        }

        return <span className="text-muted-foreground text-sm">—</span>;
      },
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        const request = row.original;
        const underReview = request.status === 'under_review';
        const ndaPending = request.status === 'approved' && !request.grant;

        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger
                variant="ellipsis"
                aria-label={`Actions for ${request.name || request.email}`}
              >
                <OverflowMenuVertical />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {underReview && (
                  <>
                    <DropdownMenuItem onClick={() => onApprove(request)}>Approve</DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onClick={() => onDeny(request)}>
                      Deny
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                {ndaPending && (
                  <DropdownMenuItem onClick={() => onResendNda(request)}>
                    Resend NDA
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => onPreviewNda(request)}>
                  Preview NDA
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];
}
