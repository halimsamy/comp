'use client';

import { usePermissions } from '@/hooks/use-permissions';
import { downloadControlCrosswalkCsv } from '@/lib/evidence-download';
import { Button, HStack } from '@trycompai/design-system';
import { Add, Download } from '@trycompai/design-system/icons';
import { useQueryState } from 'nuqs';
import { type ComponentProps, useState } from 'react';
import { toast } from 'sonner';
import { CreateControlSheet } from './CreateControlSheet';

type CreateOptions = ComponentProps<typeof CreateControlSheet>;

/** "Export crosswalk" (ISO ↔ PCI codes per control, CSV) and "Create control". */
export function ControlsHeaderActions({ options }: { options: CreateOptions }) {
  const { hasPermission } = usePermissions();
  const [, setCreateOpen] = useQueryState('create-control');
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadControlCrosswalkCsv();
    } catch {
      toast.error('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <HStack gap="sm" wrap="wrap">
      <Button
        variant="outline"
        iconLeft={<Download size={16} />}
        loading={exporting}
        onClick={handleExport}
      >
        Export crosswalk
      </Button>
      {hasPermission('control', 'create') && (
        <>
          <Button iconLeft={<Add size={16} />} onClick={() => setCreateOpen('true')}>
            Create control
          </Button>
          <CreateControlSheet {...options} />
        </>
      )}
    </HStack>
  );
}
