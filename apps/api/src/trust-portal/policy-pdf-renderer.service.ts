import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import { renderHousePdf, type HouseKeyValue, type PdfSection } from '../utils/house-pdf';
import { cleanTextForPdf } from './policy-pdf/pdf-text';
import { tiptapToSections } from './policy-pdf/tiptap-to-sections';

export interface PolicyRevisionForPDF {
  version: string;
  date: string;
  approvedBy: string;
  changes: string;
}

export interface PolicyForPDF {
  name: string;
  /** TipTap JSON: a node array or a `{ type: 'doc', content }` object. */
  content: unknown;
  /** Optional document-control rows (owner, version, approver, dates). */
  documentControl?: HouseKeyValue[];
  /** Approved-version history for "Revision history"; [] prints "No approved versions yet." */
  revisions?: PolicyRevisionForPDF[];
  /** Policy status (draft, needs_review, published), shown with the version. */
  status?: string;
}

/** A bundle entry: the policy plus its uploaded PDF, when it has one. */
export interface PolicyBundleItem extends PolicyForPDF {
  id: string;
  uploadedPdf?: Buffer | null;
}

const UPLOADED_NOTE = [
  {
    type: 'paragraph',
    content: [{ type: 'text', text: 'The approved policy document is attached on the following pages.' }],
  },
];

const today = () =>
  new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

/** "Access Control Policy" + "v3" → "POL-ACP-v3". */
function policyCode(name: string, version?: string): string {
  const initials = name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase())
    .join('')
    .slice(0, 5);
  const code = `POL-${initials || 'DOC'}`;
  return version && /^v\d+/.test(version) ? `${code}-${version}` : code;
}

const cleanRows = (rows: HouseKeyValue[]) =>
  rows.map((row) => ({ label: cleanTextForPdf(row.label), value: cleanTextForPdf(row.value) }));

function revisionSection({ revisions, number }: { revisions: PolicyRevisionForPDF[]; number: number }): PdfSection {
  return {
    heading: `${number}. Revision history`,
    table: {
      headers: ['Version', 'Approved', 'Approved by', 'Changes'],
      rows: revisions.map((r) => [r.version, r.date, r.approvedBy, r.changes].map(cleanTextForPdf)),
    },
    emptyText: 'No approved versions yet.',
  };
}

/** "needs_review" → "Needs review". */
const statusLabel = (status?: string) =>
  status ? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ') : '';

/** One classification when every policy shares it, else plain "Internal". */
function bundleClassification(policies: PolicyForPDF[]): string {
  const values = new Set(
    policies.map((p) => p.documentControl?.find((row) => row.label === 'Classification')?.value ?? 'Internal'),
  );
  return values.size === 1 ? cleanTextForPdf([...values][0]) : 'Internal';
}

/**
 * Policies in the house PDF style (same as the ISMS documents): a cover with
 * the document-control table, numbered sections from the TipTap content and
 * the org · classification | code · page footer.
 */
@Injectable()
export class PolicyPdfRendererService {
  private readonly logger = new Logger(PolicyPdfRendererService.name);

  /**
   * One policy → one house document. Several policies → one document whose
   * sections are grouped under each policy's name (bundles with page breaks
   * per policy use renderPolicyBundlePdf).
   */
  renderPoliciesPdfBuffer(
    policies: PolicyForPDF[],
    organizationName?: string,
    primaryColor?: string | null,
    totalPoliciesCount?: number,
  ): Buffer {
    const organization = organizationName ? cleanTextForPdf(organizationName) : null;
    if (policies.length === 1) {
      return this.renderPolicy({ policy: policies[0], organizationName: organization, primaryColor });
    }
    return this.renderBundleCover({
      policies,
      organizationName: organization,
      primaryColor: primaryColor ?? null,
      total: totalPoliciesCount,
      sections: policies.flatMap((policy) => [
        {
          heading: cleanTextForPdf(policy.name || 'Policy'),
          blocks: policy.documentControl?.length
            ? [{ kind: 'keyValues' as const, rows: cleanRows(policy.documentControl) }]
            : [],
          emptyText: '',
        },
        ...tiptapToSections(policy.content),
      ]),
    });
  }

