import { Injectable, NotFoundException } from '@nestjs/common';
import { db, type EvidenceFormType as DbEvidenceFormType } from '@db';
import type { Archiver } from 'archiver';
import { format } from 'date-fns';
import { loadRequirementDefinitions } from '../../frameworks/frameworks-requirements.helper';
import { PolicyPdfRendererService } from '../../trust-portal/policy-pdf-renderer.service';
import { createFilenameTracker } from './evidence-attachment-streamer';
import { sanitizeFilename } from './evidence-pdf-generator';
import type { OffboardingExportService } from '../../offboarding-checklist/offboarding-export.service';
import {
  appendFolderNative,
  appendRootNative,
  buildIndexCsv,
  buildReadme,
  indexRow,
  NativeIndex,
  type AuditPeriod,
} from './framework-evidence-native-archive';
import {
  folderNativeTitles,
  loadNativeArtifacts,
  nativeForFolder,
  type NativeAccess,
} from './framework-evidence-native';
import { appendDocumentEvidence, loadDocumentBundle, type DocumentBundle } from './framework-evidence-documents';
import { buildRequirementReadme, planRequirementFolders, safeSegment } from './framework-evidence-plan';
import {
  applicabilityBlock,
  applicabilityFor,
  buildApplicabilitySummaryCsv,
  loadApplicability,
  notApplicableText,
} from './framework-evidence-applicability';
import { appendPolicies, loadApprovedPolicies, type ApprovedPolicy } from './framework-evidence-policies';
import { appendRootRecords } from './framework-evidence-records';
import { renderApplicabilityWorksheet } from './framework-evidence-worksheets';
import { loadMappings } from './framework-evidence-mappings';
import { appendTaskEvidence, loadTaskBundle, type TaskBundle } from './framework-evidence-tasks';

export type FrameworkForExport = {
  id: string;
  frameworkId: string | null;
  customFrameworkId: string | null;
  currentVersionId: string | null;
  frameworkName: string;
  organizationName: string;
  primaryColor: string | null;
  /** Top-level folder inside the ZIP; also the download's base filename. */
  root: string;
};

@Injectable()
export class FrameworkEvidenceExportService {
  constructor(private readonly policyPdfRenderer: PolicyPdfRendererService) {}

  /** The framework to export, scoped to the organization. */
  async loadFramework(
    organizationId: string,
    frameworkInstanceId: string,
  ): Promise<FrameworkForExport> {
    const fi = await db.frameworkInstance.findFirst({
      where: { id: frameworkInstanceId, organizationId },
      select: {
        id: true,
        frameworkId: true,
        customFrameworkId: true,
        currentVersionId: true,
        framework: { select: { name: true } },
        customFramework: { select: { name: true } },
        organization: { select: { name: true, primaryColor: true } },
      },
    });
    if (!fi) throw new NotFoundException('Framework not found');

    const frameworkName = fi.framework?.name ?? fi.customFramework?.name ?? 'Framework';
    return {
      ...fi,
      frameworkName,
      organizationName: fi.organization.name,
      primaryColor: fi.organization.primaryColor,
      root: `${sanitizeFilename(fi.organization.name)}_${sanitizeFilename(frameworkName)}_evidence_${format(new Date(), 'yyyy-MM-dd')}`,
    };
  }

