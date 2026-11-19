'use client';

import { usePermissions } from '@/hooks/use-permissions';
import { useVendors, type Vendor } from '@/hooks/use-vendors';
import { Button } from '@trycompai/design-system';
import { DocumentImport, TaskApproved } from '@trycompai/design-system/icons';
import { useState } from 'react';
import { ClassifyVendorsSheet } from './ClassifyVendorsSheet';
import { ImportTpspCsvSheet } from './ImportTpspCsvSheet';

/** Header actions for the register: classify unclassified vendors, import TPSP data. */
export function VendorRegisterActions({ initialVendors }: { initialVendors: Vendor[] }) {
  const { hasPermission } = usePermissions();
  const { data } = useVendors({ initialData: initialVendors });
  const [classifying, setClassifying] = useState(false);
  const [importing, setImporting] = useState(false);
  if (!hasPermission('vendor', 'update')) return null;

  const vendors = Array.isArray(data?.data?.data) ? data.data.data : initialVendors;
  const unclassified = vendors.filter((v) => !v.criticality).length;

  return (
    <>
      {unclassified > 0 && (
        <Button variant="outline" iconLeft={<TaskApproved size={16} />} onClick={() => setClassifying(true)}>
          Classify {unclassified} vendor{unclassified === 1 ? '' : 's'}
        </Button>
      )}
      <Button variant="outline" iconLeft={<DocumentImport size={16} />} onClick={() => setImporting(true)}>
        Import CSV
      </Button>
      <ClassifyVendorsSheet open={classifying} onOpenChange={setClassifying} vendors={vendors} />
      <ImportTpspCsvSheet open={importing} onOpenChange={setImporting} vendors={vendors} />
    </>
  );
}
