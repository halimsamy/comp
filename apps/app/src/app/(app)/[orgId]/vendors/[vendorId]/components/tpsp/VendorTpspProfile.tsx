'use client';

import { useVendor, useVendorActions } from '@/hooks/use-vendors';
import { Badge, Button, Progress } from '@trycompai/design-system';
import { CheckmarkFilled, CircleDash, Edit } from '@trycompai/design-system/icons';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  ASSURANCE_LABEL,
  CRITICALITY_OPTIONS,
  DATA_TYPE_OPTIONS,
  expiryLabel,
  formatDate,
  PCI_STATUS,
  REVIEW_STATUS,
} from '../../../lib/vendor-tpsp';
import { EditTpspProfileSheet } from './EditTpspProfileSheet';
import { tpspChecklist } from './tpsp-checklist';
import { VendorResponsibilityMatrix } from './VendorResponsibilityMatrix';

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5 text-sm">{children}</div>
    </div>
  );
}

const Muted = ({ children }: { children: ReactNode }) => (
  <span className="text-muted-foreground">{children}</span>
);

const yesNo = (value: boolean | undefined) => (value ? 'Yes' : 'No');

/**
 * Vanta-style third-party profile: classification, contract, assurance and
 * PCI DSS 12.8 status at a glance, with a readiness checklist.
 */
export function VendorTpspProfile({
  vendorId,
  canUpdate,
}: {
  vendorId: string;
  canUpdate: boolean;
}) {
  const { vendor, mutate } = useVendor(vendorId);
  const { updateVendor } = useVendorActions();
  const [editing, setEditing] = useState(false);
  if (!vendor) return null;

  const checks = tpspChecklist({ vendor });
  const done = checks.filter((c) => c.done).length;
  const criticality = CRITICALITY_OPTIONS.find((o) => o.value === vendor.criticality);
  const review = REVIEW_STATUS[vendor.reviewStatus ?? 'never_reviewed'];
  const assuranceExpiry = expiryLabel({ expiresAt: vendor.assuranceExpiresAt ?? null });
  const inPciScope = vendor.handlesCardholderData || vendor.affectsCdeSecurity;
  const dataTypes = (vendor.dataTypes ?? []).map(
    (type) => DATA_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type,
  );

  const handleSave = async (payload: Parameters<typeof updateVendor>[1]) => {
    try {
      await updateVendor(vendorId, payload);
      await mutate();
      toast.success('Third-party profile updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update profile');
      throw error;
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-5 rounded-md border border-border bg-background p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-normal tracking-[-0.01em]">Third-party profile</h3>
              {inPciScope && <Badge variant="destructive">PCI DSS scope</Badge>}
            </div>
            <span className="text-xs text-muted-foreground">
              ISO 27001 A.5.19-A.5.22 and PCI DSS 12.8 details for this vendor.
            </span>
          </div>
          {canUpdate && (
            <Button
              variant="outline"
              iconLeft={<Edit size={16} />}
              onClick={() => setEditing(true)}
            >
              Edit profile
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <Fact label="Criticality">
            {criticality ? (
              <Badge variant={criticality.variant}>{criticality.label}</Badge>
            ) : (
              <Muted>Not classified</Muted>
            )}
          </Fact>
          <Fact label="Review">
            <Badge variant={review.variant}>{review.label}</Badge>
            {vendor.nextReviewDue && <Muted>next {formatDate(vendor.nextReviewDue)}</Muted>}
          </Fact>
          <Fact label="Account data / CDE">
            <span>Shares data: {yesNo(vendor.handlesCardholderData)}</span>
            <Muted>· Affects CDE: {yesNo(vendor.affectsCdeSecurity)}</Muted>
          </Fact>
          <Fact label="Data types">
            {dataTypes.length > 0 ? (
              dataTypes.map((t) => (
                <Badge key={t} variant="outline">
                  {t}
                </Badge>
              ))
            ) : (
              <Muted>None recorded</Muted>
            )}
          </Fact>
          <Fact label="Contract">
            {vendor.contractStartDate || vendor.contractEndDate ? (
              <span>
                {formatDate(vendor.contractStartDate)} –{' '}
                {vendor.contractEndDate ? formatDate(vendor.contractEndDate) : 'open-ended'}
              </span>
            ) : (
              <Muted>No dates</Muted>
            )}
          </Fact>
          <Fact label="Contract clauses">
            <span>Security: {yesNo(vendor.securityClausesConfirmed)}</span>
            <Muted>· Confidentiality: {yesNo(vendor.confidentialityClausesConfirmed)}</Muted>
          </Fact>
          <Fact label="Assurance">
            {vendor.assuranceType ? (
              <>
                <span>{ASSURANCE_LABEL[vendor.assuranceType]}</span>
                {vendor.assuranceType !== 'none' && (
                  <Badge variant={assuranceExpiry.variant}>{assuranceExpiry.label}</Badge>
                )}
              </>
            ) : (
              <Muted>Upload a SOC 2, ISO certificate or AOC</Muted>
            )}
          </Fact>
          <Fact label="PCI DSS status">
            {vendor.pciStatus ? (
              <Badge variant={PCI_STATUS[vendor.pciStatus].variant}>
                {PCI_STATUS[vendor.pciStatus].label}
              </Badge>
            ) : (
              <Muted>Not set</Muted>
            )}
            {vendor.pciStatusCheckedAt && (
              <Muted>checked {formatDate(vendor.pciStatusCheckedAt)}</Muted>
            )}
          </Fact>
          {inPciScope && (
            <Fact label="Written acknowledgement">
              {vendor.tpspAcknowledgementDate ? (
                <span>Received {formatDate(vendor.tpspAcknowledgementDate)}</span>
              ) : (
                <Badge variant="destructive">Missing</Badge>
              )}
            </Fact>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">Audit readiness</span>
            <span className="text-muted-foreground">
              {done} of {checks.length} complete
            </span>
          </div>
          <Progress value={(done / checks.length) * 100} />
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {checks.map((check) => (
              <li key={check.id} className="flex items-center gap-2 text-sm">
                {check.done ? (
                  <CheckmarkFilled size={16} className="shrink-0 text-primary" />
                ) : (
                  <CircleDash size={16} className="shrink-0 text-muted-foreground" />
                )}
                <span className={check.done ? '' : 'text-muted-foreground'}>{check.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {inPciScope && (
        <VendorResponsibilityMatrix
          rows={vendor.responsibilityMatrix ?? []}
          canUpdate={canUpdate}
          onSave={(responsibilityMatrix) => handleSave({ responsibilityMatrix })}
        />
      )}

      <EditTpspProfileSheet
        open={editing}
        onOpenChange={setEditing}
        vendor={vendor}
        onSave={handleSave}
      />
    </div>
  );
}
