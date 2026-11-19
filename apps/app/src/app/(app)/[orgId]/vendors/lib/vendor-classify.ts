import type { Vendor } from '@/hooks/use-vendors';
import { getRiskLevelFromScore, getRiskScore } from '@/lib/risk-score';
import type { VendorCriticality } from '@db';

const CRITICALITY_BY_LEVEL: Record<string, VendorCriticality> = {
  'very-high': 'critical',
  high: 'high',
  medium: 'medium',
  low: 'low',
  'very-low': 'low',
};

const PAYMENT_WORDS =
  /\b(payment|payments|card|cards|acquir\w*|issuer|issuing|psp|gateway|processor|bank|banking|wallet|pci|checkout|tokeni[sz]\w*)\b/i;

export interface ClassificationSuggestion {
  id: string;
  name: string;
  criticality: VendorCriticality;
  handlesCardholderData: boolean;
  affectsCdeSecurity: boolean;
  /** Plain-English reasons shown next to the suggestion. */
  why: string[];
}

/**
 * First-pass classification a human confirms: criticality from the inherent
 * risk level, account data for finance / payment vendors, CDE impact for cloud
 * hosting (PCI DSS 12.8.1 scoping). Existing "yes" answers are never dropped.
 */
export function suggestClassification(
  vendor: Pick<
    Vendor,
    | 'id'
    | 'name'
    | 'description'
    | 'category'
    | 'inherentProbability'
    | 'inherentImpact'
    | 'handlesCardholderData'
    | 'affectsCdeSecurity'
  >,
): ClassificationSuggestion {
  const level = getRiskLevelFromScore(
    getRiskScore(vendor.inherentProbability, vendor.inherentImpact).score,
  );
  const why = [`Inherent risk ${level.replace('-', ' ')}`];
  const payments =
    vendor.category === 'finance' || PAYMENT_WORDS.test(`${vendor.name} ${vendor.description}`);
  const cloud = vendor.category === 'cloud';
  if (payments) why.push('Finance / payments vendor');
  if (cloud) why.push('Cloud hosting');
  return {
    id: vendor.id,
    name: vendor.name,
    criticality: CRITICALITY_BY_LEVEL[level] ?? 'low',
    handlesCardholderData: Boolean(vendor.handlesCardholderData) || payments,
    affectsCdeSecurity: Boolean(vendor.affectsCdeSecurity) || cloud,
    why,
  };
}
