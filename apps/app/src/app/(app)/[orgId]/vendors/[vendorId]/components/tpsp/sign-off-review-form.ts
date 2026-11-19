import type { SignOffVendorReviewInput, VendorDocument } from '@/hooks/use-vendor-tpsp';
import type { VendorPciStatus } from '@db';
import { z } from 'zod';

const ASSURANCE_TYPES = new Set(['soc2_type1', 'soc2_type2', 'iso27001_certificate', 'pci_aoc']);
const PCI_STATUSES = ['compliant', 'non_compliant', 'in_progress', 'not_applicable', 'unknown'] as const;

/** Mirrors the API rules (vendor-review-rules.ts) so the sheet explains them inline. */
export function signOffSchema({ inPciScope }: { inPciScope: boolean }) {
  return z
    .object({
      outcome: z.enum(['approved', 'approved_with_conditions', 'rejected']),
      assuranceReviewed: z.boolean(),
      pciStatusConfirmed: z.boolean(),
      contractReviewed: z.boolean(),
      riskReassessed: z.boolean(),
      pciStatus: z.enum(PCI_STATUSES).or(z.literal('')),
      reviewedDocumentIds: z.array(z.string()),
      conditions: z.array(z.object({ text: z.string().max(500) })),
      notes: z.string().max(10_000),
      nextReviewDue: z.string(),
    })
    .superRefine((v, ctx) => {
      if (v.pciStatusConfirmed && (!v.pciStatus || v.pciStatus === 'unknown')) {
        ctx.addIssue({
          code: 'custom',
          path: ['pciStatus'],
          message: 'Choose the status you confirmed (not "Unknown")',
        });
      }
      const allChecked =
        v.assuranceReviewed &&
        v.contractReviewed &&
        v.riskReassessed &&
        (!inPciScope || v.pciStatusConfirmed);
      if (v.outcome === 'approved' && !allChecked) {
        ctx.addIssue({
          code: 'custom',
          path: ['outcome'],
          message: 'Approval needs every check. Use "Approved with conditions" for anything open.',
        });
      }
      const conditions = v.conditions.filter((c) => c.text.trim());
      if (v.outcome === 'approved_with_conditions' && conditions.length === 0) {
        ctx.addIssue({ code: 'custom', path: ['conditions'], message: 'Add at least one condition' });
      }
      if (v.outcome === 'rejected' && !v.notes.trim()) {
        ctx.addIssue({ code: 'custom', path: ['notes'], message: 'Explain why the vendor is rejected' });
      }
    });
}

export type SignOffValues = z.infer<ReturnType<typeof signOffSchema>>;

const newestFirst = (a: VendorDocument, b: VendorDocument) =>
  (b.periodEnd ?? b.createdAt).localeCompare(a.periodEnd ?? a.createdAt);

/**
 * Prefill: the newest assurance report is the one reviewed, and the PCI status
 * comes from the newest AOC opinion, else the vendor's current known status.
 */
export function signOffDefaults({
  documents,
  currentPciStatus,
}: {
  documents: VendorDocument[];
  currentPciStatus: VendorPciStatus | null | undefined;
}): SignOffValues {
  const assurance = documents.filter((d) => ASSURANCE_TYPES.has(d.type)).sort(newestFirst);
  const aocOpinion = assurance.find((d) => d.type === 'pci_aoc')?.aiSummary?.opinion;
  const fromAoc =
    aocOpinion === 'compliant' || aocOpinion === 'non_compliant' ? aocOpinion : undefined;
  const known = currentPciStatus && currentPciStatus !== 'unknown' ? currentPciStatus : '';
  return {
    outcome: 'approved',
    assuranceReviewed: false,
    pciStatusConfirmed: false,
    contractReviewed: false,
    riskReassessed: false,
    pciStatus: fromAoc ?? known,
    reviewedDocumentIds: assurance[0] ? [assurance[0].id] : [],
    conditions: [{ text: '' }],
    notes: '',
    nextReviewDue: '',
  };
}

export function toSignOffInput(values: SignOffValues): SignOffVendorReviewInput {
  const conditions =
    values.outcome === 'approved_with_conditions'
      ? values.conditions.map((c) => c.text.trim()).filter(Boolean)
      : [];
  return {
    outcome: values.outcome,
    checklist: {
      assuranceReviewed: values.assuranceReviewed,
      pciStatusConfirmed: values.pciStatusConfirmed,
      contractReviewed: values.contractReviewed,
      riskReassessed: values.riskReassessed,
    },
    pciStatus: values.pciStatusConfirmed && values.pciStatus ? values.pciStatus : undefined,
    reviewedDocumentIds: values.reviewedDocumentIds,
    conditions: conditions.length ? conditions : undefined,
    notes: values.notes.trim() || undefined,
    nextReviewDue: values.nextReviewDue ? new Date(values.nextReviewDue).toISOString() : undefined,
  };
}
