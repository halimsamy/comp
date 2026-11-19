'use client';

import { useVendor, useVendorActions } from '@/hooks/use-vendors';
import { toast } from 'sonner';
import { ListedCompliance, trustUrlFrom } from './ListedCompliance';
import { VendorDocumentsTab } from './VendorDocumentsTab';
import { VendorReviewsTab } from './VendorReviewsTab';

/**
 * One place for the vendor's security review (ISO 27001 A.5.22, PCI DSS
 * 12.8.4): unverified listed certifications, assurance documents, then the
 * periodic review sign-off and its history.
 */
export function VendorSecurityReviewTab({
  vendorId,
  canUpdate,
}: {
  vendorId: string;
  canUpdate: boolean;
}) {
  const { vendor, mutate } = useVendor(vendorId);
  const { updateVendor } = useVendorActions();

  const handleConfirmPci = async () => {
    try {
      await updateVendor(vendorId, {
        pciStatus: 'compliant',
        pciStatusCheckedAt: new Date().toISOString(),
      });
      await mutate();
      toast.success('PCI DSS status confirmed');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Failed to confirm the status');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {vendor && (
        <ListedCompliance vendor={vendor} canUpdate={canUpdate} onConfirmPci={handleConfirmPci} />
      )}
      <VendorDocumentsTab
        vendorId={vendorId}
        canUpdate={canUpdate}
        trustUrl={trustUrlFrom(vendor?.riskAssessmentData)}
      />
      <VendorReviewsTab vendorId={vendorId} canUpdate={canUpdate} />
    </div>
  );
}