  /**
   * Fill `archive` with one folder per framework requirement holding its policies,
   * tasks, documents and platform records (ISMS documents, SoA, registers), its
   * applicability, and for an audit the audit trail and evidence requests. The
   * caller owns the archive and finalizes it.
   */
  async populate({
    archive,
    organizationId,
    framework,
    access = { registers: [], soa: false },
    period = {},
    offboardingExport,
    auditId,
  }: {
    archive: Archiver;
    organizationId: string;
    framework: FrameworkForExport;
    /** Registers / SoA the caller may read; anything else is left out and named in the README. */
    access?: NativeAccess;
    period?: AuditPeriod;
    /** Adds every offboarding's evidence files when the offboarding register is included. */
    offboardingExport?: OffboardingExportService;
    /** An audit of this framework: adds audit-trail.csv and Requests/. */
    auditId?: string;
  }): Promise<void> {
    const { root } = framework;
    const [natives, requirements, mappings, notRelevant, applicability, audit] = await Promise.all([
      loadNativeArtifacts({ organizationId, frameworkId: framework.frameworkId, access }),
      loadRequirementDefinitions(framework),
      loadMappings(framework.id),
      db.evidenceFormSetting.findMany({
        where: { organizationId, isNotRelevant: true },
        select: { formType: true },
      }),
      loadApplicability({ organizationId, frameworkInstanceId: framework.id }),
      auditId
        ? db.auditEngagement.findFirst({
            where: { id: auditId, organizationId, frameworkInstanceId: framework.id },
            select: { id: true, title: true },
          })
        : Promise.resolve(null),
    ]);
    const skippedFormTypes = new Set(notRelevant.map((s) => s.formType));
    const folders = planRequirementFolders({
      requirements,
      frameworkName: framework.frameworkName,
      mappings: mappings.map((m) => ({
        ...m,
        control: {
          ...m.control,
          formTypes: m.control.formTypes.filter((t) => !skippedFormTypes.has(t)),
        },
      })),
    });
    const planned = folders.map((folder) => ({
      folder,
      applicability: applicabilityFor({
        folder,
        frameworkName: framework.frameworkName,
        byRequirement: applicability.byRequirement,
      }),
    }));
    const policies = await loadApprovedPolicies({
      organizationId,
      policyIds: Array.from(new Set(folders.flatMap((f) => f.policyIds))),
    });

    archive.append(
      buildReadme({
        frameworkName: framework.frameworkName,
        organizationName: framework.organizationName,
        natives,
        period,
        unapprovedPolicies: policies.unapproved,
        notApplicable: planned.filter((p) => p.applicability.status === 'not_applicable').length,
        auditTitle: audit?.title,
      }),
      { name: `${root}/README.txt` },
    );
    const nativeIndex = new NativeIndex();
    appendRootNative({ archive, root, natives, index: nativeIndex });
    await appendRootRecords({
      archive,
      root,
      organizationId,
      framework,
      natives,
      offboardingExport,
      auditId: audit?.id,
      requirementLabels: new Map(folders.map((f) => [f.requirement.id, f.folder])),
    });

    // shortcut: rendered PDFs are cached for the whole export (fine for one org's
    // framework); render per folder if policy counts grow enough to pressure memory.
    const renderedPolicies = new Map<string, Buffer>();
    const renderPolicy = (policy: ApprovedPolicy) => {
      const cached = renderedPolicies.get(policy.id);
      if (cached) return cached;
      const pdf = this.policyPdfRenderer.renderPoliciesPdfBuffer(
        [{ name: policy.name, content: policy.content, documentControl: policy.documentControl }],
        framework.organizationName,
        framework.primaryColor,
      );
      renderedPolicies.set(policy.id, pdf);
      return pdf;
    };
    const taskBundles = new Map<string, TaskBundle>();
    const documentBundles = new Map<DbEvidenceFormType, DocumentBundle>();
    const indexRows: string[][] = [];

    for (const { folder, applicability: applies } of planned) {
      const base = `${root}/${folder.folder}`;
      // N/A: the justification is the evidence; nothing else goes in the folder.
      if (applies.status === 'not_applicable') {
        archive.append(
          buildRequirementReadme({
            folder,
            frameworkName: framework.frameworkName,
            applicability: applicabilityBlock(applies),
            policyNames: [],
            taskTitles: [],
            documentTitles: [],
          }),
          { name: `${base}/00-requirement.txt` },
        );
        archive.append(notApplicableText(applies), { name: `${base}/NOT_APPLICABLE.txt` });
        indexRows.push(indexRow({ folder, applies, counts: [0, 0, 0, 0, 0] }));
        continue;
      }

      const folderPolicies = folder.policyIds.flatMap((id) => policies.approved.get(id) ?? []);
      for (const taskId of folder.taskIds) {
        if (!taskBundles.has(taskId)) {
          taskBundles.set(taskId, await loadTaskBundle({ organizationId, taskId, period }));
        }
      }
      for (const formType of folder.formTypes) {
        if (documentBundles.has(formType)) continue;
        documentBundles.set(formType, await loadDocumentBundle({ organizationId, formType, period }));
      }
      const tasks = folder.taskIds.flatMap((id) => taskBundles.get(id) ?? []);
      const documents = folder.formTypes.flatMap((t) => documentBundles.get(t) ?? []);
      const native = nativeForFolder({ folder, natives });

      archive.append(
        buildRequirementReadme({
          folder,
          frameworkName: framework.frameworkName,
          applicability: applicabilityBlock(applies),
          policyNames: folderPolicies.map((p) => `${p.name} (approved v${p.version})`),
          taskTitles: tasks.map((t) => t.title),
          documentTitles: documents.map((d) => d.title),
          nativeTitles: folderNativeTitles(native, natives),
        }),
        { name: `${base}/00-requirement.txt` },
      );
      const worksheet = renderApplicabilityWorksheet({
        folder,
        applicability: applies,
        controlNames: applicability.controlNames,
        framework,
      });
      if (worksheet) archive.append(worksheet.pdf, { name: `${base}/${worksheet.fileName}` });

      await appendPolicies({ archive, folderPath: `${base}/Policies`, policies: folderPolicies, render: renderPolicy });
      const uniqueTaskFolder = createFilenameTracker();
      for (const task of tasks) {
        await appendTaskEvidence({
          archive,
          bundle: task,
          folderPath: `${base}/Tasks/${uniqueTaskFolder(safeSegment(task.title))}`,
        });
      }
      for (const document of documents) {
        await appendDocumentEvidence({
          archive,
          bundle: document,
          folderPath: `${base}/Documents/${safeSegment(document.title)}`,
        });
      }
      appendFolderNative({ archive, root, folder: folder.folder, native, natives, index: nativeIndex });

      indexRows.push(
        indexRow({
          folder,
          applies,
          counts: [
            folderPolicies.length,
            tasks.length,
            documents.length,
            native.isms.length + (native.soa ? 1 : 0),
            native.registers.length,
          ],
        }),
      );
    }

    archive.append(buildIndexCsv(indexRows), { name: `${root}/index.csv` });
    archive.append(buildApplicabilitySummaryCsv(planned), {
      name: `${root}/Applicability summary.csv`,
    });
    archive.append(nativeIndex.toCsv(), { name: `${root}/native-artifacts.csv` });
  }
}

