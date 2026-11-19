'use client';

import type { FormImportPreview } from '@/hooks/use-assets';
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@trycompai/design-system';
import { DocumentImport } from '@trycompai/design-system/icons';
import { useState } from 'react';
import { toast } from 'sonner';

/** First run: import the Infrastructure Inventory form when one exists, else explain the sources. */
export function AssetsEmptyState({
  formImport,
  canImport,
  onImportForm,
}: {
  formImport: FormImportPreview | null;
  canImport: boolean;
  onImportForm: () => Promise<string>;
}) {
  const [isImporting, setIsImporting] = useState(false);

  const handleImport = async () => {
    setIsImporting(true);
    try {
      toast.success(await onImportForm());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Import failed');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>No assets yet</EmptyTitle>
        <EmptyDescription>
          {formImport
            ? `Your Infrastructure Inventory form has ${formImport.rows} rows. Import them to start the inventory here: owners, environments, locations and vendors carry over, and the form is no longer needed.`
            : 'Connect AWS, GCP, Azure or GitHub under Integrations and enroll devices with the device agent, then refresh to build the inventory. Add anything else, like office networks or on-prem servers, by hand or from a CSV.'}
        </EmptyDescription>
      </EmptyHeader>
      {formImport && canImport ? (
        <EmptyContent>
          <Button
            iconLeft={<DocumentImport size={16} />}
            loading={isImporting}
            onClick={() => void handleImport()}
          >
            {`Import ${formImport.rows} rows from Infrastructure Inventory`}
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}