  /**
   * Each policy as its own house document, merged into one PDF. An uploaded
   * PDF gets a house cover page (its document control) and is appended as is;
   * one that cannot be parsed falls back to the rendered content.
   */
  async renderPolicyBundlePdf({
    policies,
    organizationName,
    primaryColor,
  }: {
    policies: PolicyBundleItem[];
    organizationName: string;
    primaryColor: string | null;
  }): Promise<Buffer> {
    const organization = cleanTextForPdf(organizationName);
    const merged = await PDFDocument.create();
    const append = async (pdf: PDFDocument) => {
      const pages = await merged.copyPages(pdf, pdf.getPageIndices());
      for (const page of pages) merged.addPage(page);
    };
    const render = (policy: PolicyForPDF) =>
      PDFDocument.load(this.renderPolicy({ policy, organizationName: organization, primaryColor }));

    if (policies.length > 1) {
      await append(await PDFDocument.load(this.renderBundleCover({ policies, organizationName: organization, primaryColor })));
    }
    for (const policy of policies) {
      if (policy.uploadedPdf) {
        try {
          const uploaded = await PDFDocument.load(policy.uploadedPdf, { ignoreEncryption: true });
          await append(await render({ ...policy, content: UPLOADED_NOTE }));
          await append(uploaded);
          continue;
        } catch (error) {
          this.logger.warn(
            `Failed to parse uploaded PDF for policy ${policy.id}, falling back to content rendering`,
            error instanceof Error ? error.message : String(error),
          );
        }
      }
      await append(await render(policy));
    }
    return Buffer.from(await merged.save());
  }

  /** The bundle's own house cover; `sections` defaults to a table of contents. */
  private renderBundleCover({
    policies,
    organizationName,
    primaryColor,
    total = policies.length,
    sections,
  }: {
    policies: PolicyForPDF[];
    organizationName: string | null;
    primaryColor: string | null;
    total?: number;
    sections?: PdfSection[];
  }): Buffer {
    return renderHousePdf({
      title: 'Policies',
      label: 'Policy bundle',
      documentCode: 'POL-BUNDLE',
      organizationName,
      primaryColor,
      classification: bundleClassification(policies),
      rows: [
        { label: 'Generated', value: today() },
        { label: 'Total policies', value: String(total) },
      ],
      sections: sections ?? [
        {
          heading: 'Contents',
          table: {
            headers: ['No.', 'Policy'],
            rows: policies.map((policy, index) => [String(index + 1), cleanTextForPdf(policy.name)]),
          },
        },
      ],
    });
  }

  private renderPolicy({
    policy,
    organizationName,
    primaryColor,
  }: {
    policy: PolicyForPDF;
    organizationName: string | null;
    primaryColor?: string | null;
  }): Buffer {
    const title = cleanTextForPdf(policy.name || 'Policy');
    const control = cleanRows(policy.documentControl ?? []);
    const version = control.find((row) => row.label === 'Version')?.value;
    const documentCode = policyCode(title, version);
    // "v3 · Published" (or just "Draft" when there is no version yet).
    const subtitle = [...new Set([version, statusLabel(policy.status)].filter(Boolean))].join(' · ');
    const rows = control.map((row) => (row.label === 'Version' && subtitle ? { ...row, value: subtitle } : row));
    const sections = tiptapToSections(policy.content);
    if (policy.revisions) {
      const number = sections.filter((section) => section.heading).length + 1;
      sections.push(revisionSection({ revisions: policy.revisions, number }));
    }
    return renderHousePdf({
      title,
      subtitle,
      label: 'Policy',
      documentCode,
      organizationName,
      primaryColor: primaryColor ?? null,
      classification: control.find((row) => row.label === 'Classification')?.value,
      rows: [
        { label: 'Document ID', value: documentCode },
        { label: 'Document title', value: title },
        ...(rows.length ? rows : [{ label: 'Generated', value: today() }]),
      ],
      sections,
    });
  }
}
