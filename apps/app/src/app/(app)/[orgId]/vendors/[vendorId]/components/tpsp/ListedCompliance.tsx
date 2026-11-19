'use client';

import { parseVendorRiskAssessmentDescription } from '@/components/vendor-risk-assessment/parse-vendor-risk-assessment-description';
import type { Vendor } from '@/hooks/use-vendors';
import type { Prisma } from '@db';
import { Badge, Button } from '@trycompai/design-system';
import { Information } from '@trycompai/design-system/icons';
import { useState } from 'react';

const LISTED: Record<string, string> = {
  pci_dss: 'PCI DSS',
  soc2: 'SOC 2',
  iso27001: 'ISO 27001',
};

/** The vendor's trust center from the research links, if the research found one. */
export function trustUrlFrom(riskAssessmentData: Prisma.JsonValue | null | undefined) {
  if (!riskAssessmentData) return null;
  const data = parseVendorRiskAssessmentDescription(
    typeof riskAssessmentData === 'string'
      ? riskAssessmentData
      : JSON.stringify(riskAssessmentData),
  );
  const link = (data?.links ?? []).find((l) => /trust|security|compliance/i.test(`${l.label} ${l.url}`));
  return link?.url ?? null;
}

/**
 * Certifications the vendor lists publicly but nobody has verified yet. PCI DSS
 * can be confirmed in one click (stamps the 12.8.4 check); SOC 2 / ISO still
 * need the report uploaded.
 */
export function listedCompliance(
  vendor: Pick<Vendor, 'complianceBadges' | 'pciStatus' | 'assuranceType'>,
) {
  return (vendor.complianceBadges ?? [])
    .map((badge) => badge.type)
    .filter((type) => {
      if (type === 'pci_dss') return !vendor.pciStatus || vendor.pciStatus === 'unknown';
      if (type === 'soc2' || type === 'iso27001') return !vendor.assuranceType;
      return false;
    });
}

export function ListedCompliance({
  vendor,
  canUpdate,
  onConfirmPci,
}: {
  vendor: Pick<Vendor, 'complianceBadges' | 'pciStatus' | 'assuranceType'>;
  canUpdate: boolean;
  onConfirmPci: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const listed = listedCompliance(vendor);
  if (listed.length === 0) return null;

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await onConfirmPci();
    } finally {
      setConfirming(false);
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-md border border-dashed border-border bg-muted/30 p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Information size={16} /> Listed as compliant (unverified)
      </div>
      <ul className="flex flex-col gap-2">
        {listed.map((type) => (
          <li key={type} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline">{LISTED[type]}</Badge>
              <span className="text-muted-foreground">
                {type === 'pci_dss'
                  ? 'The vendor says it is PCI DSS compliant. Confirm after checking its AOC or the card brand list.'
                  : 'Upload the report to count it as assurance.'}
              </span>
            </div>
            {type === 'pci_dss' && canUpdate && (
              <div className="shrink-0">
                <Button size="sm" loading={confirming} onClick={() => void handleConfirm()}>
                  Confirm compliant
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
