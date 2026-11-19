import { formatResponsibilityMatrix } from './tpsp-register-columns';
import { tpspDateUpdate } from './vendor-tpsp-update';

// vendor-tpsp-update imports Prisma helpers from @db; skip the real client.
jest.mock('@db', () => jest.requireActual('@prisma/client'));
import {
  assuranceFromDocument,
  resolveDocumentExpiry,
} from './vendor-assurance';
import {
  ARCHIVE_OR_RENEW_TASK_TITLE,
  CONTRACT_RENEWAL_TASK_TITLE,
  documentRenewalTitle,
  planVendorReminders,
  VENDOR_REVIEW_TASK_TITLE,
  type ReminderVendor,
} from './vendor-reminders';
import {
  reviewCadenceMonths,
  reviewStatus,
  vendorComplianceSummary,
} from './vendor-review-status';

const now = new Date('2026-11-18T00:00:00Z');
const daysFromNow = (days: number) =>
  new Date(now.getTime() + days * 86_400_000);

describe('reviewCadenceMonths', () => {
  it('maps criticality to a cadence', () => {
    const base = { handlesCardholderData: false, affectsCdeSecurity: false };
    expect(reviewCadenceMonths({ ...base, criticality: 'critical' })).toBe(6);
    expect(reviewCadenceMonths({ ...base, criticality: 'low' })).toBe(24);
    expect(reviewCadenceMonths({ ...base, criticality: null })).toBe(12);
  });

  it('caps TPSPs in PCI scope at 12 months (12.8.4)', () => {
    expect(
      reviewCadenceMonths({
        criticality: 'low',
        handlesCardholderData: true,
        affectsCdeSecurity: false,
      }),
    ).toBe(12);
    expect(
      reviewCadenceMonths({
        criticality: 'low',
        handlesCardholderData: false,
        affectsCdeSecurity: true,
      }),
    ).toBe(12);
  });
});

describe('reviewStatus', () => {
  it('classifies review dates', () => {
    const at = (
      nextReviewDue: Date | null,
      lastReviewedAt: Date | null = null,
    ) => reviewStatus({ nextReviewDue, lastReviewedAt, now });
    expect(at(null)).toBe('never_reviewed');
    expect(at(null, daysFromNow(-10))).toBe('current');
    expect(at(daysFromNow(-1))).toBe('overdue');
    expect(at(daysFromNow(10))).toBe('due_soon');
    expect(at(daysFromNow(90))).toBe('current');
  });
});

describe('vendorComplianceSummary', () => {
  it('counts expiring documents and finds the next expiry', () => {
    const summary = vendorComplianceSummary({
      vendor: {
        lastReviewedAt: null,
        nextReviewDue: daysFromNow(200),
        documents: [
          { type: 'soc2_type2', expiresAt: daysFromNow(300) },
          { type: 'pci_aoc', expiresAt: daysFromNow(20) },
          { type: 'dpa', expiresAt: null },
          { type: 'iso27001_certificate', expiresAt: daysFromNow(-5) },
          // Superseded by the newer SOC 2 above: not counted.
          { type: 'soc2_type2', expiresAt: daysFromNow(-50) },
        ],
      },
      now,
    });
    expect(summary).toEqual({
      reviewStatus: 'current',
      nextDocumentExpiry: daysFromNow(-5),
      expiringDocumentsCount: 2,
    });
  });
});

describe('vendor assurance', () => {
  it('defaults assurance report expiry to 12 months after the period', () => {
    expect(
      resolveDocumentExpiry({
        type: 'soc2_type2',
        periodEnd: new Date('2026-03-31T00:00:00Z'),
        expiresAt: null,
      }),
    ).toEqual(new Date('2027-03-31T00:00:00Z'));
    expect(
      resolveDocumentExpiry({
        type: 'dpa',
        periodEnd: new Date('2026-03-31T00:00:00Z'),
        expiresAt: null,
      }),
    ).toBeNull();
  });

  it('updates the vendor only from a newer assurance report', () => {
    const document = {
      type: 'pci_aoc' as const,
      periodStart: null,
      periodEnd: null,
      expiresAt: daysFromNow(300),
    };
    expect(
      assuranceFromDocument({ document, vendor: { assuranceExpiresAt: null } }),
    ).toMatchObject({ assuranceType: 'pci_aoc' });
    expect(
      assuranceFromDocument({
        document,
        vendor: { assuranceExpiresAt: daysFromNow(400) },
      }),
    ).toBeNull();
    expect(
      assuranceFromDocument({
        document: { ...document, type: 'contract' },
        vendor: { assuranceExpiresAt: null },
      }),
    ).toBeNull();
  });
});

