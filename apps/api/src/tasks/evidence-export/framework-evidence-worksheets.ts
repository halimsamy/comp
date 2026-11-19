import type { Applicability } from './framework-evidence-applicability';
import { safeSegment, type RequirementFolder } from './framework-evidence-plan';
import { renderRecordPdf } from './record-pdf';

type Framework = {
  frameworkName: string;
  organizationName: string;
  primaryColor: string | null;
};

/**
 * PCI DSS Appendix C compensating controls worksheet, or the Appendix E
 * customized approach controls matrix, rendered from the structured
 * applicability details. Null for any other applicability.
 */
export function renderApplicabilityWorksheet({
  folder,
  applicability,
  controlNames,
  framework,
}: {
  folder: RequirementFolder;
  applicability: Applicability;
  controlNames: Map<string, string>;
  framework: Framework;
}): { fileName: string; pdf: Buffer } | null {
  const details = applicability.details;
  if (!details || details.kind === 'not_applicable') return null;
  const { identifier, name, description } = folder.requirement;
  const id = identifier || folder.folder;
  const common = {
    clause: id,
    frameworkName: framework.frameworkName,
    organizationName: framework.organizationName,
    primaryColor: framework.primaryColor,
    owner: applicability.setBy || null,
    // The recorded applicability decision is the worksheet's sign-off.
    approverName: applicability.setBy || null,
    approvedAt: applicability.setAt,
    issueDate: applicability.setAt,
  };
  const requirementSection = {
    heading: 'Requirement number and definition',
    paragraphs: [{ label: `${id}: `, text: description || name }],
  };

  if (details.kind === 'compensating_control') {
    const controls = details.compensatingControlIds.map((cid) => controlNames.get(cid) ?? cid);
    return {
      fileName: `CCW - ${safeSegment(id)}.pdf`,
      pdf: renderRecordPdf({
        ...common,
        title: `Compensating Controls Worksheet - ${id}`,
        documentCode: `CCW-${id}`,
        nextReview: `Revalidate by ${details.revalidateAt.slice(0, 10)}`,
        sections: [
          requirementSection,
          { heading: '1. Constraints', paragraphs: [{ text: details.constraints }] },
          {
            heading: '2. Definition of compensating controls',
            intro: applicability.justification ?? undefined,
            bullets: controls,
          },
          { heading: '3. Objective', paragraphs: [{ text: details.objective }] },
          { heading: '4. Identified risk', paragraphs: [{ text: details.identifiedRisk }] },
          {
            heading: '5. Validation of compensating controls',
            paragraphs: [{ text: details.validation }],
          },
          { heading: '6. Maintenance', paragraphs: [{ text: details.maintenance }] },
        ],
      }),
    };
  }

  return {
    fileName: `Customized approach - ${safeSegment(id)}.pdf`,
    pdf: renderRecordPdf({
      ...common,
      title: `Customized Approach Controls Matrix - ${id}`,
      documentCode: `CAM-${id}`,
      sections: [
        requirementSection,
        { heading: 'Customized approach objective', paragraphs: [{ text: details.objective }] },
        {
          heading: 'Controls matrix',
          table: {
            headers: ['Customized control', 'How it meets the objective'],
            rows: details.matrix.map((m) => [m.control, m.howMeetsObjective]),
          },
        },
        {
          heading: 'Targeted risk analysis (PCI DSS 12.3.2)',
          paragraphs: [
            {
              text: `Document submission ${details.targetedRiskAnalysisSubmissionId}; see Documents/ in the 12.3.2 folder.`,
            },
          ],
        },
      ],
    }),
  };
}
