'use client';

import { useApiSWR } from '@/hooks/use-api-swr';
import { usePermissions } from '@/hooks/use-permissions';
import { useVendorRegisterActions } from '@/hooks/use-vendor-register';
import type { Vendor } from '@/hooks/use-vendors';
import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@trycompai/design-system';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { formatDate } from '../../lib/vendor-tpsp';

/** Vendors taken out of the register (exited or replaced), kept for evidence. */
export function ArchivedVendors({ orgId }: { orgId: string }) {
  const { hasPermission } = usePermissions();
  const { unarchiveVendor } = useVendorRegisterActions();
  const { data, error, isLoading } = useApiSWR<{ data: Vendor[] }>('/v1/vendors?archived=true');
  const [restoring, setRestoring] = useState<string | null>(null);
  const vendors = Array.isArray(data?.data?.data) ? data.data.data : [];

  const handleRestore = async (vendorId: string) => {
    setRestoring(vendorId);
    try {
      await unarchiveVendor(vendorId);
      toast.success('Vendor restored');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Failed to restore vendor');
    } finally {
      setRestoring(null);
    }
  };

  if (isLoading) return <Spinner />;
  if (error || data?.error) {
    return <Text variant="muted">Could not load archived vendors. Refresh to try again.</Text>;
  }
  if (vendors.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No archived vendors</EmptyTitle>
          <EmptyDescription>
            Archive a vendor from its Settings tab when the contract ends. It leaves the register,
            reminders and the trust center, and its history is kept.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const canRestore = hasPermission('vendor', 'update');
  return (
    <div className="max-w-full overflow-x-auto">
      <Table variant="bordered">
        <TableHeader>
          <TableRow>
            <TableHead>NAME</TableHead>
            <TableHead>ARCHIVED</TableHead>
            <TableHead>REASON</TableHead>
            {canRestore && <TableHead>ACTIONS</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {vendors.map((vendor) => (
            <TableRow key={vendor.id}>
              <TableCell>
                <Link href={`/${orgId}/vendors/${vendor.id}`} className="hover:underline">
                  {vendor.name}
                </Link>
              </TableCell>
              <TableCell>{vendor.archivedAt ? formatDate(vendor.archivedAt) : '—'}</TableCell>
              <TableCell>
                <span className="line-clamp-2 text-sm text-muted-foreground">
                  {vendor.archiveReason || '—'}
                </span>
              </TableCell>
              {canRestore && (
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    loading={restoring === vendor.id}
                    disabled={restoring !== null}
                    onClick={() => void handleRestore(vendor.id)}
                  >
                    Restore
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