describe('planVendorReminders', () => {
  const vendor: ReminderVendor = {
    id: 'vnd_1',
    criticality: 'medium',
    handlesCardholderData: false,
    affectsCdeSecurity: false,
    inherentProbability: 'possible',
    inherentImpact: 'moderate',
    lastReviewedAt: daysFromNow(-360),
    nextReviewDue: daysFromNow(5),
    contractEndDate: null,
    documents: [],
  };

  it('plans a review reminder when the review is due soon', () => {
    const planned = planVendorReminders({
      vendor,
      existingTitles: new Set(),
      now,
    });
    expect(planned.map((p) => p.title)).toEqual([VENDOR_REVIEW_TASK_TITLE]);
  });

  it('never duplicates an existing reminder', () => {
    expect(
      planVendorReminders({
        vendor,
        existingTitles: new Set([VENDOR_REVIEW_TASK_TITLE]),
        now,
      }),
    ).toEqual([]);
  });

  it('asks for a review of never-reviewed TPSPs in PCI scope only', () => {
    const neverReviewed = {
      ...vendor,
      lastReviewedAt: null,
      nextReviewDue: null,
    };
    expect(
      planVendorReminders({
        vendor: neverReviewed,
        existingTitles: new Set(),
        now,
      }),
    ).toEqual([]);
    expect(
      planVendorReminders({
        vendor: { ...neverReviewed, handlesCardholderData: true },
        existingTitles: new Set(),
        now,
      })[0],
    ).toMatchObject({ title: VENDOR_REVIEW_TASK_TITLE, priority: 'high' });
    expect(
      planVendorReminders({
        vendor: { ...neverReviewed, affectsCdeSecurity: true },
        existingTitles: new Set(),
        now,
      }),
    ).toHaveLength(1);
  });

  it('reminds about the latest expiring document per type and ending contracts', () => {
    const planned = planVendorReminders({
      vendor: {
        ...vendor,
        nextReviewDue: daysFromNow(200),
        contractEndDate: daysFromNow(30),
        documents: [
          {
            type: 'soc2_type2',
            name: 'Old SOC 2',
            expiresAt: daysFromNow(-100),
          },
          {
            type: 'soc2_type2',
            name: 'New SOC 2',
            expiresAt: daysFromNow(300),
          },
          { type: 'pci_aoc', name: 'AOC 2025', expiresAt: daysFromNow(-2) },
        ],
      },
      existingTitles: new Set(),
      now,
    });
    expect(planned.map((p) => p.title)).toEqual([
      documentRenewalTitle('pci_aoc'),
      CONTRACT_RENEWAL_TASK_TITLE,
    ]);
    expect(planned[0].priority).toBe('high');
  });

  it('proposes archive or renew once the contract has ended', () => {
    expect(
      planVendorReminders({
        vendor: {
          ...vendor,
          nextReviewDue: daysFromNow(200),
          contractEndDate: daysFromNow(-90),
        },
        existingTitles: new Set(),
        now,
      }).map((p) => p.title),
    ).toEqual([ARCHIVE_OR_RENEW_TASK_TITLE]);
  });

  it('asks for a review of unclassified vendors with a high inherent risk', () => {
    const planned = planVendorReminders({
      vendor: {
        ...vendor,
        criticality: null,
        inherentProbability: 'likely',
        inherentImpact: 'major',
        lastReviewedAt: null,
        nextReviewDue: null,
      },
      existingTitles: new Set(),
      now,
    });
    expect(planned[0]).toMatchObject({ title: VENDOR_REVIEW_TASK_TITLE });
    expect(planned[0].description).toContain('Set its criticality first');
  });

  it('never reminds about archived vendors', () => {
    expect(
      planVendorReminders({
        vendor: { ...vendor, archivedAt: daysFromNow(-1) },
        existingTitles: new Set(),
        now,
      }),
    ).toEqual([]);
  });
});

describe('formatResponsibilityMatrix', () => {
  it('renders valid rows and skips malformed ones', () => {
    expect(
      formatResponsibilityMatrix([
        { requirement: '8.4 MFA', owner: 'shared' },
        { requirement: 1 },
        'junk',
        { requirement: '10.2 Logging', owner: 'tpsp', notes: null },
      ]),
    ).toBe('8.4 MFA: shared; 10.2 Logging: tpsp');
    expect(formatResponsibilityMatrix(null)).toBe('');
  });
});

describe('tpspDateUpdate', () => {
  it('turns date strings into Dates, keeps null and skips undefined', () => {
    expect(
      tpspDateUpdate({
        contractEndDate: '2027-03-31',
        nextReviewDue: null,
        pciStatusCheckedAt: undefined,
      }),
    ).toEqual({
      contractEndDate: new Date('2027-03-31T00:00:00.000Z'),
      nextReviewDue: null,
    });
  });
});
